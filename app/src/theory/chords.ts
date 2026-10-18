import { Chord, Interval, Note } from 'tonal';
import { chromaOf } from './fretboard';
import type { ChordQuality } from './harmony';

/**
 * Chord construction and spelling (topic C5): triads, then the four common
 * sevenths, then sus and add chords, all spelled by tonal. The kinds and their
 * formulas live here so drills (D7 spelling, D8 chord tones) and skills share
 * one vocabulary. `harmony.ts` keeps its own `ChordQuality` for diatonic work;
 * `fromHarmonyQuality` maps between the two.
 */

export type ChordKind =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'maj7'
  | '7'
  | 'm7'
  | 'm7b5'
  | 'dim7'
  | 'sus2'
  | 'sus4'
  | 'add9';

/** Teaching order within C5: triads → sevenths → sus/add. */
export type ChordFamily = 'triad' | 'seventh' | 'suspended' | 'added';

/** A formula degree, relative to the chord root. */
export type ChordDegree =
  '1' | '2' | '3' | 'b3' | '4' | '5' | 'b5' | '#5' | '7' | 'b7' | 'bb7' | '9';

export interface ChordKindInfo {
  readonly kind: ChordKind;
  readonly family: ChordFamily;
  /** Symbol suffix as charts write it: `` (C), `m7b5` (Bm7b5). */
  readonly suffix: string;
  /** Spoken name, e.g. `half-diminished seventh`. */
  readonly name: string;
  /** Formula, root first: 1 3 5 b7. */
  readonly formula: readonly ChordDegree[];
  /** tonal chord type used for spelling. */
  readonly tonalType: string;
}

export const CHORD_KINDS: readonly ChordKindInfo[] = [
  {
    kind: 'major',
    family: 'triad',
    suffix: '',
    name: 'major',
    formula: ['1', '3', '5'],
    tonalType: 'M',
  },
  {
    kind: 'minor',
    family: 'triad',
    suffix: 'm',
    name: 'minor',
    formula: ['1', 'b3', '5'],
    tonalType: 'm',
  },
  {
    kind: 'diminished',
    family: 'triad',
    suffix: 'dim',
    name: 'diminished',
    formula: ['1', 'b3', 'b5'],
    tonalType: 'dim',
  },
  {
    kind: 'augmented',
    family: 'triad',
    suffix: 'aug',
    name: 'augmented',
    formula: ['1', '3', '#5'],
    tonalType: 'aug',
  },
  {
    kind: 'maj7',
    family: 'seventh',
    suffix: 'maj7',
    name: 'major seventh',
    formula: ['1', '3', '5', '7'],
    tonalType: 'maj7',
  },
  {
    kind: '7',
    family: 'seventh',
    suffix: '7',
    name: 'dominant seventh',
    formula: ['1', '3', '5', 'b7'],
    tonalType: '7',
  },
  {
    kind: 'm7',
    family: 'seventh',
    suffix: 'm7',
    name: 'minor seventh',
    formula: ['1', 'b3', '5', 'b7'],
    tonalType: 'm7',
  },
  {
    kind: 'm7b5',
    family: 'seventh',
    suffix: 'm7b5',
    name: 'half-diminished seventh',
    formula: ['1', 'b3', 'b5', 'b7'],
    tonalType: 'm7b5',
  },
  {
    kind: 'dim7',
    family: 'seventh',
    suffix: 'dim7',
    name: 'diminished seventh',
    formula: ['1', 'b3', 'b5', 'bb7'],
    tonalType: 'dim7',
  },
  {
    kind: 'sus2',
    family: 'suspended',
    suffix: 'sus2',
    name: 'suspended second',
    formula: ['1', '2', '5'],
    tonalType: 'sus2',
  },
  {
    kind: 'sus4',
    family: 'suspended',
    suffix: 'sus4',
    name: 'suspended fourth',
    formula: ['1', '4', '5'],
    tonalType: 'sus4',
  },
  {
    kind: 'add9',
    family: 'added',
    suffix: 'add9',
    name: 'added ninth',
    formula: ['1', '3', '5', '9'],
    tonalType: 'add9',
  },
];

/** The kinds C5 names explicitly: major/minor triads, maj7/7/m7/m7b5, sus2/sus4, add9. */
export const C5_CHORD_KINDS: readonly ChordKind[] = [
  'major',
  'minor',
  'maj7',
  '7',
  'm7',
  'm7b5',
  'sus2',
  'sus4',
  'add9',
];

/**
 * Pairs learners mix up (research/03 C5): the b7 of `7` vs the 7 of `maj7`,
 * `m7` vs `m7b5`, and the two sus chords.
 */
export const CONFUSABLE_CHORD_KINDS: readonly (readonly [ChordKind, ChordKind])[] = [
  ['7', 'maj7'],
  ['m7', 'm7b5'],
  ['m7', '7'],
  ['sus2', 'sus4'],
  ['major', 'minor'],
  ['add9', 'sus2'],
];

const BY_KIND = new Map(CHORD_KINDS.map((k) => [k.kind, k]));

const DEGREE_INTERVAL: Record<ChordDegree, string> = {
  '1': '1P',
  '2': '2M',
  '3': '3M',
  b3: '3m',
  '4': '4P',
  '5': '5P',
  b5: '5d',
  '#5': '5A',
  '7': '7M',
  b7: '7m',
  bb7: '7d',
  '9': '9M',
};

