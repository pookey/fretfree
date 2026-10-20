import { ENGINE_CONFIG } from '../../engine/config';
import {
  STANDARD_TUNING,
  midiAt,
  openStringMidi,
  samePosition,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { DPB_SCOPES, type DpbScope } from './meta';

/**
 * What the box half (`logic.ts`) and the scale half (`scale.ts`) of the
 * drill share: the neck region, scope, display and windows.
 */

/** Boxes and positions sit within frets 0–15, the whole neck the iPad shows. */
export const DPB_REGION: FretRange = { from: 0, to: 15 };

/** The frets iPad portrait shows at once: a 12-fret neck (design §7), 13 cells. */
export const DPB_REGULAR_SPAN = 12;

export function dpbScopeFor(level: number): DpbScope {
  const i = Math.max(0, Math.min(DPB_SCOPES.length - 1, Math.round(level)));
  return DPB_SCOPES[i] as DpbScope;
}

/** Display form: `F#` → `F♯`, `b3` → `♭3`, the root degree `1` → `R`. */
export function dpbDisplay(s: string): string {
  if (s === '1') return 'R';
  return s
    .replace(/^b(?=\d)/, '♭')
    .replace('#', '♯')
    .replace(/(?<=[A-G])b/, '♭');
}

/** Frets to add on each string so a standard-tuning note keeps its pitch in `tuning`. */
export function retune<T extends Position>(notes: readonly T[], tuning: Tuning): T[] {
  return notes.map((n) => ({
    ...n,
    fret: n.fret + openStringMidi(n.string, STANDARD_TUNING) - openStringMidi(n.string, tuning),
  }));
}

export const byPitch = (tuning: Tuning) => (a: Position, b: Position) =>
  midiAt(a, tuning) - midiAt(b, tuning);

export const has = (notes: readonly Position[], p: Position) =>
  notes.some((n) => samePosition(n, p));

export function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

export function where(pos: Position): string {
  return `string ${pos.string}, fret ${pos.fret}`;
}

/** What the windows need from a prompt: the frets it spans and the frets that take taps. */
export interface Windowed {
  span: FretRange;
  activeRange: FretRange;
}

/** The compact window: the box with room either side, clamped to the active range. */
export function dpbWindow(prompt: Windowed, compactFrets: number): FretRange {
  const span = prompt.span.to - prompt.span.from + 1;
  const size = Math.max(ENGINE_CONFIG.pentatonicBox.compactWindowFrets, compactFrets, span + 2);
  const bounds = prompt.activeRange;
  const width = Math.min(size, bounds.to - bounds.from + 1);
  const centre = (prompt.span.from + prompt.span.to) / 2;
  const start = Math.max(
    bounds.from,
    Math.min(Math.round(centre - (width - 1) / 2), bounds.to - width + 1),
  );
  return { from: start, to: start + width - 1 };
}

/** iPad portrait's 12-fret neck: frets 0–12, slid up just far enough to hold the box. */
export function dpbRegularWindow(prompt: Windowed): FretRange {
  const bounds = prompt.activeRange;
  const top = Math.min(bounds.to, Math.max(bounds.from + DPB_REGULAR_SPAN, prompt.span.to + 1));
  return { from: top - DPB_REGULAR_SPAN, to: top };
}
