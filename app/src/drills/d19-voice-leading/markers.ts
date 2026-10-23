import type { FretMarker } from '../../components/fretboard/Fretboard';
import { samePosition, type Position, type ShapeNote } from '../../theory';
import {
  d19DegreeStyle,
  d19Found,
  d19Missed,
  d19NoteName,
  d19SpellTap,
  d19WrongTaps,
  type D19Prompt,
} from './logic';

/** The next chord's dots share this group, so the neck outlines it (guide levels 2–3). */
export const D19_GROUP = 'd19-next';

export interface D19MarkerState {
  /** Taps so far this round. */
  taps: readonly Position[];
  guided: boolean;
  /** The round is answered. */
  answered: boolean;
  /** The starting triad's note names show (worked example, feedback, or the guides allow). */
  named: boolean;
}

/**
 * The neck's markers. The starting triad is dashed rings; the next chord's
 * notes are drawn by degree in shape and colour (the root a square) and
 * named. A worked example rings the notes still to tap on top of their
 * shapes, each named (rule 8); feedback draws the whole answer and any wrong
 * tap.
 */
export function d19Markers(prompt: D19Prompt, s: D19MarkerState): FretMarker[] {
  const toMarker = (n: ShapeNote): FretMarker => ({
    string: n.string,
    fret: n.fret,
    style: d19DegreeStyle(n.degree),
    label: d19NoteName(prompt, prompt.to, n),
    forceLabel: true,
    group: D19_GROUP,
  });
  // The next chord's notes: those found, and in feedback all of them (the answer).
  const shown = s.answered ? prompt.targets : d19Found(prompt, s.taps);
  // A worked example marks the rest to copy (rule 8).
  const copy = s.guided && !s.answered ? d19Missed(prompt, s.taps) : [];
  const markers: FretMarker[] = [
    // The starting triad, but not under a note of the next chord drawn on it.
    ...prompt.fromNotes
      .filter((n) => ![...shown, ...copy].some((t) => samePosition(t, n)))
      .map((n): FretMarker => ({
        string: n.string,
        fret: n.fret,
        style: 'ghost',
        label: d19NoteName(prompt, prompt.from, n),
        forceLabel: s.named,
      })),
    ...shown.map(toMarker),
    ...copy.map((n): FretMarker => ({ ...toMarker(n), emphasis: true })),
  ];
  if (s.answered) {
    markers.push(
      ...d19WrongTaps(prompt, s.taps).map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: d19SpellTap(prompt, p),
        forceLabel: true,
      })),
    );
  }
  return markers;
}
