import { ENGINE_CONFIG } from '../../engine/config';
import { staffIntervalConcept } from '../../engine/items/staff-interval';
import type { StaffDirection } from '../../engine/items/staff';
import type { Item } from '../../engine/model';
import {
  READING_POSITIONS,
  describeStaffPosition,
  fretForNote,
  isLine,
  noteAtStaffPosition,
  positionsOfMidi,
  staffNote,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { STAFF_INTERVAL_SCOPE, staffIntervalParse } from './meta';

export {
  STAFF_INTERVAL_ID,
  STAFF_INTERVAL_SCOPE,
  staffIntervalCanTest,
  staffIntervalConceptOf,
  staffIntervalParse,
} from './meta';

/**
 * The staff-interval drill, "Name the step or skip" (design §12, R5): two
 * neighbouring notes on the guitar's treble 8vb staff, read as one shape.
 *
 * - **Read** (`staff-interval:+3@treble8vb`): two notes side by side; the
 *   learner names the interval, 2nd (a step) to octave, by button or by the
 *   number keys 2–8. From scope level 1 the pair sits inside a short phrase
 *   and is marked, so the learner picks the shape out of music, reading
 *   ahead rather than note by note.
 * - **Place** (`staff-interval:+3@treble8vb:place`): one note and "a 3rd
 *   above"; the learner taps the line or space.
 *
 * Intervals are counted in lines and spaces, both notes included, so a 3rd
 * is line to line and a 2nd line to space whatever the accidentals. Each
 * card starts on a fresh note (research/02 rule 12). The learner names no
 * notes: the shape is the point. Feedback adds the letters, the sound and
 * the pair on the neck (rule 10).
 *
 * Speed: the standard personal target (research/02 rule 3: baseline + 2 s)
 * grades every card, as in every drill. R5's "under 1.5 s" waits for a
 * per-drill speed-target hook in the runner; until then the logged time is
 * the real one, so speed statistics and the Easy band stay comparable.
 */

/** The answer labels, 2nd to octave, as the buttons show them. */
export const SI_LABELS: readonly string[] = ['2nd', '3rd', '4th', '5th', '6th', '7th', 'Octave'];

/** The staff positions a card's notes may use at each scope level: the staff and a space either side, then ±3 ledger lines. */
export function siSpan(scopeLevel: number): readonly [number, number] {
  return Math.round(scopeLevel) >= STAFF_INTERVAL_SCOPE.maxLevel ? [-7, 15] : [-1, 9];
}

export interface SIPrompt {
  itemId: string;
  direction: StaffDirection;
  /** The interval's size, 2 (a 2nd) to 8 (an octave). */
  size: number;
  up: boolean;
  /** Staff positions of the pair: 0 is the bottom line, odd numbers spaces. */
  from: number;
  to: number;
  /** Sounding pitches of the pair: `G3`. */
  fromNote: string;
  toNote: string;
  /** Every note on the staff before the answer, as positions, the pair among them. */
  phrase: number[];
  /** Where the pair starts in `phrase`. */
  pairAt: number;
  /** Reading: the answer labels. */
  choices: readonly string[];
  /** Placing: the positions that take a tap, low to high. */
  range: readonly [number, number];
  tuning: Tuning;
}

/** An interval label (reading) or a staff position (placing). */
export type SIAnswer = string | number;

export function siLabel(size: number): string {
  const label = SI_LABELS[size - 2];
  if (!label) throw new RangeError(`No staff interval of size ${size}`);
  return label;
}

/** The size an answer label names, or null. */
export function siSizeOf(label: string): number | null {
  const i = SI_LABELS.indexOf(label);
  return i < 0 ? null : i + 2;
}

const pick = <T>(xs: readonly T[], rng: () => number): T =>
  xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))] as T;

function inSpan(p: number, [lo, hi]: readonly [number, number]): boolean {
  return p >= lo && p <= hi;
}

/**
 * A phrase of `length` notes with the pair at `pairAt`, the others stepping
 * or leaping up to `maxLeap` places from their neighbour, never repeating it.
 */
export function siPhrase(
  from: number,
  to: number,
  span: readonly [number, number],
  rng: () => number,
  length: number = ENGINE_CONFIG.staffIntervals.phraseLength,
  maxLeap: number = ENGINE_CONFIG.staffIntervals.phraseMaxLeap,
): { phrase: number[]; pairAt: number } {
  const pairAt = Math.floor(rng() * (length - 1));
  const phrase: number[] = [];
  phrase[pairAt] = from;
  phrase[pairAt + 1] = to;
  const neighbour = (of: number) => {
    const moves: number[] = [];
    for (let d = -maxLeap; d <= maxLeap; d++)
      if (d !== 0 && inSpan(of + d, span)) moves.push(of + d);
    return pick(moves, rng);
  };
  for (let i = pairAt - 1; i >= 0; i--) phrase[i] = neighbour(phrase[i + 1] as number);
  for (let i = pairAt + 2; i < length; i++) phrase[i] = neighbour(phrase[i - 1] as number);
  return { phrase, pairAt };
}

