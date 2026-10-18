import type { Card as FsrsCard, Rating } from 'ts-fsrs';
import { isIntervalName, type IntervalName, type Position } from '../theory';

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
  count: number;
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
  | { kind: 'interval' | 'interval-name'; interval: IntervalName; from: number; to: number };

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
const INTERVAL_ITEM = new RegExp(`^(interval|interval-name):([A-Za-z0-9]+)@s${INT}→s${INT}$`);

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
    case 'interval':
    case 'interval-name':
      return intervalItemId(ref.kind, ref.interval, ref.from, ref.to);
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
  const interval = parseIntervalItemId(id);
  if (interval) return interval;
  return null;
}
