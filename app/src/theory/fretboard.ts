import { Note } from 'tonal';

/**
 * Pure fretboard model (design §8). Strings are numbered the guitarist's way:
 * string 1 is the highest-pitched string, string N (6 on a guitar) the lowest.
 * Item IDs such as `note@s6f5` use the same numbering.
 */

export type AccidentalPref = 'sharp' | 'flat';

export interface Tuning {
  readonly id: string;
  readonly name: string;
  /** Open-string notes from the lowest-pitched string to the highest. */
  readonly notes: readonly string[];
}

export interface Position {
  readonly string: number;
  readonly fret: number;
}

export interface FretRange {
  readonly from: number;
  readonly to: number;
}

export interface FretNote {
  /** Pitch class, spelled per the accidental preference, e.g. `F#`. */
  readonly pc: string;
  /** Scientific pitch name, e.g. `F#3`. */
  readonly name: string;
  readonly midi: number;
  /** 0–11, C = 0. */
  readonly chroma: number;
}

export const STANDARD_TUNING: Tuning = {
  id: 'standard',
  name: 'Standard (EADGBE)',
  notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
};

export const DROP_D_TUNING: Tuning = {
  id: 'drop-d',
  name: 'Drop D (DADGBE)',
  notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
};

export const MAX_FRET = 24;

/** The fret-marker landmarks (topic F3). */
export const INLAY_FRETS: readonly number[] = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
export const DOUBLE_INLAY_FRETS: readonly number[] = [12, 24];

export const NATURAL_PCS: readonly string[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_PCS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export function stringCount(tuning: Tuning = STANDARD_TUNING): number {
  return tuning.notes.length;
}

/** All string numbers, highest-pitched (1) first. */
export function allStrings(tuning: Tuning = STANDARD_TUNING): number[] {
  return Array.from({ length: stringCount(tuning) }, (_, i) => i + 1);
}

function assertString(string: number, tuning: Tuning): void {
  if (!Number.isInteger(string) || string < 1 || string > stringCount(tuning)) {
    throw new RangeError(`String ${string} is outside 1–${stringCount(tuning)}`);
  }
}

function assertFret(fret: number): void {
  if (!Number.isInteger(fret) || fret < 0 || fret > MAX_FRET) {
    throw new RangeError(`Fret ${fret} is outside 0–${MAX_FRET}`);
  }
}

export function openStringMidi(string: number, tuning: Tuning = STANDARD_TUNING): number {
  assertString(string, tuning);
  const name = tuning.notes[stringCount(tuning) - string];
  const midi = name === undefined ? null : Note.midi(name);
  if (midi === null) throw new Error(`Invalid tuning note for string ${string}: ${name}`);
  return midi;
}

export function midiAt(pos: Position, tuning: Tuning = STANDARD_TUNING): number {
  assertFret(pos.fret);
  return openStringMidi(pos.string, tuning) + pos.fret;
}

export function chromaToPc(chroma: number, pref: AccidentalPref = 'sharp'): string {
  const c = ((chroma % 12) + 12) % 12;
  return (pref === 'sharp' ? SHARP_PCS : FLAT_PCS)[c] as string;
}

export function midiToFretNote(midi: number, pref: AccidentalPref = 'sharp'): FretNote {
  const chroma = ((midi % 12) + 12) % 12;
  const pc = chromaToPc(chroma, pref);
  const octave = Math.floor(midi / 12) - 1;
  return { pc, name: `${pc}${octave}`, midi, chroma };
}

/** (string, fret) → note. */
export function noteAt(
  pos: Position,
  tuning: Tuning = STANDARD_TUNING,
  pref: AccidentalPref = 'sharp',
): FretNote {
  return midiToFretNote(midiAt(pos, tuning), pref);
}

/** Chroma (0–11) of a pitch class or note name; throws on invalid input. */
export function chromaOf(note: string): number {
  const chroma = Note.chroma(note);
  if (chroma === undefined || Number.isNaN(chroma)) throw new Error(`Invalid note: ${note}`);
  return chroma;
}

export function samePitchClass(a: string, b: string): boolean {
  return chromaOf(a) === chromaOf(b);
}

export function isNatural(note: string): boolean {
  return Note.get(note).acc === '' && !Note.get(note).empty;
}

export interface SearchOptions {
  tuning?: Tuning;
  fretRange?: FretRange;
  strings?: readonly number[];
}

function eachPosition(opts: SearchOptions, fn: (pos: Position) => void): void {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const range = opts.fretRange ?? { from: 0, to: 12 };
  const strings = opts.strings ?? allStrings(tuning);
  for (const string of strings) {
    for (let fret = range.from; fret <= range.to; fret++) fn({ string, fret });
  }
}

/** name → positions: every position of a pitch class within the search window. */
export function positionsOfPitchClass(note: string, opts: SearchOptions = {}): Position[] {
  const chroma = chromaOf(note);
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const out: Position[] = [];
  eachPosition(opts, (pos) => {
    if (((midiAt(pos, tuning) % 12) + 12) % 12 === chroma) out.push(pos);
  });
  return out;
}

/** Every position sounding exactly this pitch (unison positions). */
export function positionsOfMidi(midi: number, opts: SearchOptions = {}): Position[] {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const out: Position[] = [];
  eachPosition(opts, (pos) => {
    if (midiAt(pos, tuning) === midi) out.push(pos);
  });
  return out;
}

/**
 * Octaves of a position (topic C1): every other position within the window
 * whose pitch is a whole number of octaves away (excluding unisons).
 */
export function octavesOf(pos: Position, opts: SearchOptions = {}): Position[] {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const midi = midiAt(pos, tuning);
  return positionsOfPitchClass(midiToFretNote(midi).pc, opts).filter((p) => {
    const diff = midiAt(p, tuning) - midi;
    return diff !== 0 && diff % 12 === 0;
  });
}

/**
 * The classic octave shape from a position: the same note one octave up, two
 * strings higher. In standard tuning this is +2 frets, except when the pair
 * crosses the G–B string boundary (+3 frets) — the "G–B shift".
 */
export function octaveShapeUp(pos: Position, tuning: Tuning = STANDARD_TUNING): Position | null {
  const target = pos.string - 2;
  if (target < 1) return null;
  const fret = midiAt(pos, tuning) + 12 - openStringMidi(target, tuning);
  if (fret < 0 || fret > MAX_FRET) return null;
  return { string: target, fret };
}

/** True if moving from string a to string b crosses the G–B (major-3rd) pair in standard tuning. */
export function crossesGBShift(a: number, b: number, tuning: Tuning = STANDARD_TUNING): boolean {
  const lo = Math.max(a, b);
  const hi = Math.min(a, b);
  for (let s = lo; s > hi; s--) {
    if (openStringMidi(s - 1, tuning) - openStringMidi(s, tuning) === 4) return true;
  }
  return false;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.string === b.string && a.fret === b.fret;
}

export function inRange(fret: number, range: FretRange): boolean {
  return fret >= range.from && fret <= range.to;
}

/** Accessible label for a fretboard cell, e.g. "string 5, fret 7, E". */
export function cellLabel(
  pos: Position,
  opts: { tuning?: Tuning; pref?: AccidentalPref; revealNote?: boolean } = {},
): string {
  const base = `string ${pos.string}, fret ${pos.fret}`;
  if (!opts.revealNote) return base;
  return `${base}, ${noteAt(pos, opts.tuning, opts.pref).pc}`;
}
