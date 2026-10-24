import { staffConcept, type StaffDirection } from '../../engine/items/staff';
import type { Item } from '../../engine/model';
import {
  NATURAL_PCS,
  describeStaffPosition,
  isLine,
  isOnStaff,
  noteAtStaffPosition,
  positionsOfMidi,
  staffNote,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D22_HIGHEST, D22_LOWEST, D22_SCOPE, d22Parse } from './meta';

export {
  D22_HIGHEST,
  D22_ID,
  D22_LOWEST,
  D22_SCOPE,
  d22CanTest,
  d22ConceptOf,
  d22Parse,
} from './meta';

/**
 * D22 "Name the note on the staff" (design §6, §12): R1's cards, both ways.
 *
 * - **Read** (`staff:E4@treble8vb`): one note on the guitar's treble 8vb
 *   staff; the learner names it A–G, by button or hardware key.
 * - **Place** (`staff:E4@treble8vb:place`): the letter and which part of
 *   the staff it is on (below, on, above); the learner taps its line or
 *   space. Each letter appears once below the staff and once above, so the
 *   part names the place. On the staff E and F appear twice, so those cards
 *   say which: "the higher E".
 *
 * Notes are sounding pitches (`E4` is the open 1st string, in the top
 * space), as everywhere in `theory/`. The learner never sees an octave
 * number: the place, the letter and the fret are what reading links.
 *
 * A miss is keyed by place: naming F for an E in the top space is the top
 * line read for the space below it, and tapping a line for the space next to
 * it is the same slip, so both log `staff@8` against `staff@7`.
 */

export type D22Region = 'below' | 'on' | 'above';

export interface D22Prompt {
  itemId: string;
  direction: StaffDirection;
  /** Sounding pitch: `E4`. */
  note: string;
  midi: number;
  letter: string;
  position: number;
  region: D22Region;
  /** On the staff, E and F come twice: which one a placing card means. */
  which: 'lower' | 'higher' | null;
  /** Reading: the letters, in the musical alphabet from C. */
  choices: string[];
  /** Placing: the positions that take a tap, low to high. */
  range: readonly [number, number];
  tuning: Tuning;
}

/** A letter (reading) or a staff position (placing). */
export type D22Answer = string | number;

export function d22RegionOf(position: number): D22Region {
  if (position < 0) return 'below';
  return isOnStaff(position) ? 'on' : 'above';
}

/** Which of the staff's two Es or Fs a position is; null for every other place. */
export function d22Which(position: number): 'lower' | 'higher' | null {
  if (!isOnStaff(position)) return null;
  if (isOnStaff(position + 7)) return 'lower';
  return isOnStaff(position - 7) ? 'higher' : null;
}

/** The positions a placing card takes taps on: its part of the staff and one place beyond each end. */
export function d22Range(position: number, scopeLevel: number): readonly [number, number] {
  if (Math.round(scopeLevel) >= D22_SCOPE.maxLevel) return [D22_LOWEST, D22_HIGHEST];
  switch (d22RegionOf(position)) {
    case 'below':
      return [D22_LOWEST, 0];
    case 'on':
      return [-1, 9];
    case 'above':
      return [8, D22_HIGHEST];
  }
}

export function d22MakePrompt(item: Item, ctx: DrillContext): D22Prompt {
  const card = d22Parse(item);
  if (!card) throw new Error(`D22 cannot test item ${item.id}`);
  const n = staffNote(card.note);
  return {
    itemId: item.id,
    direction: card.direction,
    note: n.name,
    midi: n.midi,
    letter: n.letter,
    position: n.position,
    region: d22RegionOf(n.position),
    which: d22Which(n.position),
    choices: [...NATURAL_PCS],
    range: d22Range(n.position, ctx.scopeLevel),
    tuning: ctx.tuning,
  };
}

/**
 * Where a named letter sits nearest a place: within three steps, so a letter
 * one off names the line or space beside it. Null for anything not A–G.
 */
export function d22NearestPlaceOf(letter: string, from: number): number | null {
  const at = NATURAL_PCS.indexOf(letter);
  if (at < 0) return null;
  const fromLetter = NATURAL_PCS.indexOf(staffNote(noteAtStaffPosition(from)).letter);
  const up = (at - fromLetter + 7) % 7;
  return up <= 3 ? from + up : from + up - 7;
}

/** The place the learner's answer names: the tapped one, or the named letter's nearest. */
export function d22AnsweredPlace(prompt: D22Prompt, answer: D22Answer): number | null {
  if (typeof answer === 'number') return Number.isInteger(answer) ? answer : null;
  return d22NearestPlaceOf(answer.toUpperCase(), prompt.position);
}

/** A place with its preposition: "in the 4th space", "on the 2nd ledger line below". */
export function d22At(position: number): string {
  return `${isLine(position) ? 'on' : 'in'} the ${describeStaffPosition(position)}`;
}

export function d22Check(prompt: D22Prompt, answer: D22Answer): DrillCheck {
  const concept = staffConcept(prompt.position);
  const expected =
    prompt.direction === 'read' ? prompt.letter : `${prompt.letter}, ${d22At(prompt.position)}`;
  const correct =
    prompt.direction === 'read' ? answer === prompt.letter : answer === prompt.position;
  if (correct) return { correct: true, expected, concept };
  const place = d22AnsweredPlace(prompt, answer);
  const inReach = place !== null && place >= D22_LOWEST && place <= D22_HIGHEST;
  return {
    correct: false,
    expected,
    concept,
    ...(inReach && place !== prompt.position ? { confusedWith: staffConcept(place) } : {}),
  };
}

