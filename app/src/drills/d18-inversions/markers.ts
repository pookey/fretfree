import type { FretMarker } from '../../components/fretboard/Fretboard';
import { noteAt, type Position, type ShapeNote, type Tuning } from '../../theory';
import {
  d18DegreeStyle,
  d18Display,
  d18Found,
  d18Missed,
  d18WrongTaps,
  type D18Prompt,
} from './logic';

/** Every dot of the triad shares this group, so the neck outlines it (guide levels 2–3). */
export const D18_GROUP = 'd18-triad';

/** A triad note labelled by its degree, in its degree's shape unless another style is given. */
export function d18DegreeMarker(
  n: ShapeNote,
  style: FretMarker['style'] = d18DegreeStyle(n.degree),
): FretMarker {
  return {
    string: n.string,
    fret: n.fret,
    style,
    label: d18Display(n.degree),
    forceLabel: true,
    group: D18_GROUP,
  };
}

export interface D18MarkerState {
  /** Taps so far this round (build cards). */
  taps: readonly Position[];
  guided: boolean;
  /** The round is answered. */
  answered: boolean;
  tuning: Tuning;
}

/**
 * The neck's markers. A build card draws the given root as a square and each
 * found note by its degree; a worked example rings the notes still to tap on
 * top of their degree shapes (a 5th stays a triangle, rule 8), and feedback
 * draws the missed ones as ghosts with any wrong tap. A name card draws the
 * triad as plain dots until it's revealed (worked example or answered).
 */
export function d18Markers(prompt: D18Prompt, s: D18MarkerState): FretMarker[] {
  if (prompt.mode !== 'build') {
    const reveal = s.guided || s.answered;
    return prompt.notes.map((n): FretMarker =>
      reveal
        ? d18DegreeMarker(n)
        : { string: n.string, fret: n.fret, style: 'tone', group: D18_GROUP },
    );
  }
  const markers: FretMarker[] = [
    {
      ...prompt.anchor,
      style: 'root',
      label: d18Display(prompt.root),
      forceLabel: true,
      group: D18_GROUP,
    },
    ...d18Found(prompt, s.taps).map((n) => d18DegreeMarker(n)),
  ];
  const missed = d18Missed(prompt, s.taps);
  if (s.answered) {
    markers.push(...missed.map((n) => d18DegreeMarker(n, 'ghost')));
    markers.push(
      ...d18WrongTaps(prompt, s.taps).map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: d18Display(noteAt(p, s.tuning, prompt.accidentalPref).pc),
        forceLabel: true,
      })),
    );
  } else if (s.guided) {
    markers.push(...missed.map((n) => ({ ...d18DegreeMarker(n), emphasis: true })));
  }
  return markers;
}
