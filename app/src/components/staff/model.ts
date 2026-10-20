import { Key } from 'tonal';
import { tabEventLabel, type TabEvent } from '../../theory/tab';
import { positionName, positionOf, spokenPitch, type StaffPosition } from './position';

/** Note values, in VexFlow's duration codes. */
export type NoteValue = 'w' | 'h' | 'q' | '8' | '16' | '32';

/**
 * `target` is the note being asked about, `current` the phrase cursor,
 * `correct` flashes, `ghost` previews, `root` is a theory mark. Every style
 * differs in shape as well as colour (design §7).
 */
export type StaffNoteStyle =
  'plain' | 'target' | 'current' | 'correct' | 'wrong' | 'ghost' | 'root';

export interface StaffNote {
  /**
   * **Sounding** pitches, as `theory/` names them ("E2" is open low E): one
   * is a note, several a chord, none a rest. <Staff> writes them an octave up
   * for the 8vb clef itself, so never pass written pitches here.
   */
  pitches?: readonly string[];
  value: NoteValue;
  dots?: 0 | 1 | 2;
  /** Tie each pitch into the next note. */
  tie?: boolean;
  /** Where to play each pitch, for the tab under the staff. */
  tab?: readonly TabEvent[];
  style?: StaffNoteStyle;
  /** A barline after this note. */
  barAfter?: boolean;
}

/** `count` notes from `from` played in the time of `inSpaceOf` (a triplet is 3 in 2). */
export interface StaffTuplet {
  from: number;
  count: number;
  inSpaceOf?: number;
}

/** A mark on a position with no note, e.g. the learner's answer in D24. */
export type StaffMarkStyle = 'selected' | 'correct' | 'wrong' | 'ghost';

export interface StaffMark {
  position: StaffPosition;
  style: StaffMarkStyle;
  /** Sit under this note's column; by default the mark sits in the answer column. */
  at?: number;
}

export function isRest(note: StaffNote): boolean {
  return !note.pitches || note.pitches.length === 0;
}

const VALUE_NAMES: Record<NoteValue, string> = {
  w: 'whole',
  h: 'half',
  q: 'quarter',
  '8': 'eighth',
  '16': 'sixteenth',
  '32': 'thirty-second',
};

const DOT_NAMES = ['', 'dotted ', 'double-dotted '];

const ACCIDENTAL_NAMES: Record<string, string> = {
  '#': 'sharp',
  '##': 'double sharp',
  b: 'flat',
  bb: 'double flat',
  n: 'natural',
};

/** The tuplet a note belongs to, if any. */
export function tupletOf(index: number, tuplets: readonly StaffTuplet[]): StaffTuplet | undefined {
  return tuplets.find((t) => index >= t.from && index < t.from + t.count);
}

export interface NoteLabelOptions {
  /** Name the pitches; otherwise say where the note sits, as a sighted learner sees it. */
  revealPitch?: boolean;
  tuplet?: StaffTuplet;
  /** The accidentals the engraving shows, per pitch (VexFlow codes, "" for none). */
  accidentals?: readonly string[];
  /** Say where to play it (the tab under the staff is showing). */
  withTab?: boolean;
}

/**
 * The VoiceOver name of a note: "F sharp 3, dotted eighth note",
 * "quarter rest", "E2 and B2, half-note chord, tied to the next note".
 * With `revealPitch: false`, pitches become places: "quarter note on line 2,
 * sharp".
 */
export function noteLabel(note: StaffNote, opts: NoteLabelOptions = {}): string {
  const { revealPitch = true, tuplet, accidentals = [], withTab = false } = opts;
  const value = `${DOT_NAMES[note.dots ?? 0]}${VALUE_NAMES[note.value]}`;
  const parts: string[] = [];
  const pitches = note.pitches ?? [];
  if (pitches.length === 0) {
    parts.push(`${value} rest`);
  } else {
    const kind = pitches.length > 1 ? `${value}-note chord` : `${value} note`;
    if (revealPitch) {
      parts.push(pitches.map(spokenPitch).join(' and '), kind);
    } else {
      const where = pitches.map((p) => positionName(positionOf(p))).join(' and ');
      parts.push(`${kind} on ${where}`);
      const shown = accidentals.filter(Boolean).map((a) => ACCIDENTAL_NAMES[a] ?? a);
      if (shown.length > 0) parts.push(shown.join(' and '));
    }
  }
  if (tuplet) parts.push(tuplet.count === 3 ? 'triplet' : `${tuplet.count}-tuplet`);
  if (note.tie && pitches.length > 0) parts.push('tied to the next note');
  if (withTab && note.tab && note.tab.length > 0) {
    parts.push(note.tab.map(tabEventLabel).join(' and '));
  }
  return parts.join(', ');
}

/**
 * How many sharps or flats a key signature has. Keys are VexFlow key specs:
 * "G", "Bb", "Em", "F#m".
 */
export function keyAccidentalCount(key: string): number {
  const minor = key.endsWith('m');
  const tonic = minor ? key.slice(0, -1) : key;
  if (Key.majorKey(tonic).tonic === '') throw new Error(`Not a key signature: ${key}`);
  return Math.abs(minor ? Key.minorKey(tonic).alteration : Key.majorKey(tonic).alteration);
}
