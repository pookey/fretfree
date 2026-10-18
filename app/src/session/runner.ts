import type { Grade } from 'ts-fsrs';
import {
  ENGINE_CONFIG,
  buildSession,
  deriveStatus,
  gradeAnswer,
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

/**
 * Runs one practice session end to end: plans it with the session builder,
 * serves prompts through drill plugins, grades with correctness + speed,
 * schedules with FSRS and persists every answer (design §3). Each answer
 * also earns XP and daily-goal minutes, and finishing settles the streak
 * (design §3.7, via `gamification-bridge.ts`).
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

export class SessionRunner {
  private queue: SessionEntry[];
  private index = 0;
  private current: CurrentPrompt | null = null;
  private scopes = new Map<string, ScopeState>();
  private cards: Map<string, CardRecord>;
  private answered = 0;
  private correct = 0;
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

  private constructor(
    private readonly deps: RunnerDeps,
    plan: SessionEntry[],
    cards: CardRecord[],
    private readonly skillStates: Map<string, SkillStateRecord>,
    private readonly sessionLogId: number,
  ) {
    this.queue = plan;
    this.cards = new Map(cards.map((c) => [c.itemId, c]));
    this.startedAt = this.now();
    this.lastTick = this.startedAt;
    for (const e of plan) {
      if (e.kind !== 'retry' && !this.kinds.has(e.itemId)) {
        this.kinds.set(e.itemId, xpKindOf(e.kind));
      }
    }
    this.targets = speedTargets(deps.settings.latencyBaselineMs);
    this.guides = new SessionGuides(this.targets);
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
    const servable = (item: Item) => {
      const skill = deps.skills.find((s) => s.id === item.skillId);
      return deps.drills.some((d) => skill?.drillTypes.includes(d.id) && d.canTest(item));
    };
    const frontierSkills = new Set<string>();
    const frontierInOrder: Skill[] = [];
    for (const skill of deps.skills) {
      const status = deriveStatus(skill, statuses, statuses.get(skill.id));
      statuses.set(skill.id, status);
      if (!isFrontier(status)) continue;
      frontierSkills.add(skill.id);
      frontierInOrder.push(skill);
    }
    // The goal profile reorders frontier skills (design §3.3 step 2).
    const frontier: Item[] = orderFrontier(frontierInOrder, deps.settings.goal).flatMap((skill) =>
      skill.items().filter(servable),
    );
    const tuning = getTuning(deps.settings.tuning);
    const drillFor = (skillId: string) => {
      const skill = deps.skills.find((s) => s.id === skillId);
      return deps.drills.find((d) => skill?.drillTypes.includes(d.id));
    };
    const servableCards = cards.filter((c) => servable({ id: c.itemId, skillId: c.skillId }));
    const plan = buildSession({
      now,
      minutes: deps.settings.sessionMinutes,
      cards: servableCards,
      frontier,
      scheduler: deps.scheduler,
      confusions,
      conceptOf: (itemId) => {
        const card = cards.find((c) => c.itemId === itemId);
        const drill = card ? drillFor(card.skillId) : undefined;
        return drill && card
          ? drill.conceptOf(
              { id: itemId, skillId: card.skillId },
              { tuning, accidentalPref: deps.settings.accidentalPref },
            )
          : null;
      },
      ...(deps.maxItems !== undefined ? { maxItems: deps.maxItems } : {}),
    });
    // The due and new queue ran dry: top up with stretch items, never stable ones (§3.7).
    const total = deps.maxItems ?? sessionLength(deps.settings.sessionMinutes);
    plan.push(
      ...stretchEntries({
        cards: servableCards,
        frontierSkills,
        planned: new Set(plan.map((e) => e.itemId)),
        scheduler: deps.scheduler,
        now,
        count: total - plan.length,
      }),
    );
    const logId = await startSessionLog(deps.db, now);
    return new SessionRunner(deps, plan, cards, states, logId);
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
    const budgetMs = this.deps.settings.sessionMinutes * 60_000;
    return (
      this.index >= this.queue.length || this.now().getTime() - this.startedAt.getTime() >= budgetMs
    );
  }

  private drillFor(entry: SessionEntry): AnyDrillType {
    const skill = this.deps.skills.find((s) => s.id === entry.skillId);
    const item = { id: entry.itemId, skillId: entry.skillId };
    const drill = this.deps.drills.find((d) => skill?.drillTypes.includes(d.id) && d.canTest(item));
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
    const guideLevel = entry.guided
      ? 3
      : (this.skillStates.get(entry.skillId)?.guideLevel ?? DEFAULT_GUIDE);
    this.current = { index: this.index, entry, drill, prompt, guideLevel };
    return this.current;
  }

  async answer(answer: unknown, responseMs: number): Promise<AnswerResult> {
    // A prompt already on screen can still be answered once the time budget runs out.
    const cur = this.current?.index === this.index ? this.current : this.currentPrompt();
    if (!cur) throw new Error('No active prompt');
    const { entry, drill, prompt } = cur;
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

    const minutes = this.tick(now);
    const db = this.deps.db;
    // The answer and the XP it earned are stored together or not at all.
    const progress = await db.transaction(
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
            ? { confusion: { expected: result.expected, given: result.confusedWith } }
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
    this.touchedSkills.add(item.skillId);

    // Guided reps are worked examples, not evidence of recall, for scope purposes.
    if (!entry.guided) {
      this.scopes.set(drill.id, updateScope(this.scope(drill), result.correct, drill.scope).state);
    }
    this.answered++;
    if (result.correct) this.correct++;
    else this.queue = scheduleRetry(this.queue, this.index);

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

  next(): void {
    this.index++;
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
    const trailing = this.tick(endedAt);
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
