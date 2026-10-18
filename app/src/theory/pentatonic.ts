import { Scale } from 'tonal';
import {
  MAX_FRET,
  STANDARD_TUNING,
  chromaOf,
  midiAt,
  openStringMidi,
  stringCount,
  type FretRange,
  type Position,
} from './fretboard';
import { relativeMajor, relativeMinor, type ScaleDegree } from './harmony';
import { chromaticDegree, majorScale, type ChromaticDegree } from './scales';
import { cagedShape, shapeSpan, type CagedShape, type CagedShapeName } from './shapes';

/**
 * Pentatonic boxes and major-scale positions (topics C7, I7), standard tuning.
 *
 * Box numbering follows the usual convention: box 1 starts on the root on
 * string 6, and each box starts on the next scale note. That makes box N wrap
 * the same CAGED shape in both qualities: 1 → E, 2 → D, 3 → C, 4 → A, 5 → G
 * (minor shapes for minor boxes, major shapes for major boxes). Boxes chain up
 * the neck in that order, sharing their edge notes, which is what breaks "box
 * prison" (research/03 C7).
 *
 * The relative link: a minor box is the major box one number lower of its
 * relative major (A minor box 1 = C major box 5, both around the G shape of C).
 *
 * Major-scale positions (I7) build on the same five boxes: the CAGED position
 * is the major box with its two gaps, the 4 and the 7, filled in. The
 * 3-notes-per-string system is `majorScale3nps`.
 */

export type PentatonicQuality = 'major' | 'minor';
export type BoxNumber = 1 | 2 | 3 | 4 | 5;

export const PENTATONIC_QUALITIES: readonly PentatonicQuality[] = ['minor', 'major'];
export const BOX_NUMBERS: readonly BoxNumber[] = [1, 2, 3, 4, 5];

/** The CAGED shape each box wraps, index = box − 1. */
const BOX_SHAPES: readonly CagedShapeName[] = ['E', 'D', 'C', 'A', 'G'];

export interface ScaleNote extends Position {
  /** Pitch class as the scale spells it. */
  readonly pc: string;
}

export interface PentatonicNote extends ScaleNote {
  /** Degree relative to the box's own root: 1 b3 4 5 b7 (minor) or 1 2 3 5 6 (major). */
  readonly degree: ChromaticDegree;
}

export interface PentatonicBox {
  readonly root: string;
  readonly quality: PentatonicQuality;
  readonly box: BoxNumber;
  /** The CAGED shape the box wraps (of the same root and quality). */
  readonly shape: CagedShapeName;
  readonly span: FretRange;
  /** Ascending in pitch: string 6 first, two notes per string. */
  readonly notes: readonly PentatonicNote[];
}

export interface PlacementOptions {
  /** Place at the lowest position whose frets are all ≥ this. Default 0. */
  readonly minFret?: number;
}

function assertBox(box: number): asserts box is BoxNumber {
  if (!BOX_NUMBERS.includes(box as BoxNumber)) throw new RangeError(`Box ${box} is outside 1–5`);
}

/** The five notes of the scale, root first, spelled by tonal: A C D E G; C D E G A. */
export function pentatonicScale(root: string, quality: PentatonicQuality): string[] {
  const notes = Scale.get(`${root} ${quality} pentatonic`).notes;
  if (notes.length !== 5) throw new Error(`Invalid pentatonic root: ${root}`);
  return notes;
}

export function boxShape(box: BoxNumber): CagedShapeName {
  assertBox(box);
  return BOX_SHAPES[box - 1] as CagedShapeName;
}

export function boxForShape(shape: CagedShapeName): BoxNumber {
  return (BOX_SHAPES.indexOf(shape) + 1) as BoxNumber;
}

/** The box above (5 wraps round to 1, an octave up). */
export function nextBox(box: BoxNumber): BoxNumber {
  assertBox(box);
  return ((box % 5) + 1) as BoxNumber;
}

/** The box below (1 wraps round to 5). */
export function previousBox(box: BoxNumber): BoxNumber {
  assertBox(box);
  return (((box + 3) % 5) + 1) as BoxNumber;
}

/**
 * A scale run up the neck from string 6: `perString` consecutive scale notes
 * on each string, starting on `scale[startIndex]`. Placed at the lowest
 * position whose frets are all ≥ `minFret`. Pentatonic boxes are 2 per string,
 * 3NPS scale patterns 3 per string.
 */
