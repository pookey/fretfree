import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../config';
import { parseItemId, type ReviewLogRecord } from '../../model';
import type { DailyQuest, QuestAnswer, QuestDayContext, QuestTemplate } from './types';

/**
 * Shared builders for the quest files. No default export, so the registry
 * skips this module.
 */

export type QuestConfigId = Exclude<
  keyof typeof ENGINE_CONFIG.quests,
  'perDay' | 'lookbackDays' | 'minAreaAnswers'
>;

/**
 * An answer a quest may count: anything but a not-due card drilled early, so
 * meeting a quest never needs drilling stable cards (research/02 rule 15).
 */
export function counts(a: QuestAnswer): boolean {
  return a.kind !== 'not-due';
}

/** Correct and unguided: recall, not a worked example (rule 8). */
export function recalled(a: QuestAnswer): boolean {
  return counts(a) && a.correct && !a.guided;
}

/** Recalled quickly: rated Easy (rule 2). Guided reps are capped below Easy anyway. */
export function fluent(a: QuestAnswer): boolean {
  return recalled(a) && a.rating === Rating.Easy;
}

/** The number of distinct items among `answers`. */
export function distinctItems(answers: readonly QuestAnswer[]): number {
  return new Set(answers.map((a) => a.itemId)).size;
}

/** The strings (1 = high E … 6 = low E) an item is played on; none for neck-wide facts. */
export function stringsOf(itemId: string): number[] {
  const ref = parseItemId(itemId);
  switch (ref?.kind) {
    case 'note':
      return [ref.position.string];
    case 'find':
      return [ref.string];
    case 'octave':
      return [ref.from.string, ref.string];
    case 'interval':
    case 'interval-name':
      return [ref.from, ref.to];
    default:
      return [];
  }
}

export interface AreaStats {
  /** Unguided answers. */
  answers: number;
  correct: number;
  fluent: number;
}

/**
 * Unguided review counts per area (a string, a skill…) over `reviews`. An
 * item in several areas counts toward each. Guided reps say nothing about
 * recall, so they are left out.
 */
export function areaStats<K>(
  reviews: readonly ReviewLogRecord[],
  areasOf: (r: ReviewLogRecord) => readonly K[],
): Map<K, AreaStats> {
  const stats = new Map<K, AreaStats>();
  for (const r of reviews) {
    if (r.hintUsed) continue;
    for (const area of new Set(areasOf(r))) {
      const s = stats.get(area) ?? { answers: 0, correct: 0, fluent: 0 };
      s.answers++;
      if (r.correct) s.correct++;
      if (r.correct && r.rating === Rating.Easy) s.fluent++;
      stats.set(area, s);
    }
  }
  return stats;
}

/** Areas with enough answers to judge, weakest first (`weaker` < 0 when a is weaker). */
export function weakestAreas<K>(
  stats: ReadonlyMap<K, AreaStats>,
  weaker: (a: [K, AreaStats], b: [K, AreaStats]) => number,
  minAnswers: number = ENGINE_CONFIG.quests.minAreaAnswers,
): [K, AreaStats][] {
  return [...stats].filter(([, s]) => s.answers >= minAnswers).sort(weaker);
}

export const fluentShare = (s: AreaStats) => s.fluent / s.answers;
export const accuracy = (s: AreaStats) => s.correct / s.answers;

/** The quest a template draws, with its target and bonus from `engine/config/quests.ts`. */
export function dailyQuest(
  templateId: QuestConfigId,
  quest: {
    id?: string;
    title: string;
    description: string;
    progress(ctx: QuestDayContext): number;
  },
): DailyQuest {
  const { target, bonusXp } = ENGINE_CONFIG.quests[templateId];
  const { id = templateId, title, description, progress } = quest;
  return {
    id,
    templateId,
    title,
    description,
    target,
    bonusXp,
    progress: (ctx) => Math.min(target, progress(ctx)),
  };
}

/** A quest that applies to everyone, every day, whatever their history. */
export function everydayQuest(
  templateId: QuestConfigId,
  quest: Parameters<typeof dailyQuest>[1],
): QuestTemplate {
  return { id: templateId, draw: () => dailyQuest(templateId, quest) };
}
