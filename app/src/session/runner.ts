import type { Grade } from 'ts-fsrs';
import {
  ENGINE_CONFIG,
  blockBoundary,
  blockGuideLevel,
  buildSession,
  deriveStatus,
  gradeAnswer,
  inLearningStep,
  initialScope,
  isFrontier,
  isMastered,
  median,
  nextGuideLevel,
  rollingAccuracy,
  scheduleRetry,
  sessionLength,
  speedTargets,
  updateScope,
  type CardRecord,
  type GuideLevel,
  type EntryKind,
  type Item,
  type Scheduler,
  type ScopeState,
  type SessionEntry,
  type Settings,
  type Skill,
  type SkillStateRecord,
  type SkillStatus,
} from '../engine';
import type { CardKind, GamificationEvent } from '../engine/gamification';
import { orderFrontier } from '../engine/frontier';
import { overlayStatus, type StatusOverlay } from '../engine/overlay';
import { SessionGuides } from '../engine/guides';
import type { AnyDrillType, DrillCheck, DrillSounds } from '../drills/types';
import {
  allCards,
  allConfusions,
  finishSessionLog,
  getSkillStates,
  putSkillState,
  recentReviews,
  recordAnswer,
  startSessionLog,
  type FretworkDB,
} from '../storage';
import { getTuning } from '../theory/tunings';
import {
  addAnswerProgress,
  answersToday,
  countedMinutes,
  finishSessionProgress,
  stretchEntries,
  xpKindOf,
} from './gamification-bridge';
import { createDrillPicker, factOf, type DrillPicker } from './drill-picker';
import { focusFilter, type SessionFocus } from './focus';

/**
 * Runs one practice session end to end: plans it with the session builder,
 * serves prompts through drill plugins, grades with correctness + speed,
 * schedules with FSRS and persists every answer (design §3). Each answer
 * also earns XP and daily-goal minutes, and finishing settles the streak
 * (design §3.7, via `gamification-bridge.ts`).
 *
 * The session lasts its time budget (§3.3). A card that FSRS puts in a
 * learning step due before the budget ends comes back once it is due, after
 * any new block in progress. A queue that runs dry early is planned again
 * from what is left: cards that came due, unseen frontier items, then
 * stretch items.
 *
 * A focus (`focus.ts`) narrows all of that to some skills or items. Gating
 * still looks at every skill, so a focus can't unlock anything.
 *
 * A status overlay (the development build's "unlock every skill", M1-36)
 * widens the frontier for this session only. New items of a skill that only
 * the overlay put there are a sandbox: graded and scheduled in memory, but no
 * card, review log, skill state, XP or minutes are written, and they don't
 * count in the session log, so real progress is as it was. A card that was
 * already stored is real data, so its reviews are stored as usual.
 */

export interface RunnerDeps {
  db: FretworkDB;
  scheduler: Scheduler;
  settings: Settings;
  skills: readonly Skill[];
  drills: readonly AnyDrillType[];
  now?: () => Date;
  rng?: () => number;
  /** Override the time-budget-derived length (tests, quick drills). */
  maxItems?: number;
  /** Serve only these skills or items ("Practise this now", "Quiz me on this"). */
  focus?: SessionFocus | null;
  /** Override the settings' time budget in minutes (quick drills). */
  minutes?: number;
  /** Plan due reviews only, with no new or stretch items (the Today warm-up). */
  reviewOnly?: boolean;
  /** A view-only status overlay (the development build's "unlock every skill"). */
  overlay?: StatusOverlay | null;
}

export interface CurrentPrompt {
  index: number;
  entry: SessionEntry;
  drill: AnyDrillType;
  prompt: unknown;
  guideLevel: GuideLevel;
}

export interface AnswerResult {
  result: DrillCheck;
  rating: Grade;
  sounds: DrillSounds;
  xp: number;
  /** This answer reached today's daily goal. */
  goalReached: boolean;
}

export interface SessionSummary {
  itemsSeen: number;
  correct: number;
  accuracy: number;
  newItems: number;
  durationMs: number;
  /** Skills whose status or guide level improved this session. */
  improvedSkills: string[];
  xp: number;
  /** Minutes this session counted toward the daily goal. */
  minutes: number;
  /** Today's daily goal is met (now or earlier today). */
  goalMet: boolean;
  /** The goal was reached during this session. */
  goalReached: boolean;
  /** The streak after finishing. */
  streak: number;
  /** Gamification events logged at finish (`session-complete`, streak events). */
  events: GamificationEvent[];
}

const DEFAULT_GUIDE: GuideLevel = 3;