/** Stored as `answerGiven`: the letter, or the tapped place as `pos7`. */
export function d22DescribeAnswer(answer: D22Answer): string {
  return typeof answer === 'number' ? `pos${answer}` : answer;
}

/** The note asked about, and the one the answer names when it was wrong (research/02 rule 10). */
export function d22Sounds(prompt: D22Prompt, fb: DrillFeedback<D22Answer>): DrillSounds {
  const expected = [prompt.note];
  const given = fb.result.correct ? null : d22AnsweredPlace(prompt, fb.answer);
  return given === null || given === prompt.position
    ? { expected }
    : { expected, given: [noteAtStaffPosition(given)] };
}

/** The frets the neck shows: every cell playing each note, frets 0–15. */
export function d22FeedbackPositions(
  prompt: D22Prompt,
  fb: DrillFeedback<D22Answer>,
  tuning: Tuning = prompt.tuning,
): { expected: Position[]; given: Position[] } {
  const cells = (note: string) =>
    positionsOfMidi(staffNote(note).midi, { tuning, fretRange: { from: 0, to: 15 } });
  const given = fb.result.correct ? null : d22AnsweredPlace(prompt, fb.answer);
  return {
    expected: cells(prompt.note),
    given: given === null || given === prompt.position ? [] : cells(noteAtStaffPosition(given)),
  };
}

// --- Words ------------------------------------------------------------------

/** Where to play a note: its lowest fret, as "the open 1st string" or "string 3, fret 2". */
export function d22WhereToPlay(note: string, tuning: Tuning): string | null {
  const cells = positionsOfMidi(staffNote(note).midi, { tuning, fretRange: { from: 0, to: 15 } });
  const low = cells.reduce<Position | null>((a, c) => (a && a.fret <= c.fret ? a : c), null);
  if (!low) return null;
  return low.fret === 0
    ? `the open ${ordinal(low.string)} string`
    : `string ${low.string}, fret ${low.fret}`;
}

/** "an E", "a G". */
function article(letter: string): string {
  return 'AEF'.includes(letter) ? 'an' : 'a';
}

function ordinal(n: number): string {
  return `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`;
}

/** "one step above", "2 steps below", "an octave below". */
export function d22Distance(from: number, to: number): string {
  const steps = Math.abs(to - from);
  const side = to > from ? 'above' : 'below';
  if (steps === 7) return `an octave ${side}`;
  return `${steps === 1 ? 'one step' : `${steps} steps`} ${side}`;
}

/** The part of the staff a placing card names: "below the staff", "the higher E on the staff". */
export function d22Where(prompt: Pick<D22Prompt, 'letter' | 'region' | 'which'>): string {
  if (prompt.which) return `the ${prompt.which} ${prompt.letter} on the staff`;
  return `${prompt.letter} ${prompt.region} the staff`;
}

/** The question: "Name this note", "Tap G below the staff". */
export function d22Task(prompt: D22Prompt): string {
  return prompt.direction === 'read' ? 'Name this note' : `Tap ${d22Where(prompt)}`;
}

/**
 * The worked example (research/02 rule 8): the answer, its place, and what
 * to tap to go on.
 */
export function d22WorkedExample(prompt: D22Prompt): string {
  const at = d22At(prompt.position);
  return prompt.direction === 'read'
    ? `This is ${prompt.letter}, ${at}. Tap ${prompt.letter} to continue.`
    : `${prompt.letter} here is ${at}, marked. Tap it to continue.`;
}

/**
 * One line of feedback: the note's place and where it is played, so sight,
 * name and sound come together (research/02 rule 10). A miss names where the
 * answer was instead, and how far from the right place.
 */
export function d22Explain(prompt: D22Prompt, fb: DrillFeedback<D22Answer>): string {
  const fret = d22WhereToPlay(prompt.note, prompt.tuning);
  const play = fret ? ` Play it on ${fret}.` : '';
  const right = `${prompt.letter} is ${d22At(prompt.position)}.${play}`;
  if (fb.result.correct) return right;
  const given = d22AnsweredPlace(prompt, fb.answer);
  if (given === null) return right;
  const away = d22Distance(prompt.position, given);
  if (prompt.direction === 'read') {
    return `${String(fb.answer).toUpperCase()} is ${away}, ${d22At(given)}. ${right}`;
  }
  const letter = staffNote(noteAtStaffPosition(given)).letter;
  const that = letter === prompt.letter ? `${article(letter)} ${letter} too, ${away}` : letter;
  return `You tapped the ${describeStaffPosition(given)}: that's ${that}. ${right}`;
}

// --- Keyboard ---------------------------------------------------------------

/** Hardware keys for reading cards: the letters A–G, either case. */
export function d22KeyToAnswer(key: string, choices: readonly string[]): string | null {
  const letter = key.toUpperCase();
  return /^[A-G]$/.test(letter) && choices.includes(letter) ? letter : null;
}
