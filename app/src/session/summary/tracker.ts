import { ENGINE_CONFIG, type CardRecord, type Skill, type SkillStatus } from '../../engine';
import { allCards, getSkillStates, type FretworkDB } from '../../storage';
import type { SessionSummary } from '../runner';
import {
  bestPastSpeedMs,
  buildCelebration,
  nextCombo,
  type Celebration,
  type CelebrationConfig,
  type Snapshot,
  type TalliedAnswer,
} from './celebrations';
import { streakMilestones } from './copy';

/**
 * Follows a session alongside the runner: snapshots cards and skills before
 * it, counts the combo as answers come in, and builds the summary's
 * celebration once the runner has finished. XP and streak events come from
 * the runner's summary, which is what was persisted (M1-10).
 */

export interface TrackerDeps {
  db: FretworkDB;
  skills: readonly Skill[];
  now?: () => Date;
  config?: CelebrationConfig;
}

/** What the tracker needs from `runner.finish()`. */
export type FinishedSession = Pick<SessionSummary, 'itemsSeen' | 'accuracy' | 'newItems' | 'xp'> &
  Partial<Pick<SessionSummary, 'events'>>;

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
  private result: Celebration | null = null;

  private constructor(
    private readonly deps: TrackerDeps,
    private readonly before: Snapshot,
    private readonly previousBestMs: number | null,
  ) {}

  /** Call before the session's first answer is recorded. */
  static async begin(deps: TrackerDeps): Promise<CelebrationTracker> {
    const at = (deps.now ?? (() => new Date()))();
    const cfg = deps.config ?? ENGINE_CONFIG.gamification.celebrations;
    const [before, earlier, sessions] = await Promise.all([
      snapshot(deps.db),
      deps.db.reviewLogs.where('at').below(at).toArray(),
      deps.db.sessionLogs.toArray(),
    ]);
    const best = bestPastSpeedMs(
      sessions.map((s) => s.startedAt).filter((d) => d < at),
      earlier,
      cfg.speedMinAnswers,
    );
    return new CelebrationTracker(deps, before, best);
  }

  get combo(): number {
    return this.comboNow;
  }

  /** Record one graded answer; returns the combo after it. */
  record(answer: TalliedAnswer): { combo: number } {
    this.answers.push(answer);
    this.comboNow = nextCombo(this.comboNow, answer);
    this.best = Math.max(this.best, this.comboNow);
    return { combo: this.comboNow };
  }

  /** Build the celebration after `runner.finish()` has persisted skill states. */
  async finish(summary: FinishedSession, milestones: readonly string[] = []): Promise<Celebration> {
    if (this.result) return this.result;
    this.result = buildCelebration({
      summary,
      answers: this.answers,
      xp: summary.xp,
      bestCombo: this.best,
      skills: this.deps.skills,
      before: this.before,
      after: await snapshot(this.deps.db),
      previousBestMs: this.previousBestMs,
      now: (this.deps.now ?? (() => new Date()))(),
      milestones: [...streakMilestones(summary.events ?? []), ...milestones],
      ...(this.deps.config ? { config: this.deps.config } : {}),
    });
    return this.result;
  }
}