/**
 * Plans entries from the cards as they stand at `at`, for `minutes` of
 * practice. Items in `seen` (already served this session) are never stretch items.
 */
type Planner = (
  at: Date,
  minutes: number,
  cards: readonly CardRecord[],
  seen: ReadonlySet<string>,
  maxItems?: number,
) => SessionEntry[];

/** The drill that last served each item more than one drill can serve, from the review log. */
async function lastDrills(
  db: FretworkDB,
  cards: readonly CardRecord[],
  picker: DrillPicker,
): Promise<Map<string, string>> {
  const ids = cards
    .filter((c) => picker.candidates({ id: c.itemId, skillId: c.skillId }).length > 1)
    .map((c) => c.itemId);
  if (ids.length === 0) return new Map();
  const logs = await db.reviewLogs.where('itemId').anyOf(ids).sortBy('at');
  return new Map(logs.map((l) => [l.itemId, l.drillType]));
}

export class SessionRunner {
  private queue: SessionEntry[];
  private index = 0;
  private current: CurrentPrompt | null = null;
  private scopes = new Map<string, ScopeState>();
  private cards: Map<string, CardRecord>;
  /** Stored answers; sandboxed ones are counted apart and never logged. */
  private answered = 0;
  private correct = 0;
  private sandboxedAnswers = 0;
  private newItems = new Set<string>();
  private touchedSkills = new Set<string>();
  /** The XP kind of each planned item; retries look theirs up here. */
  private readonly kinds = new Map<string, CardKind>();
  private xp = 0;
  private minutes = 0;
  private lastTick: Date;
  private goalReached = false;
  private readonly startedAt: Date;
  private readonly targets;
  private readonly guides: SessionGuides;
  private finished: SessionSummary | null = null;
  /** Items in an FSRS learning step, waiting until they are due again. */
  private readonly steps = new Map<string, { entry: SessionEntry; due: Date }>();
  /** The drill that last served each item, so the picker can vary it. */
  private readonly lastDrill: Map<string, string>;
  /** Items with a stored card when the session started: real data, never sandboxed. */
  private readonly storedAtStart: ReadonlySet<string>;

  private constructor(
    private readonly deps: RunnerDeps,
    private readonly planner: Planner,
    private readonly picker: DrillPicker,
    cards: CardRecord[],
    private readonly skillStates: Map<string, SkillStateRecord>,
    private readonly sessionLogId: number,
    lastDrill: Map<string, string>,
    /** Skills on the frontier only through the overlay: their new items aren't stored. */
    private readonly sandbox: ReadonlySet<string>,
  ) {
    this.cards = new Map(cards.map((c) => [c.itemId, c]));
    this.storedAtStart = new Set(this.cards.keys());
    this.startedAt = this.now();
    this.lastTick = this.startedAt;
    this.lastDrill = lastDrill;
    this.queue = [];
    this.adopt(planner(this.startedAt, this.budgetMinutes, cards, new Set(), deps.maxItems));
    this.targets = speedTargets(deps.settings.latencyBaselineMs);
    this.guides = new SessionGuides(this.targets);
  }

  /** Append planned entries, noting the XP kind each item first appears as. */
  private adopt(entries: readonly SessionEntry[]): void {
    for (const e of entries) {
      if (e.kind !== 'retry' && !this.kinds.has(e.itemId)) {
        this.kinds.set(e.itemId, xpKindOf(e.kind));
      }
      this.steps.delete(e.itemId);
    }
    this.queue.push(...entries);
  }

