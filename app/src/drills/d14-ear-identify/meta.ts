import { parseEarItemId, type EarRef } from '../../engine/items/ear';
import type { Item } from '../../engine/model';

/**
 * D14's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D14_ID = 'ear-identify';

/**
 * Scope levels (research/02 rule 5, distractors): the answer's own sound
 * set (`engine/skills/i6.ts` groups), then two neighbouring sets, then every
 * sound of its kind.
 */
export const D14_SCOPE = { minLevel: 0, maxLevel: 2 };

export function d14Parse(item: Item): EarRef | null {
  return parseEarItemId(item.id);
}

export function d14CanTest(item: Item): boolean {
  return d14Parse(item) !== null;
}

/**
 * The confusion-matrix concept, shared with the drills that teach the same
 * thing by sight, so the seed pairs apply (engine/confusions): the interval's
 * name (`m3`, as D5), the chord's kind (`triad:maj`, `chord:7`, as D7) and
 * the progression (`prog:I-V-vi-IV`, as D12).
 */
export function d14Concept(ref: EarRef['kind'], answer: string): string {
  switch (ref) {
    case 'ear-interval':
      return answer;
    case 'ear-chord':
      if (answer === 'major') return 'triad:maj';
      if (answer === 'minor') return 'triad:min';
      return `chord:${answer}`;
    case 'progression-ear':
      return `prog:${answer}`;
  }
}

/** The sound an item asks for: an interval name, a chord kind or a progression ID. */
export function d14AnswerOf(ref: EarRef): string {
  switch (ref.kind) {
    case 'ear-interval':
      return ref.interval;
    case 'ear-chord':
      return ref.chord;
    case 'progression-ear':
      return ref.progression;
  }
}

export function d14ConceptOf(item: Item): string | null {
  const ref = d14Parse(item);
  return ref ? d14Concept(ref.kind, d14AnswerOf(ref)) : null;
}