export function siMakePrompt(item: Item, ctx: DrillContext): SIPrompt {
  const card = staffIntervalParse(item);
  if (!card) throw new Error(`The staff-interval drill cannot test item ${item.id}`);
  const size = Math.abs(card.steps);
  const up = card.steps > 0;
  const delta = (up ? 1 : -1) * (size - 1);
  const span = siSpan(ctx.scopeLevel);
  const starts: number[] = [];
  for (let p = span[0]; p <= span[1]; p++) if (inSpan(p + delta, span)) starts.push(p);
  const from = pick(starts, ctx.rng);
  const to = from + delta;
  const inPhrase = card.direction === 'read' && Math.round(ctx.scopeLevel) >= 1;
  const { phrase, pairAt } = inPhrase
    ? siPhrase(from, to, span, ctx.rng)
    : { phrase: card.direction === 'read' ? [from, to] : [from], pairAt: 0 };
  return {
    itemId: item.id,
    direction: card.direction,
    size,
    up,
    from,
    to,
    fromNote: noteAtStaffPosition(from),
    toNote: noteAtStaffPosition(to),
    phrase,
    pairAt,
    choices: SI_LABELS,
    range: span,
    tuning: ctx.tuning,
  };
}

/** The size of the interval from `from` to a tapped place, both counted; 1 is the note itself. */
export function siSizeBetween(from: number, to: number): number {
  return Math.abs(to - from) + 1;
}

/** The place a wrong answer names: the tapped one, or where the named interval would reach. */
export function siAnsweredPlace(prompt: SIPrompt, answer: SIAnswer): number | null {
  if (typeof answer === 'number') return Number.isInteger(answer) ? answer : null;
  const size = siSizeOf(answer);
  return size === null ? null : prompt.from + (prompt.up ? 1 : -1) * (size - 1);
}

/** A place with its preposition: "on the 3rd line", "in the space below the staff". */
export function siAt(position: number): string {
  return `${isLine(position) ? 'on' : 'in'} the ${describeStaffPosition(position)}`;
}

export function siCheck(prompt: SIPrompt, answer: SIAnswer): DrillCheck {
  const concept = staffIntervalConcept(prompt.size);
  const reading = prompt.direction === 'read';
  const letter = staffNote(prompt.toNote).letter;
  const expected = reading ? siLabel(prompt.size) : `${letter}, ${siAt(prompt.to)}`;
  const correct = reading ? answer === expected : answer === prompt.to;
  if (correct) return { correct: true, expected, concept };
  const given = reading
    ? typeof answer === 'string'
      ? siSizeOf(answer)
      : null
    : typeof answer === 'number'
      ? siSizeBetween(prompt.from, answer)
      : null;
  const named = given !== null && given >= 2 && given <= 8 && given !== prompt.size;
  return {
    correct: false,
    expected,
    concept,
    ...(named ? { confusedWith: staffIntervalConcept(given) } : {}),
  };
}

/** Stored as `answerGiven`: the label, or the tapped place as `pos7`. */
export function siDescribeAnswer(answer: SIAnswer): string {
  return typeof answer === 'number' ? `pos${answer}` : answer;
}

/** The lowest note R5 reads, open low E: anything a miss names below it isn't played. */
const LOWEST = -7;

/** The pair in reading order; after a miss, the start note and the place the answer named. */
export function siSounds(prompt: SIPrompt, fb: DrillFeedback<SIAnswer>): DrillSounds {
  const expected = [prompt.fromNote, prompt.toNote];
  const given = fb.result.correct ? null : siAnsweredPlace(prompt, fb.answer);
  return given === null || given === prompt.to || given < LOWEST
    ? { expected }
    : { expected, given: [prompt.fromNote, noteAtStaffPosition(given)] };
}

/**
 * The pair on the neck in one reading position, the first of open, 5th, 7th,
 * 9th and 12th that holds both, so the staff shape meets a fretted one.
 * Null when no position does.
 */
export function siPairOnNeck(a: string, b: string, tuning: Tuning): [Position, Position] | null {
  for (const position of READING_POSITIONS) {
    const pa = fretForNote(a, position, { tuning });
    const pb = fretForNote(b, position, { tuning });
    if (pa && pb) return [pa, pb];
  }
  return null;
}

function lowestCell(note: string, tuning: Tuning): Position[] {
  const cells = positionsOfMidi(staffNote(note).midi, { tuning, fretRange: { from: 0, to: 15 } });
  const low = cells.reduce<Position | null>((a, c) => (a && a.fret <= c.fret ? a : c), null);
  return low ? [low] : [];
}