export function notesPerStringRun(
  scale: readonly string[],
  startIndex: number,
  perString: number,
  opts: PlacementOptions = {},
): ScaleNote[] {
  const minFret = opts.minFret ?? 0;
  const lowString = stringCount(STANDARD_TUNING);
  const first = scale[startIndex];
  if (first === undefined) throw new RangeError(`No scale note at index ${startIndex}`);
  const openLow = openStringMidi(lowString);
  let midi = openLow + ((((chromaOf(first) - openLow) % 12) + 12) % 12);
  const run: { string: number; midi: number; pc: string }[] = [];
  for (let i = 0; i < perString * lowString; i++) {
    const pc = scale[(startIndex + i) % scale.length] as string;
    if (i > 0) midi += (((chromaOf(pc) - midi) % 12) + 12) % 12 || 12;
    run.push({ string: lowString - Math.floor(i / perString), midi, pc });
  }
  const frets = run.map((n) => n.midi - openStringMidi(n.string));
  let shift = 0;
  while (Math.min(...frets) + shift < minFret) shift += 12;
  if (Math.max(...frets) + shift > MAX_FRET) {
    throw new RangeError(`Run from ${first} does not fit above fret ${minFret}`);
  }
  return run.map((n, i) => ({ string: n.string, fret: (frets[i] as number) + shift, pc: n.pc }));
}

function spanOf(notes: readonly Position[]): FretRange {
  return shapeSpan({ notes });
}

/** Box `box` of the root's pentatonic, e.g. A minor box 1 at frets 5–8. */
export function pentatonicBox(
  root: string,
  quality: PentatonicQuality,
  box: BoxNumber,
  opts: PlacementOptions = {},
): PentatonicBox {
  assertBox(box);
  const scale = pentatonicScale(root, quality);
  const notes = notesPerStringRun(scale, box - 1, 2, opts).map((n) => ({
    ...n,
    degree: chromaticDegree(root, n.pc),
  }));
  return {
    root: scale[0] as string,
    quality,
    box,
    shape: boxShape(box),
    span: spanOf(notes),
    notes,
  };
}

/** All five boxes, chained up the neck from the lowest position. */
export function pentatonicBoxes(root: string, quality: PentatonicQuality): PentatonicBox[] {
  return BOX_NUMBERS.map((b) => pentatonicBox(root, quality, b)).sort(
    (a, b) => a.span.from - b.span.from,
  );
}

/** The relative scale: A minor ↔ C major. Same five notes, different root. */
export function relativePentatonic(
  root: string,
  quality: PentatonicQuality,
): { root: string; quality: PentatonicQuality } {
  return quality === 'minor'
    ? { root: relativeMajor(root), quality: 'major' }
    : { root: relativeMinor(root), quality: 'minor' };
}

/** The number the same fingering has in the relative scale: minor N = major N − 1. */
export function relativeBoxNumber(box: BoxNumber, quality: PentatonicQuality): BoxNumber {
  return quality === 'minor' ? previousBox(box) : nextBox(box);
}

function contains(outer: readonly Position[], inner: readonly Position[]): boolean {
  return inner.every((p) => outer.some((o) => o.string === p.string && o.fret === p.fret));
}

/**
 * The same box read in the relative scale, at the same frets: A minor box 1
 * (5–8) is C major box 5.
 */
export function relativeBox(box: PentatonicBox): PentatonicBox {
  const rel = relativePentatonic(box.root, box.quality);
  const number = relativeBoxNumber(box.box, box.quality);
  return pentatonicBox(rel.root, rel.quality, number, { minFret: box.span.from });
}

/**
 * The CAGED chord the box wraps, placed inside it: A minor box 1 at fret 5
 * holds the E-shape Am barre at fret 5.
 */
export function boxChordShape(box: PentatonicBox): CagedShape {
  return cagedShape(box.shape, box.root, { quality: box.quality, minFret: box.span.from });
}

/**
 * The box around a major or minor CAGED shape (the inverse of
 * `boxChordShape`). A box reaches at most two frets below its shape.
 */
export function boxAroundShape(shape: CagedShape): PentatonicBox {
  if (shape.quality === 'dominant7') {
    throw new RangeError('Dominant-7 shapes have no pentatonic box of their own');
  }
  const from = shapeSpan(shape).from;
  const box = pentatonicBox(shape.root, shape.quality, boxForShape(shape.shape), {
    minFret: Math.max(0, from - 2),
  });
  if (!contains(box.notes, shape.notes)) {
    throw new RangeError(`No box holds the ${shape.shape} shape of ${shape.root} at fret ${from}`);
  }
  return box;
}

/**
 * Positions two boxes share. Neighbouring boxes overlap on one note per
 * string, which is how one box leads into the next.
 */
