import { Note, Scale } from 'tonal';
import { chromaOf } from './fretboard';
import {
  chordFromNumeral,
  chordSymbol,
  diatonicChords,
  hasMinorThird,
  isSeventh,
  keyName,
  minorKey,
  parallelKey,
  parseChordSymbol,
  romanOf,
  sameChord,
  type ChordQuality,
  type ChordSpec,
  type DiatonicChord,
  type KeyMode,
  type MusicalKey,
  type ScaleDegree,
} from './harmony';

/**
 * Minor-key harmony and chord function (topics I4, I5).
 *
 * - Minor keys are natural minor (as in `harmony.ts`) plus the harmonic-minor
 *   V, V7, vii° and vii°7. The raised 7th is the leading tone, so E7 *is* in
 *   A minor (research/03 I4 misconception).
 * - Functions are the three classes tonic, subdominant (predominant) and
 *   dominant. Major: I iii vi tonic, ii IV subdominant, V vii° dominant.
 *   Minor: i bIII tonic, ii° iv bVI subdominant, v V bVII vii° dominant.
 * - A chromatic chord can have several readings (D in A minor is the borrowed
 *   IV and V/bVII). `chordReadings` returns them all, preferred first: a
 *   dominant 7th reads as a secondary dominant before a borrowed chord (the
 *   7th makes the pull explicit); a plain triad reads as borrowed first.
 *   Drills can accept any reading, or skip chords with more than one.
 * - Numerals follow `harmony.ts`: measured against the major scale on the
 *   tonic, so borrowed chords in C read bIII, iv, bVI, bVII.
 */

export type HarmonicFunction = 'tonic' | 'subdominant' | 'dominant';

export type ChordRole =
  'diatonic' | 'harmonic-minor' | 'secondary-dominant' | 'borrowed' | 'tritone-substitute';

export const HARMONIC_FUNCTIONS: readonly HarmonicFunction[] = ['tonic', 'subdominant', 'dominant'];

