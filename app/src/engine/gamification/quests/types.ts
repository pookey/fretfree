import type { Grade } from 'ts-fsrs';
import type { ReviewLogRecord } from '../../model';
import type { LocalDate } from '../local-date';
import type { CardKind, QuestContext, QuestDefinition } from '../types';

/**
 * What a quest may look at when the day's quests are drawn: history from
 * before the date, so the day's practice never changes the draw (or any weak
 * area a quest names), plus the live mic-mode setting. Toggling mic mode
 * mid-day re-runs the draw: the mic quest joins or leaves, and since the
 * shuffled pool is fixed per date, it displaces at most one other quest.
 */
export interface QuestSnapshot {
  date: LocalDate;
  /** Reviews from the lookback window before `date`, oldest first. */
  priorReviews: readonly ReviewLogRecord[];
  /** `settings.micEnabled`: sessions serve mic drills, so a mic quest can be met. */
  micEnabled?: boolean;
}

/** One answer on the quest's date: its review log joined with its XP kind. */
export interface QuestAnswer {
  itemId: string;
  skillId: string;
  correct: boolean;
  rating: Grade;
  kind: CardKind;
  /** A guided rep (the answer was shown): a worked example, not recall. */
  guided: boolean;
  at: Date;
  /** The drill that asked it (`reviewLogs.drillType`), e.g. to spot a mic drill. */
  drillType?: string;
  /** What the learner answered (`reviewLogs.answerGiven`), e.g. to spot a give-up. */
  answerGiven?: string;
}

/** What a drawn quest measures progress against. */
export interface QuestDayContext extends QuestContext {
  /** The date's answers, oldest first. */
  answers: readonly QuestAnswer[];
}

/** A quest as drawn for one date. Its `id` names any weak area, e.g. `weak-strings:3-4`. */
export interface DailyQuest extends Omit<QuestDefinition, 'progress'> {
  /** The quest file this was drawn from. */
  readonly templateId: string;
  /** Current progress, 0…target. Pure. */
  progress(ctx: QuestDayContext): number;
}

/**
 * One quest file. `draw` fits the quest to the learner's history before the
 * date, e.g. by picking their weakest strings, or returns `null` when it does
 * not apply yet (no history to find a weak area in). Pure.
 */
export interface QuestTemplate {
  readonly id: string;
  draw(snapshot: QuestSnapshot): DailyQuest | null;
}