export function sharedNotes(
  a: { readonly notes: readonly Position[] },
  b: { readonly notes: readonly Position[] },
): Position[] {
  return a.notes
    .filter((n) => b.notes.some((m) => m.string === n.string && m.fret === n.fret))
    .map((n) => ({ string: n.string, fret: n.fret }));
}

// ---------------------------------------------------------------------------
// Major scale in five positions (I7)

export interface MajorScaleNote extends ScaleNote {
  readonly degree: ScaleDegree;
}

export interface MajorScalePosition {
  readonly tonic: string;
  /** Same numbering as the major pentatonic boxes: 1 = E shape … 5 = G shape. */
  readonly position: BoxNumber;
  readonly shape: CagedShapeName;
  readonly span: FretRange;
  /** Ascending in pitch. */
  readonly notes: readonly MajorScaleNote[];
}

function majorNoteAt(scale: readonly string[], pos: Position): MajorScaleNote | null {
  const c = midiAt(pos) % 12;
  const i = scale.findIndex((n) => chromaOf(n) === c);
  if (i < 0) return null;
  return { ...pos, pc: scale[i] as string, degree: (i + 1) as ScaleDegree };
}

/**
 * The major scale in one CAGED position: the matching major pentatonic box
 * with its gaps (the 4 and 7) filled in, plus the scale note just below and
 * just above the box when they fall inside its frets. A gap between two
 * strings goes on whichever string keeps it nearer the box's frets (the lower
 * fret on a tie). C major position 1 (E shape) is frets 7–10.
 */
export function majorScalePosition(
  tonic: string,
  position: BoxNumber,
  opts: PlacementOptions = {},
): MajorScalePosition {
  const box = pentatonicBox(tonic, 'major', position, opts);
  const scale = majorScale(tonic);
  const inScale = (midi: number) => scale.some((n) => chromaOf(n) === midi % 12);
  const { from, to } = box.span;
  const outside = (fret: number) => (fret < from ? from - fret : fret > to ? fret - to : 0);
  const fits = (p: Position) => p.fret >= 0 && p.fret <= MAX_FRET;
  const at = (string: number, midi: number): Position => ({
    string,
    fret: midi - openStringMidi(string),
  });

  const cells: Position[] = [];
  const first = box.notes[0] as PentatonicNote;
  const below = midiAt(first) - (inScale(midiAt(first) - 1) ? 1 : 2);
  const low = at(first.string, below);
  if (fits(low) && low.fret >= from) cells.push(low);
  box.notes.forEach((a, i) => {
    cells.push(a);
    const b = box.notes[i + 1];
    if (!b) return;
    for (let midi = midiAt(a) + 1; midi < midiAt(b); midi++) {
      if (!inScale(midi)) continue;
      const options = [at(a.string, midi), at(b.string, midi)].filter(fits);
      options.sort((x, y) => outside(x.fret) - outside(y.fret) || x.fret - y.fret);
      cells.push(options[0] as Position);
    }
  });
  const last = box.notes[box.notes.length - 1] as PentatonicNote;
  const above = midiAt(last) + (inScale(midiAt(last) + 1) ? 1 : 2);
  const high = at(last.string, above);
  if (fits(high) && high.fret <= to) cells.push(high);

  const notes = cells.map((c) => majorNoteAt(scale, c) as MajorScaleNote);
  return {
    tonic: scale[0] as string,
    position,
    shape: box.shape,
    span: spanOf(notes),
    notes,
  };
}

/** All five positions, chained up the neck from the lowest. */
export function majorScalePositions(tonic: string): MajorScalePosition[] {
  return BOX_NUMBERS.map((p) => majorScalePosition(tonic, p)).sort(
    (a, b) => a.span.from - b.span.from,
  );
}

/**
 * "Start from any degree" (I7): the notes of a position in ascending order,
 * from the lowest note on `degree` to the highest note on it.
 */
export function positionRun(
  position: { notes: readonly MajorScaleNote[] },
  degree: ScaleDegree,
): MajorScaleNote[] {
  const first = position.notes.findIndex((n) => n.degree === degree);
  const last = position.notes.map((n) => n.degree).lastIndexOf(degree);
  if (first < 0) throw new RangeError(`Degree ${degree} is not in this position`);
  return position.notes.slice(first, last + 1);
}

/**
 * The major scale three notes per string, starting on `startDegree` on string
 * 6 (7 patterns, one per degree).
 */
export function majorScale3nps(
  tonic: string,
  startDegree: ScaleDegree,
  opts: PlacementOptions = {},
): MajorScaleNote[] {
  const scale = majorScale(tonic);
  return notesPerStringRun(scale, startDegree - 1, 3, opts).map((n) => ({
    ...n,
    degree: (scale.indexOf(n.pc) + 1) as ScaleDegree,
  }));
}
