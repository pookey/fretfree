import type { Card as FsrsCard, Rating } from 'ts-fsrs';
import type { FittedFsrsParams } from './refit';
import {
  BOX_NUMBERS,
  CAGED_ORDER,
  CAGED_QUALITIES,
  chordFormula,
  isChordKind,
  isIntervalName,
  keyLabel,
  nameChord,
  nashvilleNumber,
  parseChord,
  parseKey,
  parseNashville,
  parseRoman,
  romanNumeral,
  PROGRESSIONS,
  type CagedQuality,
  type CagedShapeName,
  type ChordDegree,
  type BoxNumber,
  type ChordKind,
  type IntervalName,
  type PentatonicQuality,
  type Position,
} from '../theory';

/** Design §3.1 / §3.6. */

export type SkillStatus = 'locked' | 'unlocked' | 'practising' | 'mastered';
export type GuideLevel = 0 | 1 | 2 | 3;

export interface Item {
  /** Stable ID, e.g. `note@s6f5`. */
  readonly id: string;
  readonly skillId: string;
}

export interface Skill {
  readonly id: string;
  readonly topic: string;
  /** Default frontier order (lower first); the goal profile reorders later. */
  readonly order: number;
  readonly title: string;
  readonly prerequisites: readonly string[];
  /** Low-risk skills unlock once prerequisites are merely practising. */
  readonly softUnlock?: boolean;
  /** Drill type IDs that can test this skill, in preference order. */
  readonly drillTypes: readonly string[];
  items(): readonly Item[];
}

export interface CardRecord {
  itemId: string;
  skillId: string;
  fsrs: FsrsCard;
  createdAt: Date;
  lastReviewedAt: Date | null;
}

export interface ReviewLogRecord {
  id?: number;
  itemId: string;
  skillId: string;
  drillType: string;
  correct: boolean;
  responseMs: number;
  rating: Rating;
  hintUsed: boolean;
  answerGiven: string;
  at: Date;
}

export interface SkillStateRecord {
  skillId: string;
  status: SkillStatus;
  guideLevel: GuideLevel;
  rollingAccuracy: number;
}

export interface ConfusionRecord {
  a: string;
  b: string;
  /** Lifetime number of times the pair was confused. */
  count: number;
  /** The decayed weight as of `lastAt` (engine/confusions.ts). Absent on older rows. */
  weight?: number;
  /** When the pair was last confused. Absent on older rows. */
  lastAt?: Date;
}

export interface SessionLogRecord {
  id?: number;
  startedAt: Date;
  endedAt: Date | null;
  itemsSeen: number;
  accuracy: number;
}

export type Handedness = 'right' | 'left';

/** The notations a learner can read or learn to read (design §4). */
export type Notation = 'tab' | 'staff';
export type NotationSet = Record<Notation, boolean>;

/**
 * What the learner already reads and what they want to learn to read
 * (design §4). The neck is taught by name, position and sound either way;
 * reading adds drills and promotes reading tracks, and never locks one away.
 */
export interface Reading {
  reads: NotationSet;
  learn: NotationSet;
}

export type Goal = 'songs' | 'improvise' | 'jazz' | 'general';

export interface Settings {
  handedness: Handedness;
  tuning: string;
  reading: Reading;
  goal: Goal;
  sessionMinutes: 5 | 10 | 15;
  latencyBaselineMs: number | null;
  micEnabled: boolean;
  accidentalPref: 'sharp' | 'flat';
  soundOn: boolean;
  volume: number;
  /** When onboarding was finished or skipped (design §4); `null` before first launch. */
  onboardedAt: Date | null;
  /** Hide the fret inlays too at guide level 0 (design §3.5). */
  blindMode: boolean;
  /** Per-user FSRS weights, refit after ~1,000 reviews (engine/refit.ts); `null` = defaults. */
  fsrsParams: FittedFsrsParams | null;
}

export const DEFAULT_SETTINGS: Settings = {
  handedness: 'right',
  tuning: 'standard',
  reading: { reads: { tab: false, staff: false }, learn: { tab: false, staff: false } },
  goal: 'general',
  sessionMinutes: 10,
  latencyBaselineMs: null,
  micEnabled: false,
  accidentalPref: 'sharp',
  soundOn: true,
  volume: 0.8,
  onboardedAt: null,
  blindMode: false,
  fsrsParams: null,
};

