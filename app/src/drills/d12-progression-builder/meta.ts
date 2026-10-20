import { parseProgressionItemId, type Item } from '../../engine/model';
import { getProgression, type Progression } from '../../theory';

/**
 * D12's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D12_ID = 'progression-builder';

export type D12Task = 'build' | 'transpose';

/**
 * Scope levels (research/02 rule 5): more keys and more distractor tiles.
 * Level 0 is the open-chord keys and two distractors; level 2 is every key
 * and the whole palette.
 */
export const D12_SCOPE = { minLevel: 0, maxLevel: 2 };

/** A progression item's progression and task; null for items D12 doesn't ask. */
export function d12Parse(item: Item): { progression: Progression; task: D12Task } | null {
  const ref = parseProgressionItemId(item.id);
  if (!ref) return null;
  return { progression: getProgression(ref.progression), task: ref.task };
}

export function d12CanTest(item: Item): boolean {
  return d12Parse(item) !== null;
}

/** The concept a progression is keyed by in the confusion matrix (engine/confusions). */
export function progressionConcept(progressionId: string): string {
  return `prog:${progressionId}`;
}

export function d12ConceptOf(item: Item): string | null {
  const ref = parseProgressionItemId(item.id);
  return ref ? progressionConcept(ref.progression) : null;
}
