import type { Item } from '../../engine/model';
import {
  parseScalePositionItemId,
  scalePositionItemId,
  scaleRunItemId,
} from '../../engine/items/scale-position';
import {
  NATURAL_PCS,
  boxShape,
  chromaOf,
  inRange,
  majorScale,
  majorScalePosition,
  midiAt,
  nextBox,
  noteAt,
  pentatonicBox,
  positionRun,
  previousBox,
  samePosition,
  standardKeyTonic,
  stringCount,
  type AccidentalPref,
  type BoxNumber,
  type CagedShapeName,
  type FretRange,
  type MajorScaleNote,
  type Position,
  type ScaleDegree,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import type { DpbScope } from './meta';
import { DPB_REGION, byPitch, dpbDisplay, dpbScopeFor, has, pick, retune, where } from './shared';

/**
 * The pentatonic-box drill's scale half (I7, research/03 "play 5
 * positions; start from any degree"), pure. It tests I7's cards:
 *
 * - `scale-position:1` (position): major pentatonic box 1 is drawn, roots
 *   as squares, and the learner taps the rest of major-scale position 1
 *   around it: the 4ths and 7ths the box leaves out, and any scale note just
 *   past its ends (`majorScalePosition`). The box is the scaffold, as the
 *   chord is for a box (rule 7: CAGED → pentatonic → full scale).
 * - `scale-run:1@5` (run): only the position's roots are drawn, and the
 *   learner plays position 1 note by note, up from its lowest 5th to its
 *   highest (`positionRun`). The taps must go up in order: a run is played.
 *
 * Each tap is marked at once; the round answers at the last note, at the
 * first wrong tap, or on "Done". The key and neck position vary per prompt
 * (rule 12). Confusions (rule 6): a position tap in the neighbouring
 * position is logged against that position's card; a run that starts on the
 * lowest note of another degree is logged against that degree's run card.
 * Every concept is the card's own ID, as the box cards' are.
 *
 * Positions are standard tuning. In another tuning each note keeps its pitch
 * and moves along its string, as the boxes do.
 */

export type DpsMode = 'position' | 'run';

export interface PositionNote extends Position {
  /** As the key spells it. */
  pc: string;
  degree: ScaleDegree;
}

export interface DpsPrompt {
  itemId: string;
  mode: DpsMode;
  position: BoxNumber;
  /** The degree a run starts and ends on; 1 for a position card. */
  degree: ScaleDegree;
  /** The key, spelled as keys are: D♭, not C♯. */
  tonic: string;
  /** The CAGED shape the position surrounds. */
  shape: CagedShapeName;
  /** Every note of the position, low to high. */
  notes: PositionNote[];
  /** What is drawn before an answer: the major box (position) or the roots (run). */
  given: PositionNote[];
  /** The notes to tap: the rest of the position, or the run in playing order. */
  targets: PositionNote[];
  /**
   * The positions either side, placed next to this one (position cards
   * only, else empty): their notes this position lacks, so a tap there is
   * that confusion.
   */
  neighbours: { position: BoxNumber; notes: Position[] }[];
  /** The frets the position spans. */
  span: FretRange;
  scope: DpbScope;
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The taps, in order. */
export type DpsAnswer = readonly Position[];

/** "root", "5th": a degree in words, for prompts and feedback. */
export function dpsDegreeName(degree: ScaleDegree): string {
  if (degree === 1) return 'root';
  return `${degree}${degree === 2 ? 'nd' : degree === 3 ? 'rd' : 'th'}`;
}

/**
 * A position card's worked example: what the ringed notes are, by degree
 * and name. "The ringed notes are the 4ths (F) and the 7ths (B): they fill
 * box 1 out to the scale."
 */
export function dpsAddedLine(prompt: DpsPrompt): string {
  const degrees = [...new Set(prompt.targets.map((t) => t.degree))].sort((a, b) => a - b);
  const parts = degrees.map((d) => {
    const notes = prompt.targets.filter((t) => t.degree === d);
    const name = dpbDisplay((notes[0] as PositionNote).pc);
    return `the ${dpsDegreeName(d)}${notes.length > 1 ? 's' : ''} (${name})`;
  });
  const list =
    parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) as string}` : parts[0];
  return `The ringed notes are ${list}: they fill box ${prompt.position} out to the scale.`;
}

/** The degree as the neck labels it: `R` for the root, else its number. */
export function dpsDegreeLabel(degree: ScaleDegree): string {
  return dpbDisplay(String(degree));
}

/** The key for a pitch class: the circle's spelling, with F♯ or G♭ per the preference. */
export function dpsTonic(chroma: number, pref: AccidentalPref): string {
  const tonic = standardKeyTonic(chroma, 'major');
  return chroma === 6 && pref === 'flat' ? 'Gb' : tonic;
}

interface Placement {
  /** The position's notes in the drill's tuning. */
  notes: PositionNote[];
  /** Its major box's notes, in the drill's tuning. */
  box: Position[];
  /** The box's lowest fret in standard tuning, to place the neighbours. */
  from: number;
}

/** Every placement of position `position` of `tonic` major that fits in `region`. */
export function dpsPlacements(
  tonic: string,
  position: BoxNumber,
  tuning: Tuning,
  region: FretRange = DPB_REGION,
): Placement[] {
  const out: Placement[] = [];
  for (let minFret = 0; minFret <= region.to;) {
    let placed;
    let box;
    try {
      placed = majorScalePosition(tonic, position, { minFret });
      box = pentatonicBox(tonic, 'major', position, { minFret });
    } catch {
      break; // No room above `minFret`.
    }
    minFret = box.span.from + 1;
    const notes = retune(placed.notes, tuning).map(({ string, fret, pc, degree }) => ({
      string,
      fret,
      pc,
      degree,
    }));
    if (!notes.every((n) => inRange(n.fret, region))) continue;
    const boxNotes = retune(box.notes, tuning).map(({ string, fret }) => ({ string, fret }));
    out.push({ notes, box: boxNotes, from: box.span.from });
  }
  return out;
}

/** The positions either side of a placed one, as positions this one lacks. */
function neighboursOf(
  tonic: string,
  position: BoxNumber,
  placement: Placement,
  tuning: Tuning,
): DpsPrompt['neighbours'] {
  const near = (p: BoxNumber, minFret: number, below: boolean) => {
    let placed;
    let box;
    try {
      placed = majorScalePosition(tonic, p, { minFret });
      box = pentatonicBox(tonic, 'major', p, { minFret });
    } catch {
      return []; // No room for it at the top of the neck.
    }
    // In open position there is no room below: the placement is the position an octave up.
    if (below && box.span.from >= placement.from) return [];
    const notes = retune(placed.notes, tuning)
      .filter((n) => n.fret >= 0 && !has(placement.notes, n))
      .map((n) => ({ string: n.string, fret: n.fret }));
    return [{ position: p, notes }];
  };
  // As for the boxes: the one below starts up to three frets lower.
  return [
    ...near(previousBox(position), Math.max(0, placement.from - 3), true),
    ...near(nextBox(position), placement.from + 1, false),
  ];
}

export function dpsMakePrompt(item: Item, ctx: DrillContext): DpsPrompt {
  const ref = parseScalePositionItemId(item.id);
  const { tuning, accidentalPref } = ctx;
  if (!ref || stringCount(tuning) !== 6) throw new Error(`Scale positions cannot test ${item.id}`);
  const { position } = ref;
  const scope = dpbScopeFor(ctx.scopeLevel);
  const tonics = (scope === 'naturals' ? NATURAL_PCS.map(chromaOf) : [...Array(12).keys()])
    .map((chroma) => dpsTonic(chroma, accidentalPref))
    .filter((t) => dpsPlacements(t, position, tuning).length > 0);
  const tonic = pick(tonics, ctx.rng);
  const placement = tonic && pick(dpsPlacements(tonic, position, tuning), ctx.rng);
  if (!tonic || !placement) throw new Error(`Scale positions cannot place ${item.id}`);

  const notes = [...placement.notes].sort(byPitch(tuning));
  const mode: DpsMode = ref.kind === 'scale-position' ? 'position' : 'run';
  const degree: ScaleDegree = ref.kind === 'scale-run' ? ref.degree : 1;
  const inBox = (n: Position) => has(placement.box, n);
  const frets = notes.map((n) => n.fret);
  return {
    itemId: item.id,
    mode,
    position,
    degree,
    tonic,
    shape: boxShape(position),
    notes,
    given: mode === 'position' ? notes.filter(inBox) : notes.filter((n) => n.degree === 1),
    targets:
      mode === 'position'
        ? notes.filter((n) => !inBox(n))
        : (positionRun({ notes: notes as MajorScaleNote[] }, degree) as PositionNote[]),
    neighbours: mode === 'position' ? neighboursOf(tonic, position, placement, tuning) : [],
    span: { from: Math.min(...frets), to: Math.max(...frets) },
    scope,
    activeRange: DPB_REGION,
    tuning,
    accidentalPref,
  };
}

/** Taps that are neither answers nor mistakes: a position card's given box notes. */
export function dpsIgnores(prompt: DpsPrompt, pos: Position): boolean {
  return prompt.mode === 'position' && has(prompt.given, pos);
}

/** How many taps are answers: any target (position), or the run's notes in order (run). */
function foundCount(prompt: DpsPrompt, taps: DpsAnswer): number {
  if (prompt.mode === 'position') return dpsFound(prompt, taps).length;
  let i = 0;
  while (i < taps.length && samePosition(taps[i] as Position, prompt.targets[i] as Position)) i++;
  return i;
}

/** The targets among the taps, in tap order. */
export function dpsFound(prompt: DpsPrompt, taps: DpsAnswer): PositionNote[] {
  if (prompt.mode === 'run') return prompt.targets.slice(0, foundCount(prompt, taps));
  return taps.flatMap((p) => prompt.targets.find((t) => samePosition(t, p)) ?? []);
}

/** Whether a tap is the answer: a target (position) or the run's next note (run). */
export function dpsAccepts(prompt: DpsPrompt, taps: DpsAnswer, pos: Position): boolean {
  if (prompt.mode === 'position') return has(prompt.targets, pos);
  const next = prompt.targets[foundCount(prompt, taps)];
  return next !== undefined && samePosition(next, pos);
}

/** The targets not yet played. */
export function dpsMissed(prompt: DpsPrompt, taps: DpsAnswer): PositionNote[] {
  if (prompt.mode === 'run') return prompt.targets.slice(foundCount(prompt, taps));
  return prompt.targets.filter((t) => !has(taps, t));
}

/** Taps that are not answers (a position card's given notes are never one). */
export function dpsWrongTaps(prompt: DpsPrompt, taps: DpsAnswer): Position[] {
  if (prompt.mode === 'run') return taps.slice(foundCount(prompt, taps));
  return taps.filter((p) => !has(prompt.targets, p) && !dpsIgnores(prompt, p));
}

/** "C major position 1", "C major position 1 from the 5th": the feedback bar's answer. */
export function dpsSubject(prompt: DpsPrompt): string {
  const what = `${dpbDisplay(prompt.tonic)} major position ${prompt.position}`;
  return prompt.mode === 'run' ? `${what} from the ${dpsDegreeName(prompt.degree)}` : what;
}

/** The position a wrong position tap belongs to, if it is a neighbour's note. */
export function dpsNeighbourAt(prompt: DpsPrompt, pos: Position): BoxNumber | undefined {
  return prompt.neighbours.find((n) => has(n.notes, pos))?.position;
}

/** The degree whose lowest note in the position is at `pos`, if it is one. */
export function dpsStartAt(prompt: DpsPrompt, pos: Position): ScaleDegree | undefined {
  const note = prompt.notes.find((n) => samePosition(n, pos));
  if (!note) return undefined;
  return prompt.notes.find((n) => n.degree === note.degree) === note ? note.degree : undefined;
}

/** True if the tap's pitch is in the key. */
export function dpsInKey(prompt: DpsPrompt, pos: Position): boolean {
  const chroma = midiAt(pos, prompt.tuning) % 12;
  return majorScale(prompt.tonic).some((pc) => chromaOf(pc) === chroma);
}

/** The card a wrong tap was confused with, keyed by item ID (the drill's concept). */
export function dpsConfusedWith(
  prompt: DpsPrompt,
  taps: DpsAnswer,
  pos: Position,
): string | undefined {
  if (prompt.mode === 'position') {
    const neighbour = dpsNeighbourAt(prompt, pos);
    return neighbour ? scalePositionItemId(neighbour) : undefined;
  }
  // Only a wrong first note is a wrong start.
  if (foundCount(prompt, taps) > 0 || !samePosition(taps[0] as Position, pos)) return undefined;
  const start = dpsStartAt(prompt, pos);
  return start && start !== prompt.degree ? scaleRunItemId(prompt.position, start) : undefined;
}

export function dpsCheck(prompt: DpsPrompt, taps: DpsAnswer): DrillCheck {
  const expected = dpsSubject(prompt);
  const wrong = dpsWrongTaps(prompt, taps)[0];
  if (wrong) {
    const confusedWith = dpsConfusedWith(prompt, taps, wrong);
    return confusedWith
      ? { correct: false, expected, confusedWith, concept: prompt.itemId }
      : { correct: false, expected };
  }
  return { correct: dpsMissed(prompt, taps).length === 0, expected };
}

function names(prompt: DpsPrompt, positions: readonly Position[]): string[] {
  return positions.map((p) => noteAt(p, prompt.tuning, prompt.accidentalPref).name);
}

/** The position played up from its lowest note, or the run; a wrong tap adds the tapped note. */
export function dpsSounds(prompt: DpsPrompt, fb: DrillFeedback<DpsAnswer>): DrillSounds {
  const expected = names(prompt, prompt.mode === 'run' ? prompt.targets : prompt.notes);
  const wrong = dpsWrongTaps(prompt, fb.answer);
  return wrong.length > 0 ? { expected, given: names(prompt, wrong) } : { expected };
}

export function dpsFeedbackPositions(
  prompt: DpsPrompt,
  fb: DrillFeedback<DpsAnswer>,
): { expected: Position[]; given: Position[] } {
  return { expected: prompt.targets, given: dpsWrongTaps(prompt, fb.answer) };
}

/** The degrees, in order: "5 6 7 R 2 3 4 5 …". */
export function dpsDegreeLine(notes: readonly PositionNote[]): string {
  return notes.map((n) => dpsDegreeLabel(n.degree)).join(' ');
}

/** One line of feedback: what the position is, or what went wrong. */
export function dpsExplain(prompt: DpsPrompt, fb: DrillFeedback<DpsAnswer>): string {
  const missed = dpsMissed(prompt, fb.answer).length;
  const left = missed > 0 ? ` ${missed} still to play, ringed on the neck.` : '';
  const wrong = dpsWrongTaps(prompt, fb.answer)[0];
  const tonic = dpbDisplay(prompt.tonic);

  if (prompt.mode === 'position') {
    const what =
      `Position ${prompt.position} is major box ${prompt.position} with its 4ths and 7ths, ` +
      `around the ${prompt.shape} shape.`;
    if (fb.result.correct) return `That's ${dpsSubject(prompt)}. ${what}`;
    if (!wrong) return `${what}${left}`;
    const tapped = `You tapped ${where(wrong)}`;
    const neighbour = dpsNeighbourAt(prompt, wrong);
    if (neighbour) return `${tapped}, in position ${neighbour}. ${what}`;
    if (!dpsInKey(prompt, wrong)) return `${tapped}: that note isn't in ${tonic} major. ${what}`;
    return `${tapped}, outside the position. ${what}`;
  }

  const name = dpsDegreeName(prompt.degree);
  const first = prompt.targets[0] as PositionNote;
  const what = `The run starts on the lowest ${name}, ${where(first)}, and goes up to the highest.`;
  if (fb.result.correct) return `That's it. ${what}`;
  if (!wrong) return `${what}${left}`;
  const tapped = `You tapped ${where(wrong)}`;
  if (fb.result.confusedWith) {
    const start = dpsStartAt(prompt, wrong) as ScaleDegree;
    return `${tapped}, the lowest ${dpsDegreeName(start)}. ${what}`;
  }
  const next = dpsMissed(prompt, fb.answer)[0] as PositionNote;
  return `${tapped}; the next note was ${where(next)}. ${what}`;
}
