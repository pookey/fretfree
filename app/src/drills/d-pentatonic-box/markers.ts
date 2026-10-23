import type { FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, samePosition, type Position, type Tuning } from '../../theory';
import { dpbDisplay, dpbTargetAt, dpbWrongTaps, type BoxNote, type DpbPrompt } from './logic';
import { dpsDegreeLabel, dpsFound, dpsWrongTaps, type DpsPrompt, type PositionNote } from './scale';
import { has } from './shared';

export interface PentaMarkerState {
  /** Taps so far this round. */
  taps: readonly Position[];
  guided: boolean;
  /** The round is answered. */
  answered: boolean;
  tuning: Tuning;
}

type Style = FretMarker['style'];

/** What a worked example asks to tap, counted: "6 ringed notes", "ringed C", "2 ringed C notes". */
export function ringedNotes(count: number, name?: string): string {
  if (count === 1) return name ? `ringed ${name}` : 'ringed note';
  return `${count} ringed ${name ? `${name} notes` : 'notes'}`;
}

/** A chord tone's shape and colour: the root a square, the 3rd a circle, the 5th a triangle. */
export function dpbChordStyle(degree: string): Style | null {
  if (degree === '1') return 'root';
  if (degree === '5') return 'fifth';
  return degree === '3' || degree === 'b3' ? 'third' : null;
}

/**
 * A worked example's note to tap: named, and ringed on top of its chord-tone
 * shape when it has one (a 5th stays a triangle), else on a plain dot, so
 * every target on the neck wears the same ring.
 */
function toTap(at: Position, label: string, shape: Style | null): FretMarker {
  return { ...at, style: shape ?? 'tone', label, forceLabel: true, emphasis: true };
}

function wrongMarkers(wrong: Position[], s: PentaMarkerState, prompt: DpbPrompt | DpsPrompt) {
  return wrong.map((p): FretMarker => ({
    ...p,
    style: 'wrong',
    label: dpbDisplay(noteAt(p, s.tuning, prompt.accidentalPref).pc),
    forceLabel: true,
  }));
}

/**
 * The box view's markers (C7). Roots are squares named by letter. An
 * overlay draws the chord by degree in shape and colour, and its targets
 * are named by degree; a relative prompt draws the box as plain dots, and
 * its targets are named as the relative root. A worked example rings every
 * target (rule 8); found ones turn correct, and feedback ghosts the missed.
 */
export function dpbMarkers(prompt: DpbPrompt, s: PentaMarkerState): FretMarker[] {
  const overlay = prompt.mode === 'overlay';
  const root = dpbDisplay(prompt.root);
  const relRoot = dpbDisplay(prompt.relative.root);
  /** A target's label: its degree, a root by letter as the squares are (overlay), or its name (relative). */
  const answerLabel = (n: BoxNote) => {
    if (!overlay) return relRoot;
    return n.degree === '1' ? root : dpbDisplay(n.degree);
  };
  const wrong = dpbWrongTaps(prompt, s.taps);

  const markerFor = (n: BoxNote): FretMarker | null => {
    const at = { string: n.string, fret: n.fret };
    if (dpbTargetAt(prompt, n)) {
      const label = answerLabel(n);
      if (has(s.taps, n)) return { ...at, style: 'correct', label, forceLabel: true };
      if (s.answered) return { ...at, style: 'ghost', label, forceLabel: true };
      if (s.guided) return toTap(at, label, overlay ? dpbChordStyle(n.degree) : null);
      if (overlay) return null;
    }
    if (wrong.some((p) => samePosition(p, n))) return null;
    if (n.degree === '1') return { ...at, style: 'root', label: root, forceLabel: true };
    if (overlay)
      return { ...at, style: dpbChordStyle(n.degree) ?? 'tone', label: dpbDisplay(n.degree) };
    // A relative prompt's box: plain dots, named by degree only once answered (rule 4).
    return s.answered
      ? { ...at, style: 'tone', label: dpbDisplay(n.degree), forceLabel: true }
      : { ...at, style: 'tone' };
  };
  const markers = prompt.boxNotes.flatMap((n) => markerFor(n) ?? []);
  if (s.answered) markers.push(...wrongMarkers(wrong, s, prompt));
  return markers;
}

/** A scale degree's shape: the major chord's tones as C7 draws them, other degrees a plain dot. */
export function dpsStyle(degree: PositionNote['degree']): Style | null {
  return dpbChordStyle(String(degree));
}

/**
 * The scale view's markers (I7). Roots are squares named by letter; the
 * given box draws the 3rds and 5ths in their shapes, as C7 does, and the
 * other notes as dots named by degree. A worked example rings every target,
 * named, on top of its shape (rule 8).
 */
export function dpsMarkers(prompt: DpsPrompt, s: PentaMarkerState): FretMarker[] {
  const tonic = dpbDisplay(prompt.tonic);
  const found = dpsFound(prompt, s.taps);
  const wrong = dpsWrongTaps(prompt, s.taps);
  const labelOf = (n: PositionNote) => (n.degree === 1 ? tonic : dpsDegreeLabel(n.degree));

  const markerFor = (n: PositionNote): FretMarker | null => {
    const at = { string: n.string, fret: n.fret };
    const label = labelOf(n);
    if (wrong.some((p) => samePosition(p, n))) return null;
    if (has(prompt.targets, n)) {
      if (found.includes(n)) return { ...at, style: 'correct', label, forceLabel: true };
      if (s.answered) return { ...at, style: 'ghost', label, forceLabel: true };
      if (s.guided) return toTap(at, label, dpsStyle(n.degree));
    }
    if (!has(prompt.given, n)) return null;
    if (n.degree === 1) return { ...at, style: 'root', label, forceLabel: true };
    // A position's box: dots named by degree as the guides allow.
    return { ...at, style: dpsStyle(n.degree) ?? 'tone', label };
  };
  const markers = prompt.notes.flatMap((n) => markerFor(n) ?? []);
  if (s.answered) markers.push(...wrongMarkers(wrong, s, prompt));
  return markers;
}
