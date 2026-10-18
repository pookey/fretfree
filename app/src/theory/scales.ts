import { Interval, Note, Scale } from 'tonal';
import { chromaOf } from './fretboard';
import { keySignature, majorKey, type ScaleDegree } from './harmony';

/**
 * Major-scale construction, degrees and key spelling (topic C4). Spelling is
 * strict: every key uses each letter A–G exactly once, so F# major has E#, not
 * F, and "the 6th of Eb" is C. Drills that grade spelling use
 * `compareSpelling` so an enharmonic answer can be explained rather than just
 * marked wrong.
 */

export const SCALE_DEGREES: readonly ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7];

/** The whole/half-step recipe of the major scale: W W H W W W H. */
export const MAJOR_SCALE_STEPS: readonly ('W' | 'H')[] = ['W', 'W', 'H', 'W', 'W', 'W', 'H'];

/** Interval above the tonic for each major-scale degree (index = degree − 1). */
export const MAJOR_DEGREE_INTERVALS: readonly string[] = ['1P', '2M', '3M', '4P', '5P', '6M', '7M'];

/** Functional names, index = degree − 1. */
export const DEGREE_NAMES: readonly string[] = [
  'tonic',
  'supertonic',
  'mediant',
  'subdominant',
  'dominant',
  'submediant',
  'leading tone',
];

/**
 * The 15 major keys with a real key signature (0–7 sharps or flats), in
 * circle order from C sharpwards then flatwards. B/Cb, F#/Gb and C#/Db are
 * enharmonic pairs; tonics outside this list (G#, D#, A#, E#, B#, Fb) need
 * double accidentals.
 */
export const MAJOR_KEY_TONICS: readonly string[] = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
];

/** One spelling per pitch class, as drills usually present keys (no C#, Gb or Cb). */
export const COMMON_MAJOR_KEY_TONICS: readonly string[] = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

/** Chromatic degree labels relative to a root, index = semitones above it. */
const CHROMATIC_DEGREES = [
  '1',
  'b2',
  '2',
  'b3',
  '3',
  '4',
  'b5',
  '5',
  'b6',
  '6',
  'b7',
  '7',
] as const;

export type ChromaticDegree = (typeof CHROMATIC_DEGREES)[number];

function tonicPc(tonic: string): string {
  const n = Note.get(tonic);
  if (n.empty || n.oct !== undefined) throw new Error(`Invalid tonic: ${tonic}`);
  return n.pc;
}

function assertDegree(degree: number): asserts degree is ScaleDegree {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) {
    throw new RangeError(`Scale degree ${degree} is outside 1–7`);
  }
}

/** The seven notes of the major scale, tonic first, spelled by letter (via tonal). */
export function majorScale(tonic: string): string[] {
  return Scale.get(`${tonicPc(tonic)} major`).notes;
}

/** True when the key's spelling needs no double sharps or flats. */
export function isPracticalMajorKey(tonic: string): boolean {
  return MAJOR_KEY_TONICS.includes(tonicPc(tonic));
}

/** The note on a degree: `scaleDegreeNote('Eb', 6)` → `C`. */
export function scaleDegreeNote(tonic: string, degree: number): string {
  assertDegree(degree);
  return majorScale(tonic)[degree - 1] as string;
}

/**
 * The degree a note occupies in the major key, or `null` if it isn't in the
 * key. Spelling-strict: in F# major, `E#` is 7 but `F` is `null`.
 */
export function degreeOfNote(tonic: string, note: string): ScaleDegree | null {
  const pc = Note.get(note).pc;
  const i = majorScale(tonic).indexOf(pc);
  return i < 0 ? null : ((i + 1) as ScaleDegree);
}

/** Like `degreeOfNote`, but matching by pitch: in F# major, `F` is 7. */
export function degreeOfPitch(tonic: string, note: string): ScaleDegree | null {
  const c = chromaOf(note);
  const i = majorScale(tonic).findIndex((n) => chromaOf(n) === c);
  return i < 0 ? null : ((i + 1) as ScaleDegree);
}

/** Chromatic degree of any note relative to a root: E over C → `3`, Bb over C → `b7`. */
export function chromaticDegree(root: string, note: string): ChromaticDegree {
  const semis = (((chromaOf(note) - chromaOf(root)) % 12) + 12) % 12;
  return CHROMATIC_DEGREES[semis] as ChromaticDegree;
}

export function degreeName(degree: number): string {
  assertDegree(degree);
  return DEGREE_NAMES[degree - 1] as string;
}

/** Ordinal label used in prompts: 1st, 2nd, 3rd … 7th. */
export function degreeOrdinal(degree: number): string {
  assertDegree(degree);
  return `${degree}${degree === 1 ? 'st' : degree === 2 ? 'nd' : degree === 3 ? 'rd' : 'th'}`;
}

export interface MajorKeySpelling {
  readonly tonic: string;
  readonly notes: readonly string[];
  /** Sharps (+) or flats (−) in the signature. */
  readonly alteration: number;
  /** The altered notes in signature order, e.g. F# C# or Bb Eb. */
  readonly accidentals: readonly string[];
}

/** Everything needed to spell a major key and explain its signature. */
export function majorKeySpelling(tonic: string): MajorKeySpelling {
  const t = tonicPc(tonic);
  const sig = keySignature(majorKey(t));
  return {
    tonic: t,
    notes: majorScale(t),
    alteration: sig.alteration,
    accidentals: sig.accidentals,
  };
}

/** True when consecutive notes use consecutive letters and no letter repeats. */
export function usesEachLetterOnce(notes: readonly string[]): boolean {
  const letters = notes.map((n) => Note.get(n).letter);
  if (letters.some((l) => !l) || new Set(letters).size !== letters.length) return false;
  return letters.every((l, i) => {
    if (i === 0) return true;
    return Interval.get(Interval.distance(notes[i - 1] as string, notes[i] as string)).num === 2;
  });
}

export type SpellingVerdict = 'correct' | 'enharmonic' | 'wrong';

/**
 * Grade a spelled note: same spelling is `correct`, same pitch with another
 * spelling (F for E#) is `enharmonic`, anything else is `wrong`.
 */
export function compareSpelling(expected: string, given: string): SpellingVerdict {
  const e = Note.get(expected);
  const g = Note.get(given);
  if (e.empty || g.empty) return 'wrong';
  if (e.pc === g.pc) return 'correct';
  return e.chroma === g.chroma ? 'enharmonic' : 'wrong';
}

/** Grade a spelled sequence (a key or chord) note by note. */
export function compareSpellings(
  expected: readonly string[],
  given: readonly string[],
): SpellingVerdict[] {
  return expected.map((e, i) => {
    const g = given[i];
    return g === undefined ? 'wrong' : compareSpelling(e, g);
  });
}