  static async start(deps: RunnerDeps): Promise<SessionRunner> {
    const now = (deps.now ?? (() => new Date()))();
    const [cards, states, confusions] = await Promise.all([
      allCards(deps.db),
      getSkillStates(deps.db),
      allConfusions(deps.db),
    ]);
    const statuses = new Map<string, SkillStatus>(
      [...states.values()].map((s) => [s.skillId, s.status]),
    );
    // Skills may list items whose drill isn't built yet; plan only what a drill can test.
    const picker = createDrillPicker(deps.skills, deps.drills);
    const inFocus = focusFilter(deps.focus);
    const serves = (item: Item) => inFocus(item) && picker.canServe(item);
    const frontierSkills = new Set<string>();
    const frontierInOrder: Skill[] = [];
    const sandbox = new Set<string>();
    for (const skill of deps.skills) {
      const status = deriveStatus(skill, statuses, statuses.get(skill.id));
      statuses.set(skill.id, status);
      if (!isFrontier(overlayStatus(status, deps.overlay))) continue;
      if (!isFrontier(status)) sandbox.add(skill.id);
      frontierSkills.add(skill.id);
      frontierInOrder.push(skill);
    }
    // The goal profile reorders frontier skills (design §3.3 step 2).
    const frontier: Item[] = deps.reviewOnly
      ? []
      : orderFrontier(frontierInOrder, deps.settings.goal).flatMap((skill) =>
          skill.items().filter(serves),
        );
    const tuning = getTuning(deps.settings.tuning);
    const ctx = { tuning, accidentalPref: deps.settings.accidentalPref };

    // The runner updates this map as it serves, so replans key items to their next drill.
    const lastDrill = await lastDrills(deps.db, cards, picker);

    const planner: Planner = (at, minutes, known, seen, maxItems) => {
      const servable = known.filter((c) => serves({ id: c.itemId, skillId: c.skillId }));
      const skillOf = new Map(servable.map((c) => [c.itemId, c.skillId]));
      const plan = buildSession({
        now: at,
        minutes,
        cards: servable,
        frontier,
        scheduler: deps.scheduler,
        confusions,
        conceptOf: (itemId) => {
          const skillId = skillOf.get(itemId);
          if (skillId === undefined) return null;
          const item = { id: itemId, skillId };
          return picker.pick(item)?.conceptOf(item, ctx) ?? null;
        },
        factOf: (item) => factOf(item, tuning),
        drillOf: (itemId) => {
          const skillId = skillOf.get(itemId);
          if (skillId === undefined) return null;
          return picker.pick({ id: itemId, skillId }, lastDrill.get(itemId))?.id ?? null;
        },
        rng: deps.rng ?? Math.random,
        ...(maxItems !== undefined ? { maxItems } : {}),
      });
      // The due and new queue ran dry: top up with stretch items, never stable ones (§3.7).
      const total = maxItems ?? sessionLength(minutes);
      plan.push(
        ...stretchEntries({
          cards: servable,
          frontierSkills,
          planned: new Set([...seen, ...plan.map((e) => e.itemId)]),
          scheduler: deps.scheduler,
          now: at,
          count: deps.reviewOnly ? 0 : total - plan.length,
        }),
      );
      return plan;
    };

    const logId = await startSessionLog(deps.db, now);
    return new SessionRunner(deps, planner, picker, cards, states, logId, lastDrill, sandbox);
  }

