import { Note } from 'tonal';
import {
  MAX_FRET,
  STANDARD_TUNING,
  allStrings,
  chromaToPc,
  midiAt,
  openStringMidi,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from './fretboard';
import { keySignature, spellInKey, type MusicalKey } from './harmony';

/**
 * Staff theory for reading (topics R1–R3, design §12).
 *
 * Conventions:
 * - Note names are **sounding** pitches, as on the fretboard: the open low E
 *   string is `E2`, so item IDs such as `staff:E4@treble8vb` and
 *   `staff→fret:G3@pos5` name the same pitch the neck plays. Guitar music is
 *   written in treble clef 8vb, an octave above how it sounds, so `E2` is
 *   written as E3.
 * - A staff position counts diatonic steps from the bottom line: 0 is the
 *   bottom line, odd numbers are spaces, 8 is the top line. Below the staff
 *   the numbers go negative (−2 is the first ledger line, middle C as written).
 *   The accidental does not move a note: B#, B and Bb share a position.
 * - A reading position is the hand position the index finger names (5th
 *   position = index at fret 5), covering four frets with one-fret stretches
 *   for the notes the four frets miss, so every pitch in it has one fret.
 */

// ---------------------------------------------------------------------------
// Clefs and staff positions

export type Clef = 'treble8vb' | 'treble';

/** Octaves the written note sits above the sounding one. */
const CLEF_OCTAVE_SHIFT: Record<Clef, number> = { treble8vb: 1, treble: 0 };

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
/** Diatonic index (octave × 7 + letter) of the written bottom line, E4. */
const BOTTOM_LINE_INDEX = 4 * 7 + 2;

/** The five staff lines, bottom first. */
export const STAFF_LINES: readonly number[] = [0, 2, 4, 6, 8];
export const TOP_LINE = 8;

/** A note placed on a staff. */
export interface StaffNote {
  /** Sounding pitch, scientific name: `E2`, `F#3`. */
  readonly name: string;
  /** Written pitch (an octave up in treble 8vb): `E3`, `F#4`. */
  readonly written: string;
  /** Sounding MIDI number. */
  readonly midi: number;
  readonly letter: string;
  /** Accidental as a number: 1 = sharp, −1 = flat, 2 = double sharp. */
  readonly alt: number;
  readonly position: number;
  readonly ledgerLines: number;
}

function parseNote(note: string): { letter: string; alt: number; oct: number; midi: number } {
  const n = Note.get(note);
  if (n.empty || n.oct === undefined || n.midi === null) {
    throw new Error(`Invalid note (needs an octave): ${note}`);
  }
  return { letter: n.letter, alt: n.alt, oct: n.oct, midi: n.midi };
}

function accidentalText(alt: number): string {
  return alt >= 0 ? '#'.repeat(alt) : 'b'.repeat(-alt);
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Staff position of a sounding note: `E2` → −7 in treble 8vb (below three ledger lines). */
export function staffPosition(note: string, clef: Clef = 'treble8vb'): number {
  const { letter, oct } = parseNote(note);
  const index =
    (oct + CLEF_OCTAVE_SHIFT[clef]) * 7 + (LETTERS as readonly string[]).indexOf(letter);
  return index - BOTTOM_LINE_INDEX;
}

/** The sounding note at a staff position, with an accidental (0 = natural). */
export function noteAtStaffPosition(
  position: number,
  clef: Clef = 'treble8vb',
  alt: number = 0,
): string {
  if (!Number.isInteger(position)) throw new RangeError(`Staff position ${position} is not whole`);
  const index = position + BOTTOM_LINE_INDEX;
  const letter = LETTERS[mod(index, 7)] as string;
  const oct = Math.floor(index / 7) - CLEF_OCTAVE_SHIFT[clef];
  return `${letter}${accidentalText(alt)}${oct}`;
}

export function isLine(position: number): boolean {
  return mod(position, 2) === 0;
}

export function isOnStaff(position: number): boolean {
  return position >= 0 && position <= TOP_LINE;
}

/**
 * Ledger lines a note needs: the lines between the staff and the note, plus
 * its own line if it sits on one. `E2` (−7) needs 3 in treble 8vb.
 */
export function ledgerLineCount(position: number): number {
  if (position < 0) return Math.floor(-position / 2);
  if (position > TOP_LINE) return Math.floor((position - TOP_LINE) / 2);
  return 0;
}

/** Positions of the ledger lines to draw for a note, nearest the staff first. */
export function ledgerLinePositions(position: number): number[] {
  const count = ledgerLineCount(position);
  const sign = position < 0 ? -1 : 1;
  const from = position < 0 ? 0 : TOP_LINE;
  return Array.from({ length: count }, (_, i) => from + sign * 2 * (i + 1));
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th';
  return `${n}${suffix}`;
}

/**
 * Spoken name of a staff position, lines and spaces counted from the bottom:
 * "2nd line", "3rd space", "space below the staff", "2nd ledger line below",
 * "space above the 1st ledger line".
 */
export function describeStaffPosition(position: number): string {
  if (isOnStaff(position)) {
    return isLine(position)
      ? `${ordinal(position / 2 + 1)} line`
      : `${ordinal((position + 1) / 2)} space`;
  }
  const side = position < 0 ? 'below' : 'above';
  const count = ledgerLineCount(position);
  if (isLine(position)) return `${ordinal(count)} ledger line ${side}`;
  return count === 0
    ? `space ${side} the staff`
    : `space ${side} the ${ordinal(count)} ledger line`;
}

/**
 * Every position from the space beyond `maxLedgers` ledger lines below the
 * staff to the space beyond them above, lowest first. R1 reads ±3 ledger
 * lines: −7 (low E in treble 8vb) to 15.
 */
export function staffPositions(maxLedgers: number = 3): number[] {
  if (!Number.isInteger(maxLedgers) || maxLedgers < 0) {
    throw new RangeError(`Ledger line count ${maxLedgers} is not a whole number ≥ 0`);
  }
  const lowest = -(2 * maxLedgers + 1);
  const highest = TOP_LINE + 2 * maxLedgers + 1;
  return Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i);
}

/** A sounding note with everything a staff needs to draw it. */
export function staffNote(note: string, clef: Clef = 'treble8vb'): StaffNote {
  const { letter, alt, oct, midi } = parseNote(note);
  const position = staffPosition(note, clef);
  const acc = accidentalText(alt);
  return {
    name: `${letter}${acc}${oct}`,
    written: `${letter}${acc}${oct + CLEF_OCTAVE_SHIFT[clef]}`,
    midi,
    letter,
    alt,
    position,
    ledgerLines: ledgerLineCount(position),
  };
}

// ---------------------------------------------------------------------------
// Key signatures and accidentals

/** The accidental a key signature gives a letter: F in G major → 1 (sharp). */
export function keyAlterationOf(letter: string, key: MusicalKey): number {
  const l = letter.toUpperCase();
  if (!(LETTERS as readonly string[]).includes(l)) throw new Error(`Invalid letter: ${letter}`);
  const altered = keySignature(key).accidentals.find((a) => a.charAt(0) === l);
  if (altered === undefined) return 0;
  const sign = altered.includes('#') ? 1 : -1;
  return sign * (altered.length - 1);
}

/**
 * The note a key signature makes of an unaltered note: `F3` in G major →
 * `F#3`, `B` in F major → `Bb`. Takes a pitch class or a note with an octave.
 */
export function applyKeySignature(note: string, key: MusicalKey): string {
  const n = Note.get(note);
  if (n.empty) throw new Error(`Invalid note: ${note}`);
  if (n.alt !== 0) throw new Error(`Not an unaltered note: ${note}`);
  return `${n.letter}${accidentalText(keyAlterationOf(n.letter, key))}${n.oct ?? ''}`;
}

/**
 * Spell a sounding MIDI pitch for a key: diatonic notes take the key's
 * spelling, chromatic ones its flattened degrees (or #4), as `spellInKey`.
 * The octave follows the letter, so 60 in C# major is `B#3`.
 */
export function spellMidiInKey(midi: number, key: MusicalKey): string {
  const pc = spellInKey(mod(midi, 12), key);
  const guess = Math.floor(midi / 12) - 1;
  for (const oct of [guess, guess - 1, guess + 1]) {
    if (Note.midi(`${pc}${oct}`) === midi) return `${pc}${oct}`;
  }
  throw new Error(`Cannot spell MIDI ${midi} as ${pc}`);
}

/** Spell a sounding MIDI pitch with no key: sharps or flats by preference. */
export function spellMidi(midi: number, pref: AccidentalPref = 'sharp'): string {
  return `${chromaToPc(mod(midi, 12), pref)}${Math.floor(midi / 12) - 1}`;
}

export type AccidentalMark = 'double-flat' | 'flat' | 'natural' | 'sharp' | 'double-sharp';

const MARKS: Record<number, AccidentalMark> = {
  [-2]: 'double-flat',
  [-1]: 'flat',
  0: 'natural',
  1: 'sharp',
  2: 'double-sharp',
};

/** The sign an accidental is written with: 0 → natural, −1 → flat. */
export function accidentalMark(alt: number): AccidentalMark {
  const mark = MARKS[alt];
  if (mark === undefined) throw new RangeError(`No accidental sign for ${alt}`);
  return mark;
}

/**
 * The accidentals to write for one bar of notes in a key, one per note, null
 * where none is needed. A note needs a sign when its accidental differs from
 * what the key signature, or an earlier accidental on the same staff position
 * in this bar, already gives it. An accidental lasts to the barline and holds
 * only for its own position, not other octaves.
 */
export function barAccidentals(
  notes: readonly string[],
  key: MusicalKey,
  clef: Clef = 'treble8vb',
): (AccidentalMark | null)[] {
  const inForce = new Map<number, number>();
  return notes.map((note) => {
    const { letter, alt } = parseNote(note);
    const position = staffPosition(note, clef);
    const expected = inForce.get(position) ?? keyAlterationOf(letter, key);
    if (alt === expected) return null;
    inForce.set(position, alt);
    return accidentalMark(alt);
  });
}

/** The accidental a single note needs in a key, at the start of a bar. */
export function accidentalInKey(note: string, key: MusicalKey): AccidentalMark | null {
  return barAccidentals([note], key)[0] as AccidentalMark | null;
}

/**
 * Where the signs of a key signature sit, in drawing order, as written
 * treble-clef positions (the same in treble 8vb): sharps F C G D A E B from
 * the top line, flats B E A D G C F from the middle line.
 */
export function keySignaturePositions(key: MusicalKey): number[] {
  const { accidentals, alteration } = keySignature(key);
  const octaveOf: Record<string, number> =
    alteration >= 0
      ? { F: 5, C: 5, G: 5, D: 5, A: 4, E: 5, B: 4 }
      : { B: 4, E: 5, A: 4, D: 5, G: 4, C: 5, F: 4 };
  return accidentals.map((a) => {
    const letter = a.charAt(0);
    return staffPosition(`${letter}${octaveOf[letter] as number}`, 'treble');
  });
}

// ---------------------------------------------------------------------------
// Reading positions (R2)

export type ReadingPositionId = 'open' | `pos${number}`;

export interface ReadingPosition {
  readonly id: ReadingPositionId;
  /** The fret the index finger covers; 0 for open position. */
  readonly fret: number;
  readonly label: string;
  /** The four frets the hand covers without stretching: 0–3 in open position. */
  readonly frets: FretRange;
}

/** Which finger stretches out of the position for a note the four frets miss. */
export type Stretch = 'index' | 'pinky' | 'none';

export interface ReadingOptions {
  readonly tuning?: Tuning;
  /**
   * Preferred stretch: `index` reaches back a fret (C# on string 5, fret 4 in
   * 5th position), `pinky` forward a fret. The other is the fallback, as in
   * open position, where only the pinky can stretch (to fret 4).
   * `none` keeps to the four frets. Default `index`.
   */
  readonly stretch?: Stretch;
}

/** A position by its index-finger fret: 0 → open, 5 → 5th position. */
export function readingPosition(fret: number): ReadingPosition {
  if (!Number.isInteger(fret) || fret < 0 || fret + 3 > MAX_FRET) {
    throw new RangeError(`No reading position at fret ${fret}`);
  }
  return fret === 0
    ? { id: 'open', fret, label: 'Open position', frets: { from: 0, to: 3 } }
    : {
        id: `pos${fret}`,
        fret,
        label: `${ordinal(fret)} position`,
        frets: { from: fret, to: fret + 3 },
      };
}

/** `open`, `pos5` → position. Throws on anything else. */
export function parseReadingPosition(id: string): ReadingPosition {
  if (id === 'open') return readingPosition(0);
  const m = /^pos([1-9]\d*)$/.exec(id);
  if (!m) throw new Error(`Invalid reading position: ${id}`);
  return readingPosition(Number(m[1]));
}

/** The positions R2 teaches, in order (research/03 R2). */
export const READING_POSITIONS: readonly ReadingPosition[] = [0, 5, 7, 9, 12].map(readingPosition);

/** Frets the hand can reach in a position, stretches included: 4–9 in 5th position. */
export function positionReach(position: ReadingPosition, opts: ReadingOptions = {}): FretRange {
  if (opts.stretch === 'none') return position.frets;
  return {
    from: Math.max(position.frets.from - 1, 0),
    to: Math.min(position.frets.to + 1, MAX_FRET),
  };
}

function stretchFrets(position: ReadingPosition, stretch: Stretch): number[] {
  const index = position.frets.from - 1;
  const pinky = position.frets.to + 1;
  const order = stretch === 'none' ? [] : stretch === 'index' ? [index, pinky] : [pinky, index];
  return order.filter((f) => f >= 0 && f <= MAX_FRET);
}

/**
 * The one string and fret that plays a sounding pitch in a position, or null
 * when the hand can't reach it. A fret inside the four-fret span wins (open B
 * stays the open string, not string 3 fret 4); otherwise the preferred
 * stretch, then the other one. Among equals the higher-pitched string wins,
 * which only matters in tunings with strings closer than a major 3rd apart.
 */
export function fretInPosition(
  midi: number,
  position: ReadingPosition,
  opts: ReadingOptions = {},
): Position | null {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const frets: number[] = [];
  for (let f = position.frets.from; f <= position.frets.to; f++) frets.push(f);
  frets.push(...stretchFrets(position, opts.stretch ?? 'index'));
  for (const fret of frets) {
    for (const string of allStrings(tuning)) {
      if (openStringMidi(string, tuning) + fret === midi) return { string, fret };
    }
  }
  return null;
}

/** As `fretInPosition`, from a note name (`G3`). */
export function fretForNote(
  note: string,
  position: ReadingPosition,
  opts: ReadingOptions = {},
): Position | null {
  return fretInPosition(parseNote(note).midi, position, opts);
}

/**
 * Every pitch the position can play, low to high, each with its one fret.
 * The gaps a four-fret span leaves between strings a 4th apart are filled by
 * the stretch, so standard tuning gives an unbroken chromatic run.
 */
export function positionMap(
  position: ReadingPosition,
  opts: ReadingOptions = {},
): { midi: number; at: Position }[] {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const reach = positionReach(position, opts);
  const pitches = new Set<number>();
  for (const string of allStrings(tuning)) {
    for (let fret = reach.from; fret <= reach.to; fret++)
      pitches.add(midiAt({ string, fret }, tuning));
  }
  const out: { midi: number; at: Position }[] = [];
  for (const midi of [...pitches].sort((a, b) => a - b)) {
    const at = fretInPosition(midi, position, opts);
    if (at) out.push({ midi, at });
  }
  return out;
}

/** True if this cell is the one the position plays its pitch on. */
export function isPositionFret(
  pos: Position,
  position: ReadingPosition,
  opts: ReadingOptions = {},
): boolean {
  const at = fretInPosition(midiAt(pos, opts.tuning ?? STANDARD_TUNING), position, opts);
  return at !== null && at.string === pos.string && at.fret === pos.fret;
}

/**
 * The staff note for a fretted cell: spelled for the key when there is one,
 * otherwise by the sharp/flat preference.
 */
export function staffNoteAt(
  pos: Position,
  opts: { tuning?: Tuning; key?: MusicalKey; pref?: AccidentalPref; clef?: Clef } = {},
): StaffNote {
  const midi = midiAt(pos, opts.tuning ?? STANDARD_TUNING);
  const name = opts.key ? spellMidiInKey(midi, opts.key) : spellMidi(midi, opts.pref);
  return staffNote(name, opts.clef);
}
