import { Note } from 'tonal';

/**
 * Staff positions on the guitar's treble clef 8vb (design §12). A position
 * counts diatonic steps up from the bottom line: 0 is the bottom line, 1 the
 * first space, 8 the top line, -2 the first ledger line below. Even
 * positions are lines, odd ones spaces.
 *
 * Pitches are **sounding** pitches, as in `theory/` (open low E is E2). The
 * clef's "8" means the staff reads an octave above that: the bottom line is
 * sounding E3, and open low E hangs under three ledger lines (-7).
 *
 * This is the renderer's small slice of staff theory. Key signatures,
 * spelling in context and position reading belong to `theory/staff.ts`
 * (M8-03).
 */
export type StaffPosition = number;

const LETTERS = 'CDEFGAB';
/** Diatonic number (octave × 7 + letter) of the bottom line, sounding E3. */
const BOTTOM_LINE = 3 * 7 + LETTERS.indexOf('E');
export const TOP_LINE: StaffPosition = 8;
export const BOTTOM: StaffPosition = 0;

interface ParsedPitch {
  letter: string;
  acc: string;
  oct: number;
}

function parse(pitch: string): ParsedPitch {
  const n = Note.get(pitch);
  if (n.empty || n.oct === undefined) throw new Error(`Not a pitch with an octave: ${pitch}`);
  return { letter: n.letter, acc: n.acc, oct: n.oct };
}

/** The staff position of a sounding pitch; accidentals don't move it. */
export function positionOf(pitch: string): StaffPosition {
  const { letter, oct } = parse(pitch);
  return oct * 7 + LETTERS.indexOf(letter) - BOTTOM_LINE;
}

/** The natural sounding pitch written at a position, e.g. 0 → "E3". */
export function naturalAt(position: StaffPosition): string {
  const d = position + BOTTOM_LINE;
  const octave = Math.floor(d / 7);
  return `${LETTERS[d - octave * 7]}${octave}`;
}

export function isLine(position: StaffPosition): boolean {
  return position % 2 === 0;
}

/** The ledger lines a note at this position needs, nearest the staff first. */
export function ledgerLines(position: StaffPosition): StaffPosition[] {
  const lines: StaffPosition[] = [];
  for (let p = BOTTOM - 2; p >= position; p -= 2) lines.push(p);
  for (let p = TOP_LINE + 2; p <= position; p += 2) lines.push(p);
  return lines;
}

/**
 * The VexFlow key for a sounding pitch, written an octave up for the 8vb
 * clef: "F#2" → "f#/3".
 */
export function writtenKey(pitch: string): string {
  const { letter, acc, oct } = parse(pitch);
  return `${letter.toLowerCase()}${acc}/${oct + 1}`;
}

const ORDINALS = ['1st', '2nd', '3rd'];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

/**
 * An accessible name for a position that says where it is, never which
 * note it is (a sighted learner sees the place, not the name): "line 2",
 * "space 4", "2nd ledger line below", "space above the 1st ledger line".
 * Lines and spaces count up from the bottom, as musicians count them.
 */
export function positionName(position: StaffPosition): string {
  if (position >= BOTTOM && position <= TOP_LINE) {
    return isLine(position) ? `line ${position / 2 + 1}` : `space ${(position + 1) / 2}`;
  }
  if (position === BOTTOM - 1) return 'space below the staff';
  if (position === TOP_LINE + 1) return 'space above the staff';
  if (position < BOTTOM) {
    return isLine(position)
      ? `${ordinal(-position / 2)} ledger line below`
      : `space below the ${ordinal((-position - 1) / 2)} ledger line`;
  }
  return isLine(position)
    ? `${ordinal((position - TOP_LINE) / 2)} ledger line above`
    : `space above the ${ordinal((position - TOP_LINE - 1) / 2)} ledger line`;
}

const SPOKEN_ACC: Record<string, string> = {
  '#': ' sharp',
  '##': ' double sharp',
  b: ' flat',
  bb: ' double flat',
};

/** How VoiceOver should say a pitch: "F#3" → "F sharp 3". */
export function spokenPitch(pitch: string): string {
  const { letter, acc, oct } = parse(pitch);
  return `${letter}${SPOKEN_ACC[acc] ?? ''} ${oct}`;
}
