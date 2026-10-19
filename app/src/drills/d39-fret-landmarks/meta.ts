import { parseMarkerItemId, parseRepeatItemId, type Item } from '../../engine/model';
import { INLAY_FRETS } from '../../theory';

/**
 * D39's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D39_ID = 'fret-landmarks';

/** The landmarks F3 teaches: the inlays up to the double dot at 12. */
export const D39_MARKERS: readonly number[] = INLAY_FRETS.filter((f) => f <= 12);

/**
 * Scope levels (design §3.3 step 4, research/02 rule 5): 0 offers only the
 * landmark frets as answers; 1 offers every fret of the octave, so a near
 * miss (6 for 7) is possible.
 */
export const D39_SCOPE = { minLevel: 0, maxLevel: 1 };

export function d39CanTest(item: Item): boolean {
  const marker = parseMarkerItemId(item.id);
  if (marker) return D39_MARKERS.includes(marker.fret);
  const repeat = parseRepeatItemId(item.id);
  if (!repeat || Math.abs(repeat.frets) !== 12) return false;
  const to = repeat.from + repeat.frets;
  return to >= 0 && to <= 24;
}

/** The confusion-matrix key of a fret. */
export function d39Concept(fret: number): string {
  return `fret:${fret}`;
}

export function d39ConceptOf(item: Item): string | null {
  if (!d39CanTest(item)) return null;
  const marker = parseMarkerItemId(item.id);
  if (marker) return d39Concept(marker.fret);
  const repeat = parseRepeatItemId(item.id) as { frets: number; from: number };
  return d39Concept(repeat.from + repeat.frets);
}
