import { Interval, Note } from 'tonal';
import { MAX_FRET, chromaOf, chromaToPc, type AccidentalPref } from './fretboard';

/**
 * Harmony theory (topics C8, C9, C10, I3): diatonic chords, Roman and
 * Nashville numerals, the progression catalogue, capo and transposition maths,
 * and the circle of fifths.
 *
 * Conventions:
 * - Minor means natural minor (Aeolian).
 * - Numerals are measured against the major scale on the same tonic, so a
 *   minor key reads i ii° bIII iv v bVI bVII (research/03 C9 writes
 *   i–bVII–bVI–bVII). Nashville numbers follow the same rule: 1m 2° b3 4m 5m
 *   b6 b7, with the minor tonic as 1.
 * - Chord roots are spelled by key: F# in D major, Bb for bVII in C.
 */

export type KeyMode = 'major' | 'minor';

export interface MusicalKey {
  /** Pitch class, e.g. `F#`, `Bb`. */
  readonly tonic: string;
  readonly mode: KeyMode;
}

export type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'dominant7'
  | 'major7'
  | 'minor7'
  | 'half-diminished7'
  | 'diminished7';

export interface ChordSpec {
  readonly root: string;
  readonly quality: ChordQuality;
}

export interface DiatonicChord extends ChordSpec {
  readonly degree: ScaleDegree;
  /** Chord symbol, e.g. `F#m`, `Bdim`, `G7`. */
  readonly symbol: string;
  /** Roman numeral, e.g. `vi`, `vii°`, `bVII`, `V7`. */
  readonly roman: string;
  /** Nashville number, e.g. `6m`, `7°`, `b7`, `57`. */
  readonly nashville: string;
}

export interface DiatonicOptions {
  /** Diatonic seventh chords instead of triads. */
  readonly sevenths?: boolean;
}

// ---------------------------------------------------------------------------
// Keys and spelling

const LETTER_FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;
const MAJOR_SCALE_INTERVALS = ['1P', '2M', '3M', '4P', '5P', '6M', '7M'] as const;
const MINOR_SCALE_INTERVALS = ['1P', '2M', '3m', '4P', '5P', '6m', '7m'] as const;
/** Semitones above the tonic → interval used to spell a root in a key. */
const OFFSET_INTERVALS = [
  '1P',
  '2m',
  '2M',
  '3m',
  '3M',
  '4P',
  '4A',
  '5P',
  '6m',
  '6M',
  '7m',
  '7M',
] as const;

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Validates a pitch class (no octave) and returns it in tonal's spelling. */
function pc(note: string): string {
  const n = Note.get(note);
  if (n.empty || n.oct !== undefined) throw new Error(`Invalid pitch class: ${note}`);
  return n.pc;
}

/** Collapse double accidentals (Ebb → D) and leave everything else alone. */
function tidy(note: string): string {
  return /##|bb/.test(note) ? Note.simplify(note) : note;
}

function transposePc(note: string, interval: string): string {
  return tidy(Note.transpose(note, interval));
}

export function majorKey(tonic: string): MusicalKey {
  return { tonic: pc(tonic), mode: 'major' };
}

export function minorKey(tonic: string): MusicalKey {
  return { tonic: pc(tonic), mode: 'minor' };
}