// --- Item IDs -------------------------------------------------------------
//
// One ID per atomic fact (research/02 rule 1). Each kind has a canonical form:
// integers without leading zeros, explicit signs on offsets, and sharps for
// accidentals in IDs (drills respell with the accidental preference). Parsers
// accept only the canonical form, so an ID round-trips to itself.

export type ItemRef =
  | { kind: 'note'; position: Position }
  | { kind: 'find'; pc: string; string: number }
  | { kind: 'step'; semitones: number; from: string }
  | { kind: 'letter'; steps: number; from: string }
  | { kind: 'marker'; fret: number }
  | { kind: 'find-marker'; fret: number }
  | { kind: 'repeat'; frets: number; from: number }
  | { kind: 'octave'; from: Position; string: number }
  | { kind: 'octaves'; pc: string }
  | { kind: 'interval' | 'interval-name'; interval: IntervalName; from: number; to: number }
  | { kind: 'spell-key'; tonic: string }
  | { kind: 'spell-chord'; chord: ChordKind; root: string }
  | { kind: 'degree' | 'degree-of'; degree: number; tonic: string }
  | { kind: 'caged' | 'caged-core'; shape: CagedShapeName; quality: CagedQuality }
  | { kind: 'chord-tone' | 'chord-tone-name'; degree: ChordDegree; chord: ChordKind }
  | { kind: 'chord-name'; shape: CagedShapeName; chord: ChordKind }
  | { kind: 'build-chord'; chord: ChordKind; string: number }
  | { kind: CapoItemKind; shape: string }
  | { kind: NumeralItemKind; numeral: string; key: string }
  | { kind: 'progression'; progression: string; task: ProgressionTask }
  | { kind: 'chord-tones'; root: string; chord: ChordKind; degree: ChordDegree | null }
  | { kind: 'key-signature' | 'relative-minor' | 'dominant'; tonic: string }
  | { kind: 'signature-key'; alteration: number }
  | { kind: 'penta-box' | 'penta-relative'; box: BoxNumber; quality: PentatonicQuality };

const INT = '(0|[1-9]\\d*)';
const OFFSET = '([+-][1-9]\\d*)';
const PC = '([A-G][#b]?)';