/** Extra suffixes accepted by `parseChord`, beyond each kind's own. */
const SUFFIX_ALIASES: Record<string, ChordKind> = {
  M: 'major',
  maj: 'major',
  min: 'minor',
  '-': 'minor',
  '°': 'diminished',
  o: 'diminished',
  '+': 'augmented',
  M7: 'maj7',
  Δ: 'maj7',
  Δ7: 'maj7',
  dom7: '7',
  min7: 'm7',
  '-7': 'm7',
  ø: 'm7b5',
  ø7: 'm7b5',
  '-7b5': 'm7b5',
  '°7': 'dim7',
  o7: 'dim7',
  sus: 'sus4',
  add2: 'add9',
};

export function chordKindInfo(kind: ChordKind): ChordKindInfo {
  const info = BY_KIND.get(kind);
  if (!info) throw new Error(`Unknown chord kind: ${kind as string}`);
  return info;
}

export function isChordKind(value: string): value is ChordKind {
  return BY_KIND.has(value as ChordKind);
}

function rootPc(root: string): string {
  const n = Note.get(root);
  if (n.empty || n.oct !== undefined) throw new Error(`Invalid chord root: ${root}`);
  return n.pc;
}

/** Chord symbol: `nameChord('B', 'm7')` → `Bm7`. */
export function nameChord(root: string, kind: ChordKind): string {
  return `${rootPc(root)}${chordKindInfo(kind).suffix}`;
}

export interface ParsedChord {
  readonly root: string;
  readonly kind: ChordKind;
}

/** `Bm7`, `F#m7b5`, `Bø`, `Csus`, `Eadd9`, `GΔ7` → root and kind. Throws on anything else. */
export function parseChord(symbol: string): ParsedChord {
  const m = /^([A-G](?:#{1,2}|b{1,2})?)(.*)$/.exec(symbol.trim());
  const suffix = m ? (m[2] as string) : '';
  const kind = CHORD_KINDS.find((k) => k.suffix === suffix)?.kind ?? SUFFIX_ALIASES[suffix];
  if (!m || kind === undefined) throw new Error(`Invalid chord symbol: ${symbol}`);
  return { root: rootPc(m[1] as string), kind };
}

/**
 * The chord's notes as pitch classes in formula order, spelled by tonal:
 * Bm7 → B D F# A; Gbdim → Gb Bbb Dbb (strict spelling keeps the letters).
 */
export function spellChord(root: string, kind: ChordKind): string[] {
  const chord = Chord.getChord(chordKindInfo(kind).tonalType, rootPc(root));
  return chord.notes;
}

/** `spellChord` from a symbol: `chordNotes('Bm7')` → B D F# A. */
export function chordNotes(symbol: string): string[] {
  const { root, kind } = parseChord(symbol);
  return spellChord(root, kind);
}

export function chordFormula(kind: ChordKind): readonly ChordDegree[] {
  return chordKindInfo(kind).formula;
}

/**
 * The note on one formula degree, or `null` if the chord doesn't have it:
 * the 3rd of D7 is F#; Csus4 has no 3.
 */
export function chordToneOf(root: string, kind: ChordKind, degree: ChordDegree): string | null {
  const i = chordFormula(kind).indexOf(degree);
  return i < 0 ? null : (spellChord(root, kind)[i] as string);
}

/** The formula degree a pitch plays in the chord, or `null`: F# in D7 → `3`. */
export function degreeInChord(root: string, kind: ChordKind, note: string): ChordDegree | null {
  const c = chromaOf(note);
  const i = spellChord(root, kind).findIndex((n) => chromaOf(n) === c);
  return i < 0 ? null : (chordFormula(kind)[i] as ChordDegree);
}

export function chordDegreeSemitones(degree: ChordDegree): number {
  return Interval.semitones(DEGREE_INTERVAL[degree]);
}

export interface ChordDifference {
  /** Degrees only the first kind has. */
  readonly onlyA: readonly ChordDegree[];
  /** Degrees only the second kind has. */
  readonly onlyB: readonly ChordDegree[];
}

/**
 * How two kinds differ, for feedback: `7` vs `maj7` → onlyA [b7], onlyB [7].
 */
export function chordDifference(a: ChordKind, b: ChordKind): ChordDifference {
  const fa = chordFormula(a);
  const fb = chordFormula(b);
  return { onlyA: fa.filter((d) => !fb.includes(d)), onlyB: fb.filter((d) => !fa.includes(d)) };
}

/** True when the notes (any order, any spelling) are exactly the chord's pitches. */
export function isChordVoicing(root: string, kind: ChordKind, notes: readonly string[]): boolean {
  const want = new Set(spellChord(root, kind).map(chromaOf));
  const got = new Set(notes.map(chromaOf));
  return want.size === got.size && [...want].every((c) => got.has(c));
}

/** True when the spelling avoids double sharps and flats (Gbdim fails; F#dim passes). */
export function isPracticalSpelling(notes: readonly string[]): boolean {
  return notes.every((n) => !/##|bb/.test(n));
}

const FROM_HARMONY: Record<ChordQuality, ChordKind> = {
  major: 'major',
  minor: 'minor',
  diminished: 'diminished',
  augmented: 'augmented',
  dominant7: '7',
  major7: 'maj7',
  minor7: 'm7',
  'half-diminished7': 'm7b5',
  diminished7: 'dim7',
};

/** Map `harmony.ts`'s diatonic qualities onto chord kinds. */
export function fromHarmonyQuality(quality: ChordQuality): ChordKind {
  return FROM_HARMONY[quality];
}
