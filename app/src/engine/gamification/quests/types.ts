import type { Grade } from 'ts-fsrs';
import type { ReviewLogRecord } from '../../model';
import type { LocalDate } from '../local-date';
import type { CardKind, QuestContext, QuestDefinition } from '../types';

/**
 * What a quest may look at when the day's quests are drawn: only history from
 * before the date, so the draw (and any weak area a quest names) stays put
 * all day, however that day's practice goes.
 */
export interface QuestSnapshot {
  date: LocalDate;
  /** Reviews from the lookback window before `date`, oldest first. */
  priorReviews: readonly ReviewLogRecord[];
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
