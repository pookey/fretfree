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
  speedTargets,
  updateScope,
  type CardRecord,
  type GuideLevel,
  type Item,
  type Scheduler,
  type ScopeState,
  type SessionEntry,
  type Settings,
  type Skill,
  type SkillStateRecord,
  type SkillStatus,
} from '../engine';
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

/**
 * Runs one practice session end to end: plans it with the session builder,
 * serves prompts through drill plugins, grades with correctness + speed,
 * schedules with FSRS and persists every answer (design §3).
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
}

export interface SessionSummary {
  itemsSeen: number;
  correct: number;
  accuracy: number;
  newItems: number;
  durationMs: number;
  /** Skills whose status or guide level improved this session. */
  improvedSkills: string[];
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
  private readonly startedAt: Date;
  private readonly targets;
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
    this.targets = speedTargets(deps.settings.latencyBaselineMs);
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
    const frontier: Item[] = [];
    for (const skill of deps.skills) {
      const status = deriveStatus(skill, statuses, statuses.get(skill.id));
      statuses.set(skill.id, status);
      if (isFrontier(status)) frontier.push(...skill.items());
    }
    const tuning = getTuning(deps.settings.tuning);
    const drillFor = (skillId: string) => {
      const skill = deps.skills.find((s) => s.id === skillId);
      return deps.drills.find((d) => skill?.drillTypes.includes(d.id));
    };
    const plan = buildSession({
      now,
      minutes: deps.settings.sessionMinutes,
      cards,
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
    const cur = this.currentPrompt();
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

    await recordAnswer(this.deps.db, {
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

    const state = this.skillStates.get(item.skillId) ?? {
      skillId: item.skillId,
      status: 'unlocked' as const,
      guideLevel: DEFAULT_GUIDE,
      rollingAccuracy: 0,
    };
    if (state.status === 'unlocked' || state.status === 'locked') state.status = 'practising';
    this.skillStates.set(item.skillId, state);
    this.touchedSkills.add(item.skillId);

    // Guided reps are worked examples, not evidence of recall, for scope purposes.
    if (!entry.guided) {
      this.scopes.set(drill.id, updateScope(this.scope(drill), result.correct, drill.scope).state);
    }
    this.answered++;
    if (result.correct) this.correct++;
    else this.queue = scheduleRetry(this.queue, this.index);

    return { result, rating, sounds: drill.sounds(prompt, { answer, result }) };
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
      const before = { ...state };
      state.rollingAccuracy = accuracy;
      if (graded.length >= ENGINE_CONFIG.adaptive.minAnswers) {
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
    this.finished = {
      itemsSeen: this.answered,
      correct: this.correct,
      accuracy,
      newItems: this.newItems.size,
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      improvedSkills: improved,
    };
    return this.finished;
  }
}