/** `Am`, `F#m`, `A minor`, `Bb`, `C major` → key. Throws on anything else. */
export function parseKey(label: string): MusicalKey {
  const m = /^([A-Ga-g](?:#{1,2}|b{1,2})?)\s*(m|min|minor|maj|major)?$/.exec(label.trim());
  if (!m) throw new Error(`Invalid key: ${label}`);
  const tonic = (m[1] as string).charAt(0).toUpperCase() + (m[1] as string).slice(1);
  const minor = m[2] === 'm' || m[2] === 'min' || m[2] === 'minor';
  return minor ? minorKey(tonic) : majorKey(tonic);
}

/** Compact label used in item IDs and charts: `D`, `Am`. */
export function keyLabel(key: MusicalKey): string {
  return key.mode === 'major' ? key.tonic : `${key.tonic}m`;
}

/** Spoken name: `D major`, `A minor`. */
export function keyName(key: MusicalKey): string {
  return `${key.tonic} ${key.mode}`;
}

export function sameKey(a: MusicalKey, b: MusicalKey): boolean {
  return a.mode === b.mode && chromaOf(a.tonic) === chromaOf(b.tonic);
}

/** The seven scale notes of a key, tonic first. */
export function scaleOf(key: MusicalKey): string[] {
  const intervals = key.mode === 'major' ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
  return intervals.map((i) => Note.transpose(key.tonic, i));
}

/**
 * The note an interval above the tonic, spelled for the key: a note in the
 * key's scale keeps the scale's spelling; any other note keeps the interval's
 * spelling, with double accidentals simplified (Ebb → D).
 */
function spellAbove(key: MusicalKey, interval: string): string {
  const note = Note.transpose(key.tonic, interval);
  return scaleOf(key).find((n) => chromaOf(n) === chromaOf(note)) ?? tidy(note);
}

/**
 * Spell a chromatic pitch class inside a key: diatonic notes use the key's
 * spelling; chromatic ones are flattened degrees (bIII, bVI, bVII), except the
 * tritone, which is #IV.
 */
export function spellInKey(chroma: number, key: MusicalKey): string {
  const offset = mod12(chroma - chromaOf(key.tonic));
  return spellAbove(key, OFFSET_INTERVALS[offset] as string);
}

/**
 * The usual chart spelling of a chord root with no key context: majors as the
 * circle's major keys (Db, Eb, F#, Ab, Bb), minors as its minor keys (C#m,
 * D#m, F#m, G#m, Bbm).
 */
export function standardChordRoot(chroma: number, quality: ChordQuality): string {
  return standardKeyTonic(chroma, hasMinorThird(quality) ? 'minor' : 'major');
}

// ---------------------------------------------------------------------------
// Chords

const QUALITY_INTERVALS: Record<ChordQuality, readonly string[]> = {
  major: ['1P', '3M', '5P'],
  minor: ['1P', '3m', '5P'],
  diminished: ['1P', '3m', '5d'],
  augmented: ['1P', '3M', '5A'],
  dominant7: ['1P', '3M', '5P', '7m'],
  major7: ['1P', '3M', '5P', '7M'],
  minor7: ['1P', '3m', '5P', '7m'],
  'half-diminished7': ['1P', '3m', '5d', '7m'],
  diminished7: ['1P', '3m', '5d', '7d'],
};

const SYMBOL_SUFFIX: Record<ChordQuality, string> = {
  major: '',
  minor: 'm',
  diminished: 'dim',
  augmented: 'aug',
  dominant7: '7',
  major7: 'maj7',
  minor7: 'm7',
  'half-diminished7': 'm7b5',
  diminished7: 'dim7',
};

const SUFFIX_ALIASES: Record<string, ChordQuality> = {
  '': 'major',
  M: 'major',
  maj: 'major',
  m: 'minor',
  min: 'minor',
  '-': 'minor',
  dim: 'diminished',
  '°': 'diminished',
  o: 'diminished',
  aug: 'augmented',
  '+': 'augmented',
  '7': 'dominant7',
  maj7: 'major7',
  M7: 'major7',
  Δ: 'major7',
  Δ7: 'major7',
  m7: 'minor7',
  min7: 'minor7',
  '-7': 'minor7',
  m7b5: 'half-diminished7',
  ø: 'half-diminished7',
  ø7: 'half-diminished7',
  dim7: 'diminished7',
  '°7': 'diminished7',
  o7: 'diminished7',
};

export const CHORD_QUALITIES = Object.keys(QUALITY_INTERVALS) as ChordQuality[];

export function isSeventh(quality: ChordQuality): boolean {
  return QUALITY_INTERVALS[quality].length === 4;
}

/** True for qualities with a minor third (minor, diminished and their sevenths). */
export function hasMinorThird(quality: ChordQuality): boolean {
  return QUALITY_INTERVALS[quality][1] === '3m';
}

export function chordSymbol(chord: ChordSpec): string {
  return `${pc(chord.root)}${SYMBOL_SUFFIX[chord.quality]}`;
}

/** `F#m`, `Bdim`, `B°`, `G7`, `Cmaj7`, `Bm7b5`, `Bø` → chord. Throws on anything else. */
export function parseChordSymbol(symbol: string): ChordSpec {
  const m = /^([A-G](?:#{1,2}|b{1,2})?)(.*)$/.exec(symbol.trim());
  const quality = m ? SUFFIX_ALIASES[m[2] as string] : undefined;
  if (!m || quality === undefined) throw new Error(`Invalid chord symbol: ${symbol}`);
  return { root: pc(m[1] as string), quality };
}

function toSpec(chord: ChordSpec | string): ChordSpec {
  return typeof chord === 'string' ? parseChordSymbol(chord) : chord;
}

/** Chord tones as pitch classes, root first, e.g. Bm7b5 → B D F A. */
export function chordTones(chord: ChordSpec | string): string[] {
  const c = toSpec(chord);
  return QUALITY_INTERVALS[c.quality].map((i) => Note.transpose(pc(c.root), i));
}

export function sameChord(a: ChordSpec | string, b: ChordSpec | string): boolean {
  const x = toSpec(a);
  const y = toSpec(b);
  return x.quality === y.quality && chromaOf(x.root) === chromaOf(y.root);
}

// ---------------------------------------------------------------------------
// Numerals

export interface Numeral {
  readonly degree: ScaleDegree;
  /** Semitones relative to the major-scale degree on the tonic: -1 = b, +1 = #. */
  readonly alteration: number;
  readonly quality: ChordQuality;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

/** Suffix after an upper-case (major-third) or lower-case (minor-third) numeral. */
const ROMAN_SUFFIX: Record<ChordQuality, string> = {
  major: '',
  minor: '',
  diminished: '°',
  augmented: '+',
  dominant7: '7',
  major7: 'maj7',
  minor7: '7',
  'half-diminished7': 'ø7',
  diminished7: '°7',
};

const NASHVILLE_SUFFIX: Record<ChordQuality, string> = {
  major: '',
  minor: 'm',
  diminished: '°',
  augmented: '+',
  dominant7: '7',
  major7: 'maj7',
  minor7: 'm7',
  'half-diminished7': 'ø7',
  diminished7: '°7',
};

function accidentalPrefix(alteration: number): string {
  return alteration < 0 ? 'b'.repeat(-alteration) : '#'.repeat(alteration);
}

function prefixAlteration(prefix: string | undefined): number {
  if (!prefix) return 0;
  return prefix.startsWith('b') ? -prefix.length : prefix.length;
}

export function romanNumeral(n: Numeral): string {
  const base = ROMAN[n.degree - 1] as string;
  const numeral = hasMinorThird(n.quality) ? base.toLowerCase() : base;
  return `${accidentalPrefix(n.alteration)}${numeral}${ROMAN_SUFFIX[n.quality]}`;
}

export function nashvilleNumber(n: Numeral): string {
  return `${accidentalPrefix(n.alteration)}${n.degree}${NASHVILLE_SUFFIX[n.quality]}`;
}

const ROMAN_RE = /^(b{1,2}|#{1,2})?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/;

/**
 * `vi`, `bVII`, `vii°`, `V7`, `ii7`, `Imaj7`, `viiø7` → numeral; `null` if the
 * text is not a numeral this module writes (case and suffix must agree:
 * `I°` and `vi+` are rejected). `o` is accepted for `°`, and `ø` for `ø7`.
 */
export function parseRoman(text: string): Numeral | null {
  const m = ROMAN_RE.exec(text.trim());
  if (!m) return null;
  const numeral = m[2] as string;
  const upper = numeral === numeral.toUpperCase();
  const suffix = (m[3] as string).replace(/^o/, '°').replace(/^ø$/, 'ø7');
  const quality = CHORD_QUALITIES.find(
    (q) => hasMinorThird(q) !== upper && ROMAN_SUFFIX[q] === suffix,
  );
  if (quality === undefined) return null;
  const degree = (ROMAN.indexOf(numeral.toUpperCase() as (typeof ROMAN)[number]) +
    1) as ScaleDegree;
  return { degree, alteration: prefixAlteration(m[1]), quality };
}

/** `6m`, `b7`, `7°`, `57`, `2m7`, `1maj7` → numeral; `null` on anything else. */
export function parseNashville(text: string): Numeral | null {
  const m = /^(b{1,2}|#{1,2})?([1-7])(.*)$/.exec(text.trim());
  if (!m) return null;
  const suffix = (m[3] as string).replace(/^o/, '°').replace(/^ø$/, 'ø7');
  const quality = CHORD_QUALITIES.find((q) => NASHVILLE_SUFFIX[q] === suffix);
  if (quality === undefined) return null;
  return {
    degree: Number(m[2]) as ScaleDegree,
    alteration: prefixAlteration(m[1]),
    quality,
  };
}

function parseNumeralOrThrow(text: string): Numeral {
  const n = parseRoman(text) ?? parseNashville(text);
  if (n === null) throw new Error(`Invalid numeral: ${text}`);
  return n;
}

/** Interval from the tonic to an altered major-scale degree: (7, -1) → 7m, (4, +1) → 4A. */
function degreeInterval(degree: ScaleDegree, alteration: number): string {
  const perfect = degree === 1 || degree === 4 || degree === 5;
  // Imperfect intervals have two "zero" qualities (M and m), so flats start one step later.
  const a = perfect || alteration >= 0 ? alteration : alteration + 1;
  const quality =
    a > 0 ? 'A'.repeat(a) : a < 0 ? 'd'.repeat(-a) : perfect ? 'P' : alteration < 0 ? 'm' : 'M';
  return `${degree}${quality}`;
}

/** The chord a numeral names in a key, e.g. (`bVII`, C major) → Bb. */
export function chordFromNumeral(key: MusicalKey, numeral: Numeral | string): DiatonicChord {
  const n = typeof numeral === 'string' ? parseNumeralOrThrow(numeral) : numeral;
  const root = spellAbove(key, degreeInterval(n.degree, n.alteration));
  return describe(root, n);
}

function describe(root: string, n: Numeral): DiatonicChord {
  return {
    root,
    quality: n.quality,
    degree: n.degree,
    symbol: chordSymbol({ root, quality: n.quality }),
    roman: romanNumeral(n),
    nashville: nashvilleNumber(n),
  };
}

/**
 * The numeral of a chord in a key, by spelling: Bb in C is bVII, A# in C is
 * #VI. Accepts any root, diatonic or not.
 */
export function numeralOf(key: MusicalKey, chord: ChordSpec | string): Numeral {
  const c = toSpec(chord);
  const interval = Interval.get(Interval.distance(key.tonic, pc(c.root)));
  const degree = ((interval.step % 7) + 1) as ScaleDegree;
  const semis = mod12(interval.semitones);
  let alteration = semis - (MAJOR_SCALE_SEMITONES[degree - 1] as number);
  if (alteration > 6) alteration -= 12;
  if (alteration < -6) alteration += 12;
  return { degree, alteration, quality: c.quality };
}

export function romanOf(key: MusicalKey, chord: ChordSpec | string): string {
  return romanNumeral(numeralOf(key, chord));
}

export function nashvilleOf(key: MusicalKey, chord: ChordSpec | string): string {
  return nashvilleNumber(numeralOf(key, chord));
}

/** Convert between numeral systems: `vi` ↔ `6m`, `bVII` ↔ `b7`, `vii°` ↔ `7°`. */
export function romanToNashville(roman: string): string {
  const n = parseRoman(roman);
  if (n === null) throw new Error(`Invalid Roman numeral: ${roman}`);
  return nashvilleNumber(n);
}

export function nashvilleToRoman(nashville: string): string {
  const n = parseNashville(nashville);
  if (n === null) throw new Error(`Invalid Nashville number: ${nashville}`);
  return romanNumeral(n);
}

// ---------------------------------------------------------------------------
// Diatonic harmony

const DIATONIC_QUALITIES: Record<KeyMode, Record<'triads' | 'sevenths', ChordQuality[]>> = {
  major: {
    triads: ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'],
    sevenths: ['major7', 'minor7', 'minor7', 'major7', 'dominant7', 'minor7', 'half-diminished7'],
  },
  minor: {
    triads: ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'],
    sevenths: ['minor7', 'half-diminished7', 'major7', 'minor7', 'minor7', 'major7', 'dominant7'],
  },
};

/**
 * The harmonised scale: I ii iii IV V vi vii° in major, i ii° bIII iv v bVI
 * bVII in (natural) minor; or the seventh chords with `sevenths`.
 */
export function diatonicChords(key: MusicalKey, opts: DiatonicOptions = {}): DiatonicChord[] {
  const qualities = DIATONIC_QUALITIES[key.mode][opts.sevenths ? 'sevenths' : 'triads'];
  return scaleOf(key).map((root, i) => {
    const degree = (i + 1) as ScaleDegree;
    const quality = qualities[i] as ChordQuality;
    const n = numeralOf(key, { root, quality });
    return describe(root, { ...n, degree });
  });
}

export function diatonicChord(
  key: MusicalKey,
  degree: ScaleDegree,
  opts: DiatonicOptions = {},
): DiatonicChord {
  return diatonicChords(key, opts)[degree - 1] as DiatonicChord;
}

/** True if the chord (root and quality) is one of the key's triads or sevenths. */
export function isDiatonic(key: MusicalKey, chord: ChordSpec | string): boolean {
  const c = toSpec(chord);
  const pool = diatonicChords(key, { sevenths: isSeventh(c.quality) });
  return pool.some((d) => sameChord(d, c));
}

// ---------------------------------------------------------------------------
// Progressions

export interface Progression {
  readonly id: string;
  readonly name: string;
  readonly mode: KeyMode;
  /** Roman numerals, one per slot (one per bar for the blues). */
  readonly numerals: readonly string[];
  /** A short, learner-facing note on where it is heard. */
  readonly description: string;
}

/** The C9 catalogue (research/03). */
export const PROGRESSIONS: readonly Progression[] = [
  {
    id: 'I-IV-V',
    name: 'I–IV–V',
    mode: 'major',
    numerals: ['I', 'IV', 'V'],
    description: 'The three-chord backbone of folk, country and rock ’n’ roll.',
  },
  {
    id: 'I-V-vi-IV',
    name: 'I–V–vi–IV',
    mode: 'major',
    numerals: ['I', 'V', 'vi', 'IV'],
    description: 'The pop progression behind countless chart songs.',
  },
  {
    id: 'vi-IV-I-V',
    name: 'vi–IV–I–V',
    mode: 'major',
    numerals: ['vi', 'IV', 'I', 'V'],
    description: 'I–V–vi–IV started from the vi: same chords, darker feel.',
  },
  {
    id: 'I-vi-IV-V',
    name: 'I–vi–IV–V',
    mode: 'major',
    numerals: ['I', 'vi', 'IV', 'V'],
    description: 'The 1950s doo-wop progression.',
  },
  {
    id: 'ii-V-I',
    name: 'ii–V–I',
    mode: 'major',
    numerals: ['ii', 'V', 'I'],
    description: 'The cadence at the heart of jazz harmony.',
  },
  {
    id: '12-bar-blues',
    name: '12-bar blues',
    mode: 'major',
    numerals: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'],
    description: 'Twelve bars of dominant chords, ending on a V turnaround.',
  },
  {
    id: '12-bar-blues-quick-change',
    name: '12-bar blues (quick change)',
    mode: 'major',
    numerals: ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'],
    description: 'The 12-bar blues with a jump to the IV in bar 2.',
  },
  {
    id: 'i-bVII-bVI-bVII',
    name: 'i–bVII–bVI–bVII',
    mode: 'minor',
    numerals: ['i', 'bVII', 'bVI', 'bVII'],
    description: 'A rocking minor vamp built from borrowed flat chords.',
  },
];

export function getProgression(id: string): Progression {
  const p = PROGRESSIONS.find((x) => x.id === id);
  if (p === undefined) throw new Error(`Unknown progression: ${id}`);
  return p;
}

/** Rotate left by `n`: rotate([I, V, vi, IV], 2) → [vi, IV, I, V]. */
export function rotate<T>(items: readonly T[], n: number): T[] {
  if (items.length === 0) return [];
  const k = mod(n, items.length);
  return [...items.slice(k), ...items.slice(0, k)];
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Every distinct rotation, starting with the sequence itself. */
export function rotationsOf(numerals: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < numerals.length; i++) {
    const r = rotate(numerals, i);
    if (!out.some((o) => sameSequence(o, r))) out.push(r);
  }
  return out;
}

/**
 * The smallest left rotation turning `a` into `b`, or `null`. 0 means the same
 * sequence. (I–V–vi–IV → vi–IV–I–V is 2.)
 */
export function rotationOffset(a: readonly string[], b: readonly string[]): number | null {
  if (a.length !== b.length) return null;
  if (a.length === 0) return 0;
  for (let i = 0; i < a.length; i++) if (sameSequence(rotate(a, i), b)) return i;
  return null;
}

export function isRotationOf(a: readonly string[], b: readonly string[]): boolean {
  return rotationOffset(a, b) !== null;
}

/** Other catalogue progressions that are rotations of this one (the C9 misconception). */
export function relatedRotations(progression: Progression | string): Progression[] {
  const p = typeof progression === 'string' ? getProgression(progression) : progression;
  return PROGRESSIONS.filter(
    (q) => q.id !== p.id && q.mode === p.mode && isRotationOf(p.numerals, q.numerals),
  );
}

export interface ProgressionMatch {
  readonly progression: Progression;
  /** 0 for an exact match; otherwise the left rotation of the catalogue entry. */
  readonly rotation: number;
}

/**
 * Catalogue entries matching a numeral sequence, exact matches first, then
 * rotations. Numerals are compared after normalising (`6m` → `vi`).
 */
export function matchProgression(numerals: readonly string[]): ProgressionMatch[] {
  const norm = numerals.map((n) => romanNumeral(parseNumeralOrThrow(n)));
  const out: ProgressionMatch[] = [];
  for (const p of PROGRESSIONS) {
    const rotation = rotationOffset(p.numerals, norm);
    if (rotation !== null) out.push({ progression: p, rotation });
  }
  return out.sort((a, b) => Number(a.rotation !== 0) - Number(b.rotation !== 0));
}

/** Identify a chord chart in a key: [C, G, Am, F] in C → I–V–vi–IV. */
export function identifyProgression(
  key: MusicalKey,
  chords: readonly (ChordSpec | string)[],
): ProgressionMatch[] {
  return matchProgression(chords.map((c) => romanOf(key, c)));
}

/** Realise numerals (or a catalogue progression) as chords in a key. */
export function progressionChords(
  key: MusicalKey,
  progression: Progression | readonly string[],
): DiatonicChord[] {
  const numerals = 'numerals' in progression ? progression.numerals : progression;
  return numerals.map((n) => chordFromNumeral(key, n));
}

// ---------------------------------------------------------------------------
// Transposition

/** Semitones up (0–11) from one pitch class or key to another. */
export function semitonesUp(from: MusicalKey | string, to: MusicalKey | string): number {
  const a = typeof from === 'string' ? from : from.tonic;
  const b = typeof to === 'string' ? to : to.tonic;
  return mod12(chromaOf(b) - chromaOf(a));
}

/** Transpose a key, spelled the way the circle of fifths names it (A# → Bb). */
export function transposeKey(key: MusicalKey, semitones: number): MusicalKey {
  return {
    tonic: standardKeyTonic(chromaOf(key.tonic) + semitones, key.mode),
    mode: key.mode,
  };
}

/**
 * Transpose a chord by semitones. The new root is spelled in `spelling` when it
 * is a key, with that accidental preference when it is one, and otherwise the
 * usual chart spelling (`standardChordRoot`).
 */
export function transposeChord(
  chord: ChordSpec | string,
  semitones: number,
  spelling?: MusicalKey | AccidentalPref,
): ChordSpec {
  const c = toSpec(chord);
  const chroma = chromaOf(c.root) + semitones;
  const root =
    spelling === undefined
      ? standardChordRoot(chroma, c.quality)
      : typeof spelling === 'string'
        ? chromaToPc(chroma, spelling)
        : spellInKey(chroma, spelling);
  return { root, quality: c.quality };
}

/**
 * Transpose a chord chart between keys by function, so each chord keeps its
 * numeral and is spelled in the new key: [C, G, Am, F] from C to D → [D, A, Bm, G].
 */
export function transposeChords(
  chords: readonly (ChordSpec | string)[],
  from: MusicalKey,
  to: MusicalKey,
): DiatonicChord[] {
  return chords.map((c) => chordFromNumeral(to, numeralOf(from, c)));
}

// ---------------------------------------------------------------------------
// Capo

/** Keys whose open-position shapes beginners use under a capo. */
export const OPEN_SHAPE_KEYS: readonly MusicalKey[] = [
  ...['C', 'A', 'G', 'E', 'D'].map(majorKey),
  ...['A', 'E', 'D'].map(minorKey),
];

function assertCapo(capo: number): void {
  if (!Number.isInteger(capo) || capo < 0 || capo > MAX_FRET) {
    throw new RangeError(`Capo fret ${capo} is outside 0–${MAX_FRET}`);
  }
}

/**
 * The capo fret that makes `shape` sound as `sounding` (0–11): a song in Bb
 * with G shapes needs capo 3. The capo always transposes up.
 */
export function capoFret(sounding: MusicalKey | string, shape: MusicalKey | string): number {
  return semitonesUp(shape, sounding);
}

/** The key that sounds when playing in `shape` with a capo: G shapes, capo 3 → Bb. */
export function soundingKey(shape: MusicalKey, capo: number): MusicalKey {
  assertCapo(capo);
  return transposeKey(shape, capo);
}

/** The shapes to play for a sounding key with a capo: Bb, capo 3 → G shapes. */
export function shapeKey(sounding: MusicalKey, capo: number): MusicalKey {
  assertCapo(capo);
  return transposeKey(sounding, -capo);
}

/** The chord that sounds from a shape under a capo: G shape, capo 3 → Bb. */
export function soundingChord(
  shape: ChordSpec | string,
  capo: number,
  key?: MusicalKey,
): ChordSpec {
  assertCapo(capo);
  return transposeChord(shape, capo, key);
}

/** The shape to finger for a sounding chord under a capo: Bb, capo 3 → G shape. */
export function shapeChord(
  sounding: ChordSpec | string,
  capo: number,
  key?: MusicalKey,
): ChordSpec {
  assertCapo(capo);
  return transposeChord(sounding, -capo, key);
}

export interface CapoOption {
  readonly shape: MusicalKey;
  readonly capo: number;
}

/**
 * Open-shape keys (same mode) that reach `sounding` with a capo at or below
 * `maxCapo` (default 7), lowest capo first.
 */
export function capoOptions(
  sounding: MusicalKey,
  opts: { maxCapo?: number; shapes?: readonly MusicalKey[] } = {},
): CapoOption[] {
  const maxCapo = opts.maxCapo ?? 7;
  const shapes = opts.shapes ?? OPEN_SHAPE_KEYS;
  return shapes
    .filter((s) => s.mode === sounding.mode)
    .map((shape) => ({ shape, capo: capoFret(sounding, shape) }))
    .filter((o) => o.capo <= maxCapo)
    .sort((a, b) => a.capo - b.capo);
}

// ---------------------------------------------------------------------------
// Circle of fifths and key signatures

export interface CircleEntry {
  /** 0 = C at the top, increasing clockwise (towards the sharps). */
  readonly position: number;
  readonly major: string;
  readonly minor: string;
  /** Sharps (+) or flats (−) in the signature of the primary spelling. */
  readonly alteration: number;
  /** The enharmonic spelling at the bottom of the circle (B/Cb, F#/Gb, Db/C#). */
  readonly enharmonic?: {
    readonly major: string;
    readonly minor: string;
    readonly alteration: number;
  };
}

export const CIRCLE_OF_FIFTHS: readonly CircleEntry[] = [
  { position: 0, major: 'C', minor: 'A', alteration: 0 },
  { position: 1, major: 'G', minor: 'E', alteration: 1 },
  { position: 2, major: 'D', minor: 'B', alteration: 2 },
  { position: 3, major: 'A', minor: 'F#', alteration: 3 },
  { position: 4, major: 'E', minor: 'C#', alteration: 4 },
  {
    position: 5,
    major: 'B',
    minor: 'G#',
    alteration: 5,
    enharmonic: { major: 'Cb', minor: 'Ab', alteration: -7 },
  },
  {
    position: 6,
    major: 'F#',
    minor: 'D#',
    alteration: 6,
    enharmonic: { major: 'Gb', minor: 'Eb', alteration: -6 },
  },
  {
    position: 7,
    major: 'Db',
    minor: 'Bb',
    alteration: -5,
    enharmonic: { major: 'C#', minor: 'A#', alteration: 7 },
  },
  { position: 8, major: 'Ab', minor: 'F', alteration: -4 },
  { position: 9, major: 'Eb', minor: 'C', alteration: -3 },
  { position: 10, major: 'Bb', minor: 'G', alteration: -2 },
  { position: 11, major: 'F', minor: 'D', alteration: -1 },
];

function relativeMajorChroma(key: MusicalKey): number {
  return mod12(chromaOf(key.tonic) + (key.mode === 'minor' ? 3 : 0));
}

/** Position on the circle (0 = C/Am, clockwise). Enharmonic keys share a position. */
export function circlePosition(key: MusicalKey): number {
  return mod12(relativeMajorChroma(key) * 7);
}

export function circleEntry(key: MusicalKey): CircleEntry {
  return CIRCLE_OF_FIFTHS[circlePosition(key)] as CircleEntry;
}

/** The circle's primary tonic for a chroma (C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B; minors alike). */
export function standardKeyTonic(chroma: number, mode: KeyMode): string {
  const c = mod12(chroma);
  const majorChroma = mode === 'minor' ? mod12(c + 3) : c;
  const entry = CIRCLE_OF_FIFTHS[mod12(majorChroma * 7)] as CircleEntry;
  return mode === 'major' ? entry.major : entry.minor;
}

/** Move `steps` around the circle: + clockwise (sharpwards), − anticlockwise. */
export function circleStep(key: MusicalKey, steps: number): MusicalKey {
  const entry = CIRCLE_OF_FIFTHS[mod12(circlePosition(key) + steps)] as CircleEntry;
  return { tonic: key.mode === 'major' ? entry.major : entry.minor, mode: key.mode };
}

/** The dominant (V) key, one step clockwise: C → G, Am → Em. */
export function dominantKey(key: MusicalKey): MusicalKey {
  return { tonic: transposePc(key.tonic, '5P'), mode: key.mode };
}

/** The subdominant (IV) key, one step anticlockwise: C → F, Am → Dm. */
export function subdominantKey(key: MusicalKey): MusicalKey {
  return { tonic: transposePc(key.tonic, '4P'), mode: key.mode };
}

/** Relative minor of a major key (and vice versa), spelled by letter: F# → D#m. */
export function relativeKey(key: MusicalKey): MusicalKey {
  return key.mode === 'major'
    ? { tonic: Note.transpose(key.tonic, '6M'), mode: 'minor' }
    : { tonic: Note.transpose(key.tonic, '3m'), mode: 'major' };
}

export function relativeMinor(majorTonic: string): string {
  return relativeKey(majorKey(majorTonic)).tonic;
}

export function relativeMajor(minorTonic: string): string {
  return relativeKey(minorKey(minorTonic)).tonic;
}

export function parallelKey(key: MusicalKey): MusicalKey {
  return { tonic: key.tonic, mode: key.mode === 'major' ? 'minor' : 'major' };
}

export interface KeySignature {
  /** Sharps (+) or flats (−). Beyond ±7 the key is theoretical (double accidentals). */
  readonly alteration: number;
  readonly sharps: number;
  readonly flats: number;
  /** The altered notes in signature order, e.g. F# C# G#, or Bb Eb. */
  readonly accidentals: readonly string[];
}

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const;

/** Key signature from the tonic's spelling: Gb major has 6 flats, F# major 6 sharps. */
export function keySignature(key: MusicalKey): KeySignature {
  const n = Note.get(key.tonic);
  // Fifths from C of the relative major: each letter is a fixed number of fifths, each sharp 7 more.
  const alteration =
    (LETTER_FIFTHS[n.letter] as number) + 7 * n.alt + (key.mode === 'minor' ? -3 : 0);
  const order = alteration >= 0 ? SHARP_ORDER : [...SHARP_ORDER].reverse();
  const sign = alteration >= 0 ? '#' : 'b';
  const count = Math.abs(alteration);
  const accidentals: string[] = [];
  for (let i = 0; i < Math.min(count, 7); i++) {
    const extra = Math.floor((count - i - 1) / 7);
    accidentals.push(`${order[i] as string}${sign.repeat(1 + extra)}`);
  }
  return {
    alteration,
    sharps: Math.max(alteration, 0),
    flats: Math.max(-alteration, 0),
    accidentals,
  };
}