  private get budgetMinutes(): number {
    return this.deps.minutes ?? this.deps.settings.sessionMinutes;
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  get length(): number {
    return this.queue.length;
  }

  get position(): number {
    return this.index;
  }

  get isFinished(): boolean {
    return this.finished !== null;
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /** The time budget is spent or the queue is exhausted. */
  get isOver(): boolean {
    return this.index >= this.queue.length || this.remainingMs === 0;
  }

  /** When the time budget runs out. */
  get endsAt(): Date {
    return new Date(this.startedAt.getTime() + this.budgetMinutes * 60_000);
  }

  /** Time left in the budget, never negative. */
  get remainingMs(): number {
    return Math.max(0, this.endsAt.getTime() - this.now().getTime());
  }

  private drillFor(entry: SessionEntry): AnyDrillType {
    const item = { id: entry.itemId, skillId: entry.skillId };
    const drill = this.picker.pick(item, this.lastDrill.get(item.id));
    if (!drill) throw new Error(`No drill can test ${entry.itemId}`);
    return drill;
  }

  private scope(drill: AnyDrillType): ScopeState {
    let s = this.scopes.get(drill.id);
    if (!s) {
      s = initialScope(drill.scope.minLevel);
      this.scopes.set(drill.id, s);
    }
    return s;
  }

  currentPrompt(): CurrentPrompt | null {
    if (this.isOver) return null;
    if (this.current && this.current.index === this.index) return this.current;
    const entry = this.queue[this.index] as SessionEntry;
    const drill = this.drillFor(entry);
    const prompt = drill.makePrompt(
      { id: entry.itemId, skillId: entry.skillId },
      {
        tuning: getTuning(this.deps.settings.tuning),
        accidentalPref: this.deps.settings.accidentalPref,
        scopeLevel: this.scope(drill).level,
        rng: this.deps.rng ?? Math.random,
      },
    );
    const skillLevel = this.skillStates.get(entry.skillId)?.guideLevel ?? DEFAULT_GUIDE;
    // The skill's level is live: `SessionGuides` fades and restores it per answer.
    // New-block reps fade from the worked example's full guides down to it.
    const guideLevel = entry.guided
      ? 3
      : entry.rep !== undefined
        ? blockGuideLevel(entry.rep, ENGINE_CONFIG.session.newBlockReps, skillLevel)
        : skillLevel;
    this.current = { index: this.index, entry, drill, prompt, guideLevel };
    return this.current;
  }

  async answer(answer: unknown, elapsedMs: number): Promise<AnswerResult> {
    // A prompt already on screen can still be answered once the time budget runs out.
    const cur = this.current?.index === this.index ? this.current : this.currentPrompt();
    if (!cur) throw new Error('No active prompt');
    const { entry, drill, prompt } = cur;
    const responseMs = drill.gradedResponseMs?.(prompt, answer, elapsedMs) ?? elapsedMs;
    const now = this.now();
    const result = drill.check(prompt, answer);
    const rating = gradeAnswer(
      { correct: result.correct, responseMs, hintUsed: entry.guided },
      this.targets,
    );

    const item = { id: entry.itemId, skillId: entry.skillId };
    const existing = this.cards.get(item.id);
    if (!existing) this.newItems.add(item.id);
    const card = this.deps.scheduler.review(
      existing ?? this.deps.scheduler.newCard(item, now),
      rating,
      now,
    );
    this.cards.set(item.id, card);
    this.lastDrill.set(item.id, drill.id);

    // A new item of an overlay-only skill is a sandbox: kept in memory, never stored.
    const sandboxed = this.sandbox.has(item.skillId) && !this.storedAtStart.has(item.id);
    const minutes = sandboxed ? this.skipTick(now) : this.tick(now);
    const db = this.deps.db;
    // The answer and the XP it earned are stored together or not at all.
    const progress = sandboxed
      ? { xp: 0, goalReached: false }
      : await db.transaction(
          'rw',
          [
            db.cards,
            db.reviewLogs,
            db.confusions,
            db.gamification,
            db.dailyProgress,
            db.gamificationEvents,
          ],
          async () => {
            const answeredToday = await answersToday(db, item.id, now);
            await recordAnswer(db, {
              card,
              log: {
                itemId: item.id,
                skillId: item.skillId,
                drillType: drill.id,
                correct: result.correct,
                responseMs: Math.round(responseMs),
                rating,
                hintUsed: entry.guided,
                answerGiven: drill.describeAnswer(answer),
                at: now,
              },
              ...(result.confusedWith
                ? {
                    confusion: {
                      expected: result.concept ?? result.expected,
                      given: result.confusedWith,
                    },
                  }
                : {}),
            });
            return addAnswerProgress(db, {
              itemId: item.id,
              skillId: item.skillId,
              correct: result.correct,
              rating,
              kind: this.kindOf(entry.kind, item.id),
              stabilityDays: existing?.fsrs.stability ?? 0,
              answeredToday,
              minutes,
              at: now,
            });
          },
        );
    this.xp += progress.xp;
    if (progress.goalReached) this.goalReached = true;

    const state = this.skillStates.get(item.skillId) ?? {
      skillId: item.skillId,
      status: 'unlocked' as const,
      guideLevel: DEFAULT_GUIDE,
      rollingAccuracy: 0,
    };
    if (state.status === 'unlocked' || state.status === 'locked') state.status = 'practising';
    // Guides fade and return within the session too (design §3.5).
    state.guideLevel = this.guides.record(item.skillId, state.guideLevel, {
      correct: result.correct,
      responseMs,
      hintUsed: entry.guided,
    });
    this.skillStates.set(item.skillId, state);
    if (!sandboxed) this.touchedSkills.add(item.skillId);

    // Guided reps are worked examples, not evidence of recall, for scope purposes.
    if (!entry.guided) {
      this.scopes.set(drill.id, updateScope(this.scope(drill), result.correct, drill.scope).state);
    }
    if (sandboxed) this.sandboxedAnswers++;
    else {
      this.answered++;
      if (result.correct) this.correct++;
    }
    if (!result.correct) this.queue = scheduleRetry(this.queue, this.index);
    // A learning step due before the budget ends comes back this session,
    // unless the item is already queued again (a later rep or a retry).
    const queued = this.queue.slice(this.index + 1).some((e) => e.itemId === item.id);
    if (!queued && inLearningStep(card, this.endsAt)) {
      this.steps.set(item.id, {
        entry: { itemId: item.id, skillId: item.skillId, kind: 'review', guided: false },
        due: card.fsrs.due,
      });
    } else {
      this.steps.delete(item.id);
    }

    return {
      result,
      rating,
      sounds: drill.sounds(prompt, { answer, result }),
      xp: progress.xp,
      goalReached: progress.goalReached,
    };
  }

  private kindOf(kind: EntryKind, itemId: string): CardKind {
    return kind === 'retry' ? (this.kinds.get(itemId) ?? 'due') : xpKindOf(kind);
  }

  /** Daily-goal minutes since the last tick, capped for idle gaps. */
  private tick(now: Date): number {
    const minutes = countedMinutes(this.lastTick, now);
    this.lastTick = now;
    this.minutes += minutes;
    return minutes;
  }

  /** Move the clock on without counting the time (sandboxed answers). */
  private skipTick(now: Date): number {
    this.lastTick = now;
    return 0;
  }

  next(): void {
    this.index++;
    if (this.remainingMs === 0) return;
    const now = this.now();
    this.serveDueSteps(now);
    // Time is left but the plan ran out: plan again from what is left. A
    // fixed-length session (`maxItems`) ends with its plan.
    if (this.index >= this.queue.length && this.deps.maxItems === undefined) {
      const minutes = this.remainingMs / 60_000;
      const seen = new Set(this.queue.map((e) => e.itemId));
      this.adopt(this.planner(now, minutes, [...this.cards.values()], seen));
    }
  }

  /** Learning steps that have come due go next, after any new block in progress. */
  private serveDueSteps(now: Date): void {
    const due = [...this.steps.values()]
      .filter((s) => s.due.getTime() <= now.getTime())
      .sort((a, b) => a.due.getTime() - b.due.getTime());
    if (due.length === 0) return;
    const at = blockBoundary(this.queue, this.index);
    for (const { entry } of due) this.steps.delete(entry.itemId);
    this.queue.splice(at, 0, ...due.map((s) => s.entry));
  }

  /** Close the session: update skill guide levels and mastery, and the session log. */
  async finish(): Promise<SessionSummary> {
    if (this.finished) return this.finished;
    const improved: string[] = [];
    for (const skillId of this.touchedSkills) {
      const state = this.skillStates.get(skillId) as SkillStateRecord;
      const skill = this.deps.skills.find((s) => s.id === skillId);
      const logs = await recentReviews(this.deps.db, skillId, ENGINE_CONFIG.mastery.recentReviews);
      const graded = logs.filter((l) => !l.hintUsed);
      const accuracy = rollingAccuracy(graded.map((l) => l.correct));
      const rt = median(graded.filter((l) => l.correct).map((l) => l.responseMs));
      const before = { ...state, guideLevel: this.guides.startLevel(skillId, state.guideLevel) };
      state.rollingAccuracy = accuracy;
      // The across-session step only applies when the session itself left the level alone.
      if (
        graded.length >= ENGINE_CONFIG.adaptive.minAnswers &&
        state.guideLevel === before.guideLevel
      ) {
        state.guideLevel = nextGuideLevel(state.guideLevel, accuracy, rt, this.targets);
      }
      if (skill) {
        const cards = skill.items().flatMap((i) => this.cards.get(i.id) ?? []);
        const mastered = isMastered({
          itemCount: skill.items().length,
          cards,
          recentResponseMs: graded.filter((l) => l.correct).map((l) => l.responseMs),
          targets: this.targets,
        });
        if (mastered) state.status = 'mastered';
      }
      if (
        state.guideLevel < before.guideLevel ||
        (state.status === 'mastered' && before.status !== 'mastered')
      ) {
        improved.push(skillId);
      }
      await putSkillState(this.deps.db, state);
    }
    const endedAt = this.now();
    const accuracy = this.answered === 0 ? 0 : this.correct / this.answered;
    await finishSessionLog(this.deps.db, this.sessionLogId, {
      endedAt,
      itemsSeen: this.answered,
      accuracy,
    });
    // A session of sandboxed answers only counts no time at all.
    const sandboxOnly = this.answered === 0 && this.sandboxedAnswers > 0;
    const trailing = sandboxOnly ? this.skipTick(endedAt) : this.tick(endedAt);
    const progress = await finishSessionProgress(this.deps.db, {
      sessionId: this.sessionLogId,
      at: endedAt,
      minutes: trailing,
      sessionMinutes: this.minutes,
      xp: this.xp,
      itemsSeen: this.answered,
      accuracy,
    });
    this.finished = {
      itemsSeen: this.answered,
      correct: this.correct,
      accuracy,
      newItems: this.newItems.size,
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      improvedSkills: improved,
      xp: this.xp,
      minutes: this.minutes,
      goalMet: progress.goalMet,
      goalReached: this.goalReached || progress.goalReached,
      streak: progress.state.streakCurrent,
      events: progress.events,
    };
    return this.finished;
  }
}