const FUNCTIONS: Record<KeyMode, readonly HarmonicFunction[]> = {
  major: ['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant'],
  minor: ['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'subdominant', 'dominant'],
};

/** Collapse double accidentals (Ebb → D) and leave everything else alone. */
function tidy(note: string): string {
  return /##|bb/.test(note) ? Note.simplify(note) : note;
}

function toSpec(chord: ChordSpec | string): ChordSpec {
  return typeof chord === 'string' ? parseChordSymbol(chord) : chord;
}

/** The function of a diatonic degree: `diatonicFunction('minor', 6)` → subdominant. */
export function diatonicFunction(mode: KeyMode, degree: ScaleDegree): HarmonicFunction {
  return FUNCTIONS[mode][degree - 1] as HarmonicFunction;
}

// ---------------------------------------------------------------------------
// Minor-key harmony (I4)

/** A harmonic minor: A B C D E F G#. */
export function harmonicMinorScale(tonic: string): string[] {
  const notes = Scale.get(`${tonic} harmonic minor`).notes;
  if (notes.length !== 7) throw new Error(`Invalid tonic: ${tonic}`);
  return notes;
}

/** The natural and raised 7th of a minor key: A minor → G and G#. */
export function raisedSeventh(tonic: string): { natural: string; raised: string } {
  const key = minorKey(tonic);
  return {
    natural: Note.transpose(key.tonic, '7m'),
    raised: Note.transpose(key.tonic, '7M'),
  };
}

/** The note a half step below the tonic that pulls up to it (raised 7th in minor). */
export function leadingTone(key: MusicalKey): string {
  return Note.transpose(key.tonic, '7M');
}

export interface MinorKeyChord extends DiatonicChord {
  /** `natural` for the natural-minor chords, `harmonic` for V and vii° from harmonic minor. */
  readonly source: 'natural' | 'harmonic';
}

/** The harmonic-minor chords a minor key adds: V and vii° (V7 and vii°7 with `sevenths`). */
export function harmonicMinorChords(
  tonic: string,
  opts: { sevenths?: boolean } = {},
): DiatonicChord[] {
  const key = minorKey(tonic);
  const numerals = opts.sevenths ? ['V7', 'vii°7'] : ['V', 'vii°'];
  return numerals.map((n) => chordFromNumeral(key, n));
}

/**
 * The working chords of a minor key, by degree: natural minor plus the
 * harmonic-minor V and vii° (A minor: Am B° C Dm Em E F G G#°).
 */
export function minorKeyChords(tonic: string, opts: { sevenths?: boolean } = {}): MinorKeyChord[] {
  const natural = diatonicChords(minorKey(tonic), opts).map((c) => ({
    ...c,
    source: 'natural' as const,
  }));
  const harmonic = harmonicMinorChords(tonic, opts).map((c) => ({
    ...c,
    source: 'harmonic' as const,
  }));
  return [...natural, ...harmonic].sort((a, b) => a.degree - b.degree);
}

/**
 * ii–V–I: Dm7 G7 Cmaj7 in C major; iiø7 V7 i (Bm7b5 E7 Am) in A minor. With
 * `sevenths: false`, triads (ii° V i in minor).
 */
export function twoFiveOne(key: MusicalKey, opts: { sevenths?: boolean } = {}): DiatonicChord[] {
  const sevenths = opts.sevenths ?? true;
  const numerals =
    key.mode === 'major'
      ? sevenths
        ? ['ii7', 'V7', 'Imaj7']
        : ['ii', 'V', 'I']
      : sevenths
        ? ['iiø7', 'V7', 'i']
        : ['ii°', 'V', 'i'];
  return numerals.map((n) => chordFromNumeral(key, n));
}

// ---------------------------------------------------------------------------
// Chord function and substitution (I5)

export interface ChordReading {
  readonly role: ChordRole;
  readonly function: HarmonicFunction;
  /** The chord, spelled for the key. */
  readonly chord: ChordSpec;
  readonly symbol: string;
  /** Roman numeral or functional label: `ii`, `V7`, `V7/ii`, `bVII`, `subV7/V`. */
  readonly label: string;
  /** What a secondary dominant or tritone substitute resolves to, e.g. `ii`; else null. */
  readonly target: string | null;
  /** The key a borrowed chord comes from; else null. */
  readonly source: MusicalKey | null;
  /** One sentence for feedback. */
  readonly explanation: string;
}

interface Target {
  readonly chord: DiatonicChord;
  /** The dominant that resolves to it, a 5th above. */
  readonly dominantRoot: string;
}

/**
 * Chords that can be tonicised: the major or minor diatonic triads other than
 * the tonic (minor keys use the harmonic V, so V/V is B7 in A minor).
 */
function secondaryTargets(key: MusicalKey): Target[] {
  const triads = key.mode === 'major' ? diatonicChords(key) : minorKeyChords(key.tonic);
  return triads
    .filter((c) => c.degree !== 1 && c.quality !== 'diminished')
    .filter((c) => !(key.mode === 'minor' && c.degree === 5 && c.quality === 'minor'))
    .map((chord) => ({ chord, dominantRoot: tidy(Note.transpose(chord.root, '5P')) }));
}

function tonicTriad(key: MusicalKey): DiatonicChord {
  return chordFromNumeral(key, key.mode === 'major' ? 'I' : 'i');
}

function dominantLabel(quality: ChordQuality, target: string): string {
  return `${quality === 'dominant7' ? 'V7' : 'V'}/${target}`;
}

/** The secondary dominants of a key: V/ii … V/vi in major (V7/… with `sevenths`). */
export function secondaryDominants(
  key: MusicalKey,
  opts: { sevenths?: boolean } = {},
): ChordReading[] {
  const quality: ChordQuality = opts.sevenths ? 'dominant7' : 'major';
  return secondaryTargets(key).map((t) =>
    secondaryReading(key, { root: t.dominantRoot, quality }, t.chord),
  );
}

function secondaryReading(key: MusicalKey, chord: ChordSpec, target: DiatonicChord): ChordReading {
  const label = dominantLabel(chord.quality, target.roman);
  const symbol = chordSymbol(chord);
  return {
    role: 'secondary-dominant',
    function: 'dominant',
    chord,
    symbol,
    label,
    target: target.roman,
    source: null,
    explanation: `${symbol} is ${label} in ${keyName(key)}: the dominant of ${target.symbol}.`,
  };
}

/**
 * The tritone substitute of a dominant 7th: the dominant 7th a tritone away,
 * sharing its 3rd and 7th (G7 → Db7). Spelled without Cb, Fb, E#, B# or
 * double accidentals (F7 → B7).
 */
export function tritoneSubstitute(chord: ChordSpec | string): ChordSpec {
  const c = toSpec(chord);
  if (c.quality !== 'dominant7')
    throw new RangeError('Only dominant 7ths have a tritone substitute');
  const root = Note.transpose(c.root, '5d');
  return {
    root: /##|bb|Cb|Fb|E#|B#/.test(root) ? Note.simplify(root) : root,
    quality: 'dominant7',
  };
}

/** Tritone substitutes in a key: the dominant 7th a half step above each target (and the tonic). */
function tritoneReadings(key: MusicalKey): ChordReading[] {
  const targets = [tonicTriad(key), ...secondaryTargets(key).map((t) => t.chord)];
  return targets.map((t) => {
    const chord: ChordSpec = { root: tidy(Note.transpose(t.root, '2m')), quality: 'dominant7' };
    const symbol = chordSymbol(chord);
    const label = t.degree === 1 ? 'subV7' : `subV7/${t.roman}`;
    const replaces = chordSymbol({
      root: tidy(Note.transpose(t.root, '5P')),
      quality: 'dominant7',
    });
    return {
      role: 'tritone-substitute' as const,
      function: 'dominant' as const,
      chord,
      symbol,
      label,
      target: t.roman,
      source: null,
      explanation: `${symbol} is ${label} in ${keyName(key)}: the tritone substitute for ${replaces}, a half step above ${t.symbol}.`,
    };
  });
}

function diatonicPool(key: MusicalKey, sevenths: boolean): DiatonicChord[] {
  return diatonicChords(key, { sevenths });
}

/**
 * Chords borrowed from the parallel key (modal interchange): in C major, Cm
 * D° Eb Fm Gm Ab Bb (sevenths with `sevenths`); in a minor key, the parallel
 * major's chords other than the harmonic-minor V and vii°.
 */
export function borrowedChords(key: MusicalKey, opts: { sevenths?: boolean } = {}): ChordReading[] {
  const sevenths = opts.sevenths ?? false;
  const source = parallelKey(key);
  const own = ownChords(key, sevenths);
  return diatonicPool(source, sevenths)
    .filter((c) => !own.some((o) => sameChord(o, c)))
    .map((c) => {
      const symbol = chordSymbol(c);
      const label = romanOf(key, c);
      return {
        role: 'borrowed' as const,
        function: diatonicFunction(source.mode, c.degree),
        chord: { root: c.root, quality: c.quality },
        symbol,
        label,
        target: null,
        source,
        explanation: `${symbol} is ${label} in ${keyName(key)}, borrowed from ${keyName(source)}.`,
      };
    });
}

/** The key's own chords: diatonic, plus the harmonic-minor ones in a minor key. */
function ownChords(key: MusicalKey, sevenths: boolean): DiatonicChord[] {
  const pool = diatonicPool(key, sevenths);
  return key.mode === 'minor' ? [...pool, ...harmonicMinorChords(key.tonic, { sevenths })] : pool;
}

function ownReading(key: MusicalKey, c: ChordSpec): ChordReading | null {
  const natural = diatonicPool(key, isSeventh(c.quality)).find((d) => sameChord(d, c));
  if (natural) {
    const fn = diatonicFunction(key.mode, natural.degree);
    return {
      role: 'diatonic',
      function: fn,
      chord: { root: natural.root, quality: natural.quality },
      symbol: natural.symbol,
      label: natural.roman,
      target: null,
      source: null,
      explanation: `${natural.symbol} is ${natural.roman} in ${keyName(key)}: a diatonic chord with ${fn} function.`,
    };
  }
  if (key.mode !== 'minor') return null;
  const harmonic = harmonicMinorChords(key.tonic, { sevenths: isSeventh(c.quality) }).find((d) =>
    sameChord(d, c),
  );
  if (!harmonic) return null;
  const { natural: from, raised: to } = raisedSeventh(key.tonic);
  return {
    role: 'harmonic-minor',
    function: 'dominant',
    chord: { root: harmonic.root, quality: harmonic.quality },
    symbol: harmonic.symbol,
    label: harmonic.roman,
    target: null,
    source: null,
    explanation: `${harmonic.symbol} is ${harmonic.roman} in ${keyName(key)}. It comes from ${key.tonic} harmonic minor, which raises ${from} to ${to}, the leading tone that pulls up to ${key.tonic}.`,
  };
}

/**
 * Every reading of a chord in a key, preferred first. A diatonic or
 * harmonic-minor chord has exactly one; a chromatic chord may have several;
 * an unexplained chord (bII in a minor key, say) has none.
 */
export function chordReadings(key: MusicalKey, chord: ChordSpec | string): ChordReading[] {
  const c = toSpec(chord);
  const own = ownReading(key, c);
  if (own) return [own];
  const secondary = secondaryTargets(key)
    .filter(
      (t) =>
        (c.quality === 'major' || c.quality === 'dominant7') &&
        chromaOf(t.dominantRoot) === chromaOf(c.root),
    )
    .map((t) => secondaryReading(key, { root: t.dominantRoot, quality: c.quality }, t.chord));
  const borrowed = borrowedChords(key, { sevenths: isSeventh(c.quality) }).filter((b) =>
    sameChord(b.chord, c),
  );
  const tritone =
    c.quality === 'dominant7' ? tritoneReadings(key).filter((t) => sameChord(t.chord, c)) : [];
  const ordered =
    c.quality === 'dominant7'
      ? [...secondary, ...borrowed, ...tritone]
      : [...borrowed, ...secondary];
  return ordered;
}

/** The preferred reading, or `null` for a chord this module can't explain. */
export function analyseChord(key: MusicalKey, chord: ChordSpec | string): ChordReading | null {
  return chordReadings(key, chord)[0] ?? null;
}

/** The chord's function in the key (preferred reading), or `null`. */
export function functionOf(key: MusicalKey, chord: ChordSpec | string): HarmonicFunction | null {
  return analyseChord(key, chord)?.function ?? null;
}

/** True when some reading of the chord is a borrowed chord. */
export function isBorrowed(key: MusicalKey, chord: ChordSpec | string): boolean {
  return chordReadings(key, chord).some((r) => r.role === 'borrowed');
}

/** "Spot the borrowed chord": indexes of the borrowed chords in a progression. */
export function findBorrowed(key: MusicalKey, chords: readonly (ChordSpec | string)[]): number[] {
  return chords.flatMap((c, i) => (isBorrowed(key, c) ? [i] : []));
}

// ---------------------------------------------------------------------------
// Substitutes

export type SubstituteKind = 'relative' | 'same-function' | 'borrowed' | 'tritone';

export interface Substitute {
  readonly kind: SubstituteKind;
  readonly chord: ChordSpec;
  readonly symbol: string;
  /** Numeral in the key. */
  readonly label: string;
}

const RELATIVE_QUALITY: Partial<Record<ChordQuality, ChordQuality>> = {
  major: 'minor',
  minor: 'major',
  major7: 'minor7',
  dominant7: 'minor7',
  minor7: 'major7',
};

/**
 * The relative chord, which shares two notes: C ↔ Am, F ↔ Dm, G7 → Em7,
 * Am7 → Cmaj7. `null` for diminished and augmented chords.
 */
export function relativeSubstitute(chord: ChordSpec | string): ChordSpec | null {
  const c = toSpec(chord);
  const quality = RELATIVE_QUALITY[c.quality];
  if (quality === undefined) return null;
  const root = tidy(Note.transpose(c.root, hasMinorThird(c.quality) ? '3m' : '-3m'));
  return { root, quality };
}

/**
 * Substitutes for a chord in a key ("pick a substitute"): its relative, the
 * diatonic chords with the same function, the parallel key's chord on the
 * same degree (diatonic chords only), and the tritone substitute (dominant
 * 7ths). Each keeps its own spelling: the parallel key's (Eb in C), the
 * relative's (Am for C), the tritone substitute's (Db7 for G7).
 */
export function substitutes(key: MusicalKey, chord: ChordSpec | string): Substitute[] {
  const c = toSpec(chord);
  const reading = analyseChord(key, c);
  const out: Substitute[] = [];
  const add = (kind: SubstituteKind, s: ChordSpec) => {
    if (sameChord(s, c) || out.some((o) => sameChord(o.chord, s))) return;
    const spec = { root: s.root, quality: s.quality };
    out.push({ kind, chord: spec, symbol: chordSymbol(spec), label: romanOf(key, spec) });
  };
  const relative = relativeSubstitute(c);
  if (relative) add('relative', relative);
  if (reading?.role === 'diatonic') {
    const sevenths = isSeventh(c.quality);
    const degree = diatonicPool(key, sevenths).find((d) => sameChord(d, c))?.degree as ScaleDegree;
    for (const d of diatonicPool(key, sevenths)) {
      if (diatonicFunction(key.mode, d.degree) === reading.function) add('same-function', d);
    }
    const parallel = diatonicPool(parallelKey(key), sevenths)[degree - 1] as DiatonicChord;
    add('borrowed', parallel);
  }
  if (c.quality === 'dominant7') add('tritone', tritoneSubstitute(c));
  return out;
}
