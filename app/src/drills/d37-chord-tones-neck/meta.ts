import { parseChordTonesItemId, type Item } from '../../engine/model';
import type { ChordDegree, ChordKind } from '../../theory';
import { isD8Kind } from '../d8-chord-tone/voicings';

/**
 * D37's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D37_ID = 'chord-tones-neck';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5):
 *
 * - `shape` (0): the frets one CAGED shape of the chord spans, picked per
 *   prompt, so the box moves round the neck (rule 12);
 * - `neck` (1): frets 0–12, every string.
 */
export type D37Scope = 'shape' | 'neck';

export const D37_SCOPES: readonly D37Scope[] = ['shape', 'neck'];
export const D37_SCOPE = { minLevel: 0, maxLevel: D37_SCOPES.length - 1 };

/** A chord-tones item D37 can ask: a chord kind D8's voicings cover. */
export function d37Parse(item: Item) {
  const ref = parseChordTonesItemId(item.id);
  return ref && isD8Kind(ref.chord) ? ref : null;
}

/** The kinds with CAGED shapes to draw a region from (`theory/voicings`). */
export function d37CanTest(item: Item): boolean {
  return d37Parse(item) !== null;
}

/** D7's concepts, so the seed pairs (`triad:maj`/`triad:min`, `chord:7`/`chord:maj7` …) apply. */
export function d37ChordConcept(kind: ChordKind): string {
  if (kind === 'major') return 'triad:maj';
  if (kind === 'minor') return 'triad:min';
  return `chord:${kind}`;
}

/** Intervals from the root, as the confusion matrix keys them (engine/confusions.ts). */
export const D37_INTERVAL: Partial<Record<ChordDegree, string>> = {
  '1': 'P1',
  b3: 'm3',
  '3': 'M3',
  '5': 'P5',
  b7: 'm7',
  '7': 'M7',
};

/** The concept a card is keyed by: the chord's kind, or a degree's interval. */
export function d37Concept(prompt: { kind: ChordKind; degree: ChordDegree | null }): string {
  return prompt.degree === null
    ? d37ChordConcept(prompt.kind)
    : (D37_INTERVAL[prompt.degree] ?? prompt.degree);
}

export function d37ConceptOf(item: Item): string | null {
  const ref = d37Parse(item);
  return ref ? d37Concept({ kind: ref.chord, degree: ref.degree }) : null;
}
