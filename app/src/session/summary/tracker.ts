import {
  xpForAnswer,
  startOfLocalDay,
  toLocalDate,
  type XpConfig,
} from '../../engine/gamification';
import { ENGINE_CONFIG, type CardRecord, type Skill, type SkillStatus } from '../../engine';
import { allCards, getSkillStates, type FretworkDB } from '../../storage';
import type { SessionSummary } from '../runner';
import {
  bestPastSpeedMs,
  buildCelebration,
  nextCombo,
  xpKind,
  type Celebration,
  type CelebrationConfig,
  type Snapshot,
  type TalliedAnswer,
} from './celebrations';

/**
 * Follows a session alongside the runner: snapshots cards and skills before
 * it, counts the combo and XP as answers come in, and builds the summary's
 * celebration once the runner has finished.
 */

export interface TrackerDeps {
  db: FretworkDB;
  skills: readonly Skill[];
  now?: () => Date;
  config?: CelebrationConfig;
  xpConfig?: XpConfig;
}

async function snapshot(db: FretworkDB): Promise<Snapshot> {
  const [cards, states] = await Promise.all([allCards(db), getSkillStates(db)]);
  return {
    cards: new Map<string, CardRecord>(cards.map((c) => [c.itemId, c])),
    statuses: new Map<string, SkillStatus>([...states.values()].map((s) => [s.skillId, s.status])),
  };
}

export class CelebrationTracker {
  private readonly answers: TalliedAnswer[] = [];
  private comboNow = 0;
  private best = 0;
  private xpTotal = 0;
  private result: Celebration | null = null;

  private constructor(
    private readonly deps: TrackerDeps,
    private readonly before: Snapshot,
    private readonly answeredToday: Map<string, number>,
    private readonly previousBestMs: number | null,
  ) {}

  /** Call before the session's first answer is recorded. */
  static async begin(deps: TrackerDeps): Promise<CelebrationTracker> {
    const at = (deps.now ?? (() => new Date()))();
    const cfg = deps.config ?? ENGINE_CONFIG.gamification.celebrations;
    const dayStart = startOfLocalDay(toLocalDate(at));
    const [before, earlier, sessions] = await Promise.all([
      snapshot(deps.db),
      deps.db.reviewLogs.where('at').below(at).toArray(),
      deps.db.sessionLogs.toArray(),
    ]);
    const today = new Map<string, number>();
    for (const r of earlier) {
      if (r.at >= dayStart) today.set(r.itemId, (today.get(r.itemId) ?? 0) + 1);
    }
    const best = bestPastSpeedMs(
      sessions.map((s) => s.startedAt).filter((d) => d < at),
      earlier,
      cfg.speedMinAnswers,
    );
    return new CelebrationTracker(deps, before, today, best);
  }

  get combo(): number {
    return this.comboNow;
  }

  /** Record one graded answer; returns the combo and the XP it earned. */
  record(answer: TalliedAnswer): { combo: number; xp: number } {
    const answeredToday = this.answeredToday.get(answer.itemId) ?? 0;
    const xp = xpForAnswer(
      {
        correct: answer.correct,
        rating: answer.rating,
        kind: xpKind(answer.kind),
        stabilityDays: this.before.cards.get(answer.itemId)?.fsrs.stability ?? 0,
        answeredToday,
      },
      this.deps.xpConfig,
    );
    this.answeredToday.set(answer.itemId, answeredToday + 1);
    this.answers.push(answer);
    this.xpTotal += xp;
    this.comboNow = nextCombo(this.comboNow, answer);
    this.best = Math.max(this.best, this.comboNow);
    return { combo: this.comboNow, xp };
  }

  /** Build the celebration after `runner.finish()` has persisted skill states. */
  async finish(
    summary: Pick<SessionSummary, 'itemsSeen' | 'accuracy' | 'newItems'>,
    milestones: readonly string[] = [],
  ): Promise<Celebration> {
    if (this.result) return this.result;
    this.result = buildCelebration({
      summary,
      answers: this.answers,
      xp: this.xpTotal,
      bestCombo: this.best,
      skills: this.deps.skills,
      before: this.before,
      after: await snapshot(this.deps.db),
      previousBestMs: this.previousBestMs,
      milestones,
      ...(this.deps.config ? { config: this.deps.config } : {}),
    });
    return this.result;
  }
}