const NOTE_ITEM = new RegExp(`^note@s${INT}f${INT}$`);
const FIND_ITEM = new RegExp(`^find:${PC}@s${INT}$`);
const STEP_ITEM = new RegExp(`^step:${OFFSET}@${PC}$`);
const LETTER_ITEM = new RegExp(`^letter:${OFFSET}@([A-G])$`);
const MARKER_ITEM = new RegExp(`^(marker|find-marker):f${INT}$`);
const REPEAT_ITEM = new RegExp(`^repeat:${OFFSET}@f${INT}$`);
const OCTAVE_ITEM = new RegExp(`^octave:s${INT}f${INT}→s${INT}$`);
const OCTAVES_ITEM = new RegExp(`^octaves:${PC}$`);
const INTERVAL_ITEM = new RegExp(`^(interval|interval-name):([A-Za-z0-9]+)@s${INT}→s${INT}$`);
const SPELL_KEY_ITEM = new RegExp(`^spell-key:${PC}$`);
const SPELL_CHORD_ITEM = new RegExp(`^spell-chord:([A-Za-z0-9]+)@${PC}$`);
const DEGREE_ITEM = new RegExp(`^(degree|degree-of):([1-7])@${PC}$`);
const CAGED_ITEM = /^(caged|caged-core):([CAGED])-shape@(major|minor|dominant7)$/;
const CHORD_TONE_ITEM = /^(chord-tone|chord-tone-name):(b{0,2}\d|#\d)@([A-Za-z0-9]+)$/;
const CHORD_NAME_ITEM = /^chord-name:([CAGED])-shape@([A-Za-z0-9]+)$/;
const BUILD_CHORD_ITEM = new RegExp(`^build-chord:([A-Za-z0-9]+)@s${INT}$`);
const CAPO_ITEM = new RegExp(`^(capo-sound|capo-shape|capo-fret):${PC}(m?)$`);
const NUMERAL_ITEM = /^(numeral|numeral-of|nashville):([^@\s]+)@key=([A-G][#b]?m?)$/;
const PROGRESSION_ITEM = /^prog:([A-Za-z0-9-]+):(build|transpose)$/;
const CHORD_TONES_ITEM = /^chord-tones:(?:(b{0,2}\d|#\d)@)?([A-G][#b]?[A-Za-z0-9]*)$/;
const KEY_FACT_ITEM = new RegExp(`^(key-signature|relative-minor|dominant):${PC}$`);
const SIGNATURE_KEY_ITEM = /^signature-key:(0|[1-7][#b])$/;
const PENTA_ITEM = /^(penta-box|penta-relative):([1-5])@(major|minor)$/;

function count(n: number, what: string): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Invalid ${what}: ${n}`);
  return n;
}

function offset(n: number): string {
  if (!Number.isInteger(n) || n === 0) throw new RangeError(`Invalid offset: ${n}`);
  return n > 0 ? `+${n}` : `${n}`;
}

function pitchClass(pc: string): string {
  if (!new RegExp(`^${PC}$`).test(pc)) throw new RangeError(`Invalid pitch class: ${pc}`);
  return pc;
}

/** `note@s6f5`: name the note at string 6, fret 5 (position → name). */
export function noteItemId(pos: Position): string {
  return `note@s${count(pos.string, 'string')}f${count(pos.fret, 'fret')}`;
}

export function parseNoteItemId(id: string): Position | null {
  const m = NOTE_ITEM.exec(id);
  if (!m) return null;
  return { string: Number(m[1]), fret: Number(m[2]) };
}

/** `find:G@s5`: find G on string 5 (name → position). */
export function findItemId(pc: string, string: number): string {
  return `find:${pitchClass(pc)}@s${count(string, 'string')}`;
}

export function parseFindItemId(id: string): { pc: string; string: number } | null {
  const m = FIND_ITEM.exec(id);
  if (!m) return null;
  return { pc: m[1] as string, string: Number(m[2]) };
}

/** `step:+2@E`: the note 2 semitones (a whole step) above E. */
export function stepItemId(semitones: number, from: string): string {
  return `step:${offset(semitones)}@${pitchClass(from)}`;
}

export function parseStepItemId(id: string): { semitones: number; from: string } | null {
  const m = STEP_ITEM.exec(id);
  if (!m) return null;
  return { semitones: Number(m[1]), from: m[2] as string };
}

/** `letter:+1@G`: the next letter of the musical alphabet after G (A). */
export function letterItemId(steps: number, from: string): string {
  if (!/^[A-G]$/.test(from)) throw new RangeError(`Invalid letter: ${from}`);
  return `letter:${offset(steps)}@${from}`;
}

export function parseLetterItemId(id: string): { steps: number; from: string } | null {
  const m = LETTER_ITEM.exec(id);
  if (!m) return null;
  return { steps: Number(m[1]), from: m[2] as string };
}

/** `marker:f7`: which fret is this inlay marker? (position → name) */
export function markerItemId(fret: number): string {
  return `marker:f${count(fret, 'fret')}`;
}

/** `find-marker:f7`: tap the 7th-fret marker (name → position). */
export function findMarkerItemId(fret: number): string {
  return `find-marker:f${count(fret, 'fret')}`;
}

export function parseMarkerItemId(
  id: string,
): { kind: 'marker' | 'find-marker'; fret: number } | null {
  const m = MARKER_ITEM.exec(id);
  if (!m) return null;
  return { kind: m[1] as 'marker' | 'find-marker', fret: Number(m[2]) };
}

/** `repeat:+12@f3`: fret 3 repeats 12 frets up (at fret 15). */
export function repeatItemId(frets: number, from: number): string {
  return `repeat:${offset(frets)}@f${count(from, 'fret')}`;
}

export function parseRepeatItemId(id: string): { frets: number; from: number } | null {
  const m = REPEAT_ITEM.exec(id);
  if (!m) return null;
  return { frets: Number(m[1]), from: Number(m[2]) };
}

/** `octave:s6f5→s4`: the octave of string 6, fret 5 on string 4. */
export function octaveItemId(from: Position, string: number): string {
  return `octave:s${count(from.string, 'string')}f${count(from.fret, 'fret')}→s${count(string, 'string')}`;
}

export function parseOctaveItemId(id: string): { from: Position; string: number } | null {
  const m = OCTAVE_ITEM.exec(id);
  if (!m) return null;
  return { from: { string: Number(m[1]), fret: Number(m[2]) }, string: Number(m[3]) };
}

/** `octaves:G`: every octave of G across the neck, from one shown G (multi-target). */
export function octavesItemId(pc: string): string {
  return `octaves:${pitchClass(pc)}`;
}

export function parseOctavesItemId(id: string): { pc: string } | null {
  const m = OCTAVES_ITEM.exec(id);
  if (!m) return null;
  return { pc: m[1] as string };
}

/**
 * `interval:M3@s6→s5`: tap the M3 above a root on string 6, on string 5
 * (name → position). `interval-name:M3@s6→s5` is the reverse: name the
 * interval two dots on strings 6 and 5 make (position → name).
 */
export function intervalItemId(
  kind: 'interval' | 'interval-name',
  interval: IntervalName,
  from: number,
  to: number,
): string {
  if (!isIntervalName(interval)) throw new RangeError(`Invalid interval: ${String(interval)}`);
  return `${kind}:${interval}@s${count(from, 'string')}→s${count(to, 'string')}`;
}

export function parseIntervalItemId(id: string): {
  kind: 'interval' | 'interval-name';
  interval: IntervalName;
  from: number;
  to: number;
} | null {
  const m = INTERVAL_ITEM.exec(id);
  if (!m || !isIntervalName(m[2] as string)) return null;
  return {
    kind: m[1] as 'interval' | 'interval-name',
    interval: m[2] as IntervalName,
    from: Number(m[3]),
    to: Number(m[4]),
  };
}

// Spelling items (C4, C5) keep the tonic or root as written: F# major and Gb
// major are different spellings of the same pitches, so different facts.

/** `spell-key:F#`: spell the F# major scale, tonic first (F# G# A# B C# D# E#). */
export function spellKeyItemId(tonic: string): string {
  return `spell-key:${pitchClass(tonic)}`;
}

export function parseSpellKeyItemId(id: string): { tonic: string } | null {
  const m = SPELL_KEY_ITEM.exec(id);
  if (!m) return null;
  return { tonic: m[1] as string };
}

/** `spell-chord:m7@B`: spell Bm7, root first (B D F# A). */
export function spellChordItemId(chord: ChordKind, root: string): string {
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  return `spell-chord:${chord}@${pitchClass(root)}`;
}

export function parseSpellChordItemId(id: string): { chord: ChordKind; root: string } | null {
  const m = SPELL_CHORD_ITEM.exec(id);
  if (!m || !isChordKind(m[1] as string)) return null;
  return { chord: m[1] as ChordKind, root: m[2] as string };
}

/**
 * `degree:6@Eb`: the 6th of E♭ major (C), degree → note. `degree-of:6@Eb`
 * is the reverse: which degree of E♭ major is C? (note → degree).
 */
export function degreeItemId(kind: 'degree' | 'degree-of', degree: number, tonic: string): string {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) {
    throw new RangeError(`Invalid degree: ${degree}`);
  }
  return `${kind}:${degree}@${pitchClass(tonic)}`;
}

export function parseDegreeItemId(
  id: string,
): { kind: 'degree' | 'degree-of'; degree: number; tonic: string } | null {
  const m = DEGREE_ITEM.exec(id);
  if (!m) return null;
  return { kind: m[1] as 'degree' | 'degree-of', degree: Number(m[2]), tonic: m[3] as string };
}

/**
 * `caged:A-shape@major`: build the whole A shape of a major chord from its
 * root (C6). `caged-core:A-shape@major` builds only its triad core. The root
 * varies per prompt, so one card holds the shape in every key (research/02
 * rule 12). A dominant-7 shape's core is the major one, so it has no core card.
 */
export function cagedItemId(
  kind: 'caged' | 'caged-core',
  shape: CagedShapeName,
  quality: CagedQuality,
): string {
  if (!CAGED_ORDER.includes(shape)) throw new RangeError(`Invalid CAGED shape: ${String(shape)}`);
  if (!CAGED_QUALITIES.includes(quality) || (kind === 'caged-core' && quality === 'dominant7')) {
    throw new RangeError(`Invalid ${kind} quality: ${String(quality)}`);
  }
  return `${kind}:${shape}-shape@${quality}`;
}

export function parseCagedItemId(
  id: string,
): { kind: 'caged' | 'caged-core'; shape: CagedShapeName; quality: CagedQuality } | null {
  const m = CAGED_ITEM.exec(id);
  if (!m || (m[1] === 'caged-core' && m[3] === 'dominant7')) return null;
  return {
    kind: m[1] as 'caged' | 'caged-core',
    shape: m[2] as CagedShapeName,
    quality: m[3] as CagedQuality,
  };
}

/**
 * `chord-tone:b3@m7`: tap the ♭3 in a shape of a m7 chord (D8, degree →
 * position). `chord-tone-name:b3@m7` is the reverse: which chord tone is the
 * highlighted note? The root, shape and position vary per prompt, so one card
 * holds the degree in every key and voicing (research/02 rule 12). The
 * degree is a formula degree of the kind (`1` is the root).
 */
export function chordToneItemId(
  kind: 'chord-tone' | 'chord-tone-name',
  degree: ChordDegree,
  chord: ChordKind,
): string {
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  if (!chordFormula(chord).includes(degree)) {
    throw new RangeError(`${chord} has no degree ${String(degree)}`);
  }
  return `${kind}:${degree}@${chord}`;
}

export function parseChordToneItemId(
  id: string,
): { kind: 'chord-tone' | 'chord-tone-name'; degree: ChordDegree; chord: ChordKind } | null {
  const m = CHORD_TONE_ITEM.exec(id);
  const chord = m?.[3] as string;
  if (!m || !isChordKind(chord)) return null;
  const degree = m[2] as ChordDegree;
  if (!chordFormula(chord).includes(degree)) return null;
  return { kind: m[1] as 'chord-tone' | 'chord-tone-name', degree, chord };
}

/**
 * `chord-name:A-shape@m7`: name the chord from its dots (D36), root then
 * quality, for a m7 voicing from the A-shape family. The root and neck
 * position vary per prompt, so one card holds the shape-and-quality pairing
 * in every key (research/02 rule 12).
 */
export function chordNameItemId(shape: CagedShapeName, chord: ChordKind): string {
  if (!CAGED_ORDER.includes(shape)) throw new RangeError(`Invalid CAGED shape: ${String(shape)}`);
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  return `chord-name:${shape}-shape@${chord}`;
}

export function parseChordNameItemId(
  id: string,
): { shape: CagedShapeName; chord: ChordKind } | null {
  const m = CHORD_NAME_ITEM.exec(id);
  const chord = m?.[2] as string;
  if (!m || !isChordKind(chord)) return null;
  return { shape: m[1] as CagedShapeName, chord };
}

/**
 * `build-chord:m7@s5`: build a m7 voicing from a root on string 5 (D38,
 * symbol → voicing). The root and its fret vary per prompt, and any playable
 * voicing with the chord's tones counts, so one card holds the chord kind
 * from that root string in every key (research/02 rule 12).
 */
export function buildChordItemId(chord: ChordKind, string: number): string {
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  if (count(string, 'string') < 1) throw new RangeError(`Invalid string: ${string}`);
  return `build-chord:${chord}@s${string}`;
}

export function parseBuildChordItemId(id: string): { chord: ChordKind; string: number } | null {
  const m = BUILD_CHORD_ITEM.exec(id);
  const chord = m?.[1] as string;
  const string = Number(m?.[2]);
  if (!m || !isChordKind(chord) || string < 1) return null;
  return { chord, string };
}

export type CapoItemKind = 'capo-sound' | 'capo-shape' | 'capo-fret';

/**
 * Capo cards (C10, D13), keyed by the open-shape key the learner fingers
 * (`G`, `Am`). `capo-sound:G`: G shapes with a capo on fret n, which key
 * sounds? `capo-shape:G`: a song in that key with a capo on fret n, which
 * shapes? `capo-fret:G`: a song in a key, played with G shapes, which fret?
 * The capo fret varies per prompt, so one card holds the shape at every
 * capo (research/02 rule 12), the grain of the CAGED cards.
 */
export function capoItemId(kind: CapoItemKind, shape: string): string {
  const m = /^([A-G][#b]?)(m?)$/.exec(shape);
  if (!m) throw new RangeError(`Invalid capo shape key: ${shape}`);
  return `${kind}:${pitchClass(m[1] as string)}${m[2] as string}`;
}

export function parseCapoItemId(id: string): { kind: CapoItemKind; shape: string } | null {
  const m = CAPO_ITEM.exec(id);
  if (!m) return null;
  return { kind: m[1] as CapoItemKind, shape: `${m[2] as string}${m[3] as string}` };
}

/**
 * Numeral items (C8, design §3.1): `numeral:vi@key=D` names the chord a
 * numeral is in a key (vi in D → Bm), `numeral-of:vi@key=D` the reverse
 * (Bm in D → vi), and `nashville:6m@key=D` reads a Nashville number as a
 * chord. The numeral is written as `theory/harmony` writes it (`vii°`,
 * `bVII`, `6m`) and the key as its label (`D`, `Bb`, `Am`).
 */
export type NumeralItemKind = 'numeral' | 'numeral-of' | 'nashville';

function canonicalNumeral(kind: NumeralItemKind, numeral: string): boolean {
  if (kind === 'nashville') {
    const n = parseNashville(numeral);
    return n !== null && nashvilleNumber(n) === numeral;
  }
  const n = parseRoman(numeral);
  return n !== null && romanNumeral(n) === numeral;
}

function canonicalKey(key: string): boolean {
  try {
    return keyLabel(parseKey(key)) === key;
  } catch {
    return false;
  }
}

export function numeralItemId(kind: NumeralItemKind, numeral: string, key: string): string {
  if (!canonicalNumeral(kind, numeral)) throw new RangeError(`Invalid ${kind}: ${numeral}`);
  if (!canonicalKey(key)) throw new RangeError(`Invalid key: ${key}`);
  return `${kind}:${numeral}@key=${key}`;
}

export function parseNumeralItemId(
  id: string,
): { kind: NumeralItemKind; numeral: string; key: string } | null {
  const m = NUMERAL_ITEM.exec(id);
  if (!m) return null;
  const kind = m[1] as NumeralItemKind;
  const numeral = m[2] as string;
  const key = m[3] as string;
  if (!canonicalNumeral(kind, numeral) || !canonicalKey(key)) return null;
  return { kind, numeral, key };
}

/**
 * `prog:I-V-vi-IV:build`: fill a progression's slots in a key (D12, numerals
 * → chords). `prog:I-V-vi-IV:transpose` moves its chart to another key. The
 * progression is a catalogue ID (`theory/harmony` PROGRESSIONS), and the
 * keys vary per prompt, so one card holds the progression in every key
 * (research/02 rule 12).
 */
export type ProgressionTask = 'build' | 'transpose';

function isProgressionId(id: string): boolean {
  return PROGRESSIONS.some((p) => p.id === id);
}

export function progressionItemId(progression: string, task: ProgressionTask): string {
  if (!isProgressionId(progression)) throw new RangeError(`Unknown progression: ${progression}`);
  if (task !== 'build' && task !== 'transpose') {
    throw new RangeError(`Invalid progression task: ${String(task)}`);
  }
  return `prog:${progression}:${task}`;
}

export function parseProgressionItemId(
  id: string,
): { progression: string; task: ProgressionTask } | null {
  const m = PROGRESSION_ITEM.exec(id);
  if (!m || !isProgressionId(m[1] as string)) return null;
  return { progression: m[1] as string, task: m[2] as ProgressionTask };
}

/**
 * `chord-tones:C`: tap every note of C major across the neck (D37, chord →
 * positions). `chord-tones:3@C` taps every 3rd of C major, and
 * `chord-tones:b7@Cm7` every ♭7 of Cm7. One card per chord: the chord's
 * symbol is part of the ID, so "Quiz me on this" in Explore can find it.
 */
export function chordTonesItemId(
  root: string,
  chord: ChordKind,
  degree: ChordDegree | null = null,
): string {
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  if (degree !== null && !chordFormula(chord).includes(degree)) {
    throw new RangeError(`${chord} has no degree ${String(degree)}`);
  }
  const symbol = nameChord(pitchClass(root), chord);
  return degree === null ? `chord-tones:${symbol}` : `chord-tones:${degree}@${symbol}`;
}

export function parseChordTonesItemId(
  id: string,
): { root: string; chord: ChordKind; degree: ChordDegree | null } | null {
  const m = CHORD_TONES_ITEM.exec(id);
  if (!m) return null;
  let parsed;
  try {
    parsed = parseChord(m[2] as string);
  } catch {
    return null;
  }
  // Canonical symbols only (`Cm7`, not `Cmin7`), so an ID round-trips.
  if (nameChord(parsed.root, parsed.kind) !== m[2]) return null;
  const degree = (m[1] ?? null) as ChordDegree | null;
  if (degree !== null && !chordFormula(parsed.kind).includes(degree)) return null;
  return { root: parsed.root, chord: parsed.kind, degree };
}

// Key facts (I3) keep the major tonic as written, as spelling items do: Gb
// major has 6 flats and F# major 6 sharps, so they are different facts.

/**
 * `key-signature:Eb`: how many sharps or flats E♭ major has, and which (3:
 * B♭ E♭ A♭). `relative-minor:Eb` is its relative minor (C minor) and
 * `dominant:Eb` its V (B♭), all from the major key's tonic.
 */
export function keyFactItemId(
  kind: 'key-signature' | 'relative-minor' | 'dominant',
  tonic: string,
): string {
  return `${kind}:${pitchClass(tonic)}`;
}

export function parseKeyFactItemId(
  id: string,
): { kind: 'key-signature' | 'relative-minor' | 'dominant'; tonic: string } | null {
  const m = KEY_FACT_ITEM.exec(id);
  if (!m) return null;
  return {
    kind: m[1] as 'key-signature' | 'relative-minor' | 'dominant',
    tonic: m[2] as string,
  };
}

/**
 * `signature-key:3b`: which major key has 3 flats (E♭)? Sharps are `#`, and
 * no sharps or flats is `0`. The alteration counts sharps up, flats down.
 */
export function signatureKeyItemId(alteration: number): string {
  if (!Number.isInteger(alteration) || alteration < -7 || alteration > 7) {
    throw new RangeError(`Invalid key signature: ${alteration}`);
  }
  if (alteration === 0) return 'signature-key:0';
  return `signature-key:${Math.abs(alteration)}${alteration > 0 ? '#' : 'b'}`;
}

export function parseSignatureKeyItemId(id: string): { alteration: number } | null {
  const m = SIGNATURE_KEY_ITEM.exec(id);
  if (!m) return null;
  const sig = m[1] as string;
  if (sig === '0') return { alteration: 0 };
  const n = Number(sig.charAt(0));
  return { alteration: sig.endsWith('#') ? n : -n };
}

/**
 * `penta-box:1@minor`: build minor pentatonic box 1 around its CAGED shape
 * (C7). `penta-relative:1@minor` finds the relative major's root in that box.
 * The root and neck position vary per prompt, so one card holds the box in
 * every key (research/02 rule 12).
 */
export function pentaItemId(
  kind: 'penta-box' | 'penta-relative',
  box: BoxNumber,
  quality: PentatonicQuality,
): string {
  if (!BOX_NUMBERS.includes(box)) throw new RangeError(`Invalid box: ${String(box)}`);
  if (quality !== 'major' && quality !== 'minor') {
    throw new RangeError(`Invalid pentatonic quality: ${String(quality)}`);
  }
  return `${kind}:${box}@${quality}`;
}

export function parsePentaItemId(
  id: string,
): { kind: 'penta-box' | 'penta-relative'; box: BoxNumber; quality: PentatonicQuality } | null {
  const m = PENTA_ITEM.exec(id);
  if (!m) return null;
  return {
    kind: m[1] as 'penta-box' | 'penta-relative',
    box: Number(m[2]) as BoxNumber,
    quality: m[3] as PentatonicQuality,
  };
}

export function itemId(ref: ItemRef): string {
  switch (ref.kind) {
    case 'note':
      return noteItemId(ref.position);
    case 'find':
      return findItemId(ref.pc, ref.string);
    case 'step':
      return stepItemId(ref.semitones, ref.from);
    case 'letter':
      return letterItemId(ref.steps, ref.from);
    case 'marker':
      return markerItemId(ref.fret);
    case 'find-marker':
      return findMarkerItemId(ref.fret);
    case 'repeat':
      return repeatItemId(ref.frets, ref.from);
    case 'octave':
      return octaveItemId(ref.from, ref.string);
    case 'octaves':
      return octavesItemId(ref.pc);
    case 'interval':
    case 'interval-name':
      return intervalItemId(ref.kind, ref.interval, ref.from, ref.to);
    case 'spell-key':
      return spellKeyItemId(ref.tonic);
    case 'spell-chord':
      return spellChordItemId(ref.chord, ref.root);
    case 'degree':
    case 'degree-of':
      return degreeItemId(ref.kind, ref.degree, ref.tonic);
    case 'caged':
    case 'caged-core':
      return cagedItemId(ref.kind, ref.shape, ref.quality);
    case 'chord-tone':
    case 'chord-tone-name':
      return chordToneItemId(ref.kind, ref.degree, ref.chord);
    case 'chord-name':
      return chordNameItemId(ref.shape, ref.chord);
    case 'build-chord':
      return buildChordItemId(ref.chord, ref.string);
    case 'capo-sound':
    case 'capo-shape':
    case 'capo-fret':
      return capoItemId(ref.kind, ref.shape);
    case 'numeral':
    case 'numeral-of':
    case 'nashville':
      return numeralItemId(ref.kind, ref.numeral, ref.key);
    case 'progression':
      return progressionItemId(ref.progression, ref.task);
    case 'chord-tones':
      return chordTonesItemId(ref.root, ref.chord, ref.degree);
    case 'key-signature':
    case 'relative-minor':
    case 'dominant':
      return keyFactItemId(ref.kind, ref.tonic);
    case 'signature-key':
      return signatureKeyItemId(ref.alteration);
    case 'penta-box':
    case 'penta-relative':
      return pentaItemId(ref.kind, ref.box, ref.quality);
  }
}

export function parseItemId(id: string): ItemRef | null {
  const note = parseNoteItemId(id);
  if (note) return { kind: 'note', position: note };
  const find = parseFindItemId(id);
  if (find) return { kind: 'find', ...find };
  const step = parseStepItemId(id);
  if (step) return { kind: 'step', ...step };
  const letter = parseLetterItemId(id);
  if (letter) return { kind: 'letter', ...letter };
  const marker = parseMarkerItemId(id);
  if (marker) return marker;
  const repeat = parseRepeatItemId(id);
  if (repeat) return { kind: 'repeat', ...repeat };
  const octave = parseOctaveItemId(id);
  if (octave) return { kind: 'octave', ...octave };
  const octaves = parseOctavesItemId(id);
  if (octaves) return { kind: 'octaves', ...octaves };
  const interval = parseIntervalItemId(id);
  if (interval) return interval;
  const spellKey = parseSpellKeyItemId(id);
  if (spellKey) return { kind: 'spell-key', ...spellKey };
  const spellChord = parseSpellChordItemId(id);
  if (spellChord) return { kind: 'spell-chord', ...spellChord };
  const degree = parseDegreeItemId(id);
  if (degree) return degree;
  const caged = parseCagedItemId(id);
  if (caged) return caged;
  const chordTone = parseChordToneItemId(id);
  if (chordTone) return chordTone;
  const chordName = parseChordNameItemId(id);
  if (chordName) return { kind: 'chord-name', ...chordName };
  const buildChord = parseBuildChordItemId(id);
  if (buildChord) return { kind: 'build-chord', ...buildChord };
  const capo = parseCapoItemId(id);
  if (capo) return capo;
  const numeral = parseNumeralItemId(id);
  if (numeral) return numeral;
  const progression = parseProgressionItemId(id);
  if (progression) return { kind: 'progression', ...progression };
  const chordTones = parseChordTonesItemId(id);
  if (chordTones) return { kind: 'chord-tones', ...chordTones };
  const keyFact = parseKeyFactItemId(id);
  if (keyFact) return keyFact;
  const signatureKey = parseSignatureKeyItemId(id);
  if (signatureKey) return { kind: 'signature-key', ...signatureKey };
  const penta = parsePentaItemId(id);
  if (penta) return penta;
  return null;
}