/** The neck in feedback: the pair in one position, and the note a miss named. */
export function siFeedbackPositions(
  prompt: SIPrompt,
  fb: DrillFeedback<SIAnswer>,
  tuning: Tuning = prompt.tuning,
): { expected: Position[]; given: Position[] } {
  const pair = siPairOnNeck(prompt.fromNote, prompt.toNote, tuning);
  const expected = pair ?? [
    ...lowestCell(prompt.fromNote, tuning),
    ...lowestCell(prompt.toNote, tuning),
  ];
  const given = fb.result.correct ? null : siAnsweredPlace(prompt, fb.answer);
  if (given === null || given === prompt.to || given === prompt.from || given < LOWEST) {
    return { expected, given: [] };
  }
  const note = noteAtStaffPosition(given);
  const there = siPairOnNeck(prompt.fromNote, note, tuning)?.[1];
  return { expected, given: there ? [there] : lowestCell(note, tuning) };
}

// --- Words ------------------------------------------------------------------

/** "a 3rd", "an octave". */
export function siNamed(size: number): string {
  return size === 8 ? 'an octave' : `a ${siLabel(size)}`;
}

/** The reader's names for the smallest two: "a step", "a skip". */
export function siNickname(size: number): string | null {
  return size === 2 ? 'a step' : size === 3 ? 'a skip' : null;
}

/** "line to line", "space to line". */
export function siShape(from: number, to: number): string {
  const kind = (p: number) => (isLine(p) ? 'line' : 'space');
  return `${kind(from)} to ${kind(to)}`;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "1, 2, 3": the count of lines and spaces from one note to the other. */
function counting(size: number): string {
  return Array.from({ length: size }, (_, i) => i + 1).join(', ');
}

/** "a 3rd up, a skip", "an octave down". */
function sizeWithWay(prompt: Pick<SIPrompt, 'size' | 'up'>): string {
  const nick = siNickname(prompt.size);
  return `${siNamed(prompt.size)} ${prompt.up ? 'up' : 'down'}${nick ? `, ${nick}` : ''}`;
}

/** The question: "Name the interval", "Tap the note a 3rd above". */
export function siTask(prompt: SIPrompt): string {
  if (prompt.direction === 'place') {
    return `Tap the note ${siNamed(prompt.size)} ${prompt.up ? 'above' : 'below'}`;
  }
  return prompt.phrase.length > 2
    ? 'Name the interval between the marked notes'
    : 'Name the interval';
}

/** The worked example (research/02 rule 8): how to count it, and what to tap to go on. */
export function siWorkedExample(prompt: SIPrompt): string {
  const shape = siShape(prompt.from, prompt.to);
  if (prompt.direction === 'read') {
    return (
      `${capitalise(shape)}: count both notes, ${counting(prompt.size)}. ` +
      `${capitalise(sizeWithWay(prompt))}. Tap ${siLabel(prompt.size)} to continue.`
    );
  }
  return (
    `${capitalise(siNamed(prompt.size))} ${prompt.up ? 'above' : 'below'}: count ` +
    `${counting(prompt.size)} from this note, ${shape}. Tap the marked place to continue.`
  );
}

/**
 * One line of feedback: the pair's letters, its shape and its name (rule
 * 10). A miss says what the answer would have been instead.
 */
export function siExplain(prompt: SIPrompt, fb: DrillFeedback<SIAnswer>): string {
  const a = staffNote(prompt.fromNote).letter;
  const b = staffNote(prompt.toNote).letter;
  const right = `${a} to ${b}, ${siShape(prompt.from, prompt.to)}: ${sizeWithWay(prompt)}.`;
  if (fb.result.correct) return right;
  if (prompt.direction === 'read') {
    const size = typeof fb.answer === 'string' ? siSizeOf(fb.answer) : null;
    if (size === null) return right;
    const place = siAnsweredPlace(prompt, fb.answer) as number;
    const diff = size - prompt.size;
    const places = Math.abs(diff) === 1 ? 'one place' : `${Math.abs(diff)} places`;
    return (
      `${capitalise(siNamed(size))} would be ${siShape(prompt.from, place)}, ` +
      `${places} ${diff > 0 ? 'further' : 'nearer'}. ${right}`
    );
  }
  if (typeof fb.answer !== 'number') return right;
  if (fb.answer === prompt.from) return `You tapped the note itself. ${right}`;
  const size = siSizeBetween(prompt.from, fb.answer);
  const way = fb.answer > prompt.from ? 'above' : 'below';
  const tapped = size > 8 ? `further than an octave ${way}` : `${siNamed(size)} ${way}`;
  return `You tapped ${tapped}, ${siAt(fb.answer)}. ${right}`;
}

// --- Keyboard ---------------------------------------------------------------

/** Hardware keys for reading cards: 2–8 name the interval, O the octave too. */
export function siKeyToAnswer(key: string, choices: readonly string[]): string | null {
  const size = /^[2-8]$/.test(key) ? Number(key) : key.toLowerCase() === 'o' ? 8 : null;
  if (size === null) return null;
  const label = siLabel(size);
  return choices.includes(label) ? label : null;
}
