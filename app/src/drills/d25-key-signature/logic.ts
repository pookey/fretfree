import { Note } from 'tonal';
import type { Item } from '../../engine/model';
import {
  READING_POSITIONS,
  applyKeySignature,
  fretInPosition,
  keyAlterationOf,
  majorKey,
  noteAtStaffPosition,
  spellMidi,
  type Position,
  type ReadingPosition,
  type Tuning,
} from '../../theory';
import { keyWith } from '../d40-key-signature/meta';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D25_SCOPE, d25CanTest, d25Concept as concept, d25Parse as parse } from './meta';

export { D25_ID, D25_SCOPE, d25CanTest, d25ConceptOf } from './meta';

/**
 * D25 "Read the key signature, then apply it to a note" (design §6 D25, R3):
 * a staff with a key signature and one note written with no accidental. The
 * learner says what the note is: F, F♯ or F♭.
 *
 * - The card is a letter and a signature (`key-apply:F@2#`); the staff shows
 *   the signature, never the key's name, because reading it is the task.
 * - The octave changes from rep to rep (research/02 rule 12): a signature
 *   holds in every octave. Scope widens where the note may sit (rule 5).
 * - The buttons are always the letter's three spellings, flat to sharp, so
 *   from the buttons alone each is possible: a natural is right as often as
 *   the boundary cards (`r3.ts`) make it.
 * - Feedback plays the note and shows it on the neck in a reading position,
 *   with the chosen spelling beside it when wrong: a sharp in the signature
 *   moves the finger a fret (research/03 R3, "how they change fingerings").
 *
 * The words are in `text.ts`, which only the lazy view loads.
 */

export interface D25Prompt {
  itemId: string;
  /** The letter on the staff. */
  letter: string;
  /** The signature: sharps up, flats down. */
  alteration: number;
  /** The major key with that signature, as a VexFlow key spec (`D`, `Bb`). */
  tonic: string;
  /** The sounding pitch the staff shows, the signature applied: `F#3`. */
  note: string;
  /** The answer: the note's spelling with no octave (`F#`). */
  answer: string;
  /** The buttons, flat to sharp: `Fb`, `F`, `F#`. */
  choices: string[];
  /** The reading position whose fret the neck shows; null if no position reaches it. */
  position: ReadingPosition | null;
}

/** A spelling: `F#`, `F`, `Fb`. */
export type D25Answer = string;

/** The staff positions each scope level allows, inclusive (`theory/staff.ts` positions). */
const RANGES: readonly (readonly [number, number])[] = [
  [0, 8],
  [-3, 11],
  [-7, 15],
];

function level(scopeLevel: number): number {
  return Math.max(D25_SCOPE.minLevel, Math.min(D25_SCOPE.maxLevel, Math.round(scopeLevel)));
}

/** Staff positions where a letter can sit at a scope level, lowest first. */
export function d25Positions(letter: string, scopeLevel: number): number[] {
  const [from, to] = RANGES[level(scopeLevel)] as readonly [number, number];
  const out: number[] = [];
  for (let p = from; p <= to; p++) if (noteAtStaffPosition(p).startsWith(letter)) out.push(p);
  return out;
}

/** A uniform pick of `0 … n-1`, safe against an rng that returns 1. */
function pick(n: number, rng: () => number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

function accidentalText(alt: number): string {
  return alt >= 0 ? '#'.repeat(alt) : 'b'.repeat(-alt);
}

function altOf(spelling: string): number {
  return Note.get(spelling).alt;
}

/** The neck's top fret as sessions draw it (`shell/size-class.ts`): no note sits above it. */
const TOP_FRET = 15;

/**
 * The reading position that plays a pitch on the drawn neck, lowest first:
 * open, then 5th, 7th… Null below the low string or above fret 15.
 */
export function positionFor(midi: number, tuning?: Tuning): ReadingPosition | null {
  return (
    READING_POSITIONS.find((p) => {
      const at = fretInPosition(midi, p, { tuning });
      return at !== null && at.fret <= TOP_FRET;
    }) ?? null
  );
}

export function d25MakePrompt(item: Item, ctx: DrillContext): D25Prompt {
  const ref = parse(item);
  if (!ref || !d25CanTest(item)) throw new Error(`D25 cannot test item ${item.id}`);
  const { letter, alteration } = ref;
  const tonic = keyWith(alteration);
  // Only notes the neck can play: E♭ under the low E string is no guitar note.
  const all = d25Positions(letter, ctx.scopeLevel).map((at) =>
    applyKeySignature(noteAtStaffPosition(at), majorKey(tonic)),
  );
  const playable = all.filter((n) => positionFor(Note.midi(n) as number, ctx.tuning) !== null);
  const places = playable.length > 0 ? playable : all;
  const note = places[pick(places.length, ctx.rng)] as string;
  return {
    itemId: item.id,
    letter,
    alteration,
    tonic,
    note,
    answer: note.replace(/-?\d+$/, ''),
    choices: [`${letter}b`, letter, `${letter}#`],
    position: positionFor(Note.midi(note) as number, ctx.tuning),
  };
}

/**
 * The signature nearest the card's that makes a spelling right: F♮ under
 * 1 sharp is right with none, G♯ under 2 sharps with 3. By the cards in
 * `r3.ts` that signature always has a card for the letter.
 */
export function nearestSignature(letter: string, alt: number, from: number): number | null {
  for (let d = 1; d <= 14; d++) {
    for (const s of [from - d, from + d]) {
      if (s < -7 || s > 7) continue;
      if (keyAlterationOf(letter, majorKey(keyWith(s))) === alt) return s;
    }
  }
  return null;
}

export function d25Check(prompt: D25Prompt, answer: D25Answer): DrillCheck {
  const key = concept(prompt.letter, prompt.alteration);
  const expected = pretty(prompt.answer);
  if (answer === prompt.answer) return { correct: true, expected, concept: key };
  const valid = prompt.choices.includes(answer);
  const other = valid ? nearestSignature(prompt.letter, altOf(answer), prompt.alteration) : null;
  return {
    correct: false,
    expected,
    concept: key,
    ...(other === null ? {} : { confusedWith: concept(prompt.letter, other) }),
  };
}

/** Stored as `answerGiven`. */
export function d25DescribeAnswer(answer: D25Answer): string {
  return answer;
}

/** The pitch a spelling names in the prompt's octave: `F` for `F#3` → `F3`. */
export function givenNote(prompt: D25Prompt, answer: D25Answer): string {
  const oct = /-?\d+$/.exec(prompt.note)?.[0] ?? '';
  return `${prompt.letter}${accidentalText(altOf(answer))}${oct}`;
}

/** Display form: `F#` → `F♯`, `Fb` → `F♭`. */
export function pretty(spelling: string): string {
  return spelling.replace('#', '♯').replace(/^([A-G])b/, '$1♭');
}

// --- Sound and the neck ------------------------------------------------------

/** Playback names, sharps only, so the synth never meets `Fb3`. */
function synthName(note: string): string {
  return spellMidi(Note.midi(note) as number);
}

/** The note, and the chosen spelling when wrong (rule 10: sound with sight and name). */
export function d25Sounds(prompt: D25Prompt, fb: DrillFeedback<D25Answer>): DrillSounds {
  const expected = [synthName(prompt.note)];
  if (fb.result.correct || !prompt.choices.includes(fb.answer)) return { expected };
  return { expected, given: [synthName(givenNote(prompt, fb.answer))] };
}

/**
 * Where the note is played: its fret in the prompt's reading position, and
 * a given spelling's fret in the same position (or the nearest position that
 * reaches it), so the learner sees the finger move.
 */
export function d25NeckPositions(
  prompt: D25Prompt,
  given: D25Answer | null,
  tuning: Tuning,
): { expected: Position[]; given: Position[] } {
  const at = (note: string): Position[] => {
    const midi = Note.midi(note) as number;
    const first = prompt.position && fretInPosition(midi, prompt.position, { tuning });
    if (first) return [first];
    const other = positionFor(midi, tuning);
    const found = other && fretInPosition(midi, other, { tuning });
    return found ? [found] : [];
  };
  const wrong = given !== null && given !== prompt.answer && prompt.choices.includes(given);
  return { expected: at(prompt.note), given: wrong ? at(givenNote(prompt, given)) : [] };
}

/** In feedback: the note's fret, and the chosen spelling's when wrong. */
export function d25FeedbackPositions(
  prompt: D25Prompt,
  fb: DrillFeedback<D25Answer>,
  tuning: Tuning,
): { expected: Position[]; given: Position[] } {
  return d25NeckPositions(prompt, fb.result.correct ? null : fb.answer, tuning);
}

// --- Keyboard ---------------------------------------------------------------

/** Keys for the buttons by position (a hardware keyboard row), plus `b` `n` `#` by sign. */
const BY_INDEX = ['1', '2', '3'];
const BY_SIGN = ['b', 'n', '#'];

export function d25KeysFor(index: number): string | undefined {
  const keys = [BY_INDEX[index], BY_SIGN[index]].filter(Boolean);
  return keys.length > 0 ? keys.join(' ') : undefined;
}

/** Hardware-keyboard answers (design §7): 1–3 by position, or b / n / # by sign. */
export function d25KeyToAnswer(key: string, choices: readonly string[]): string | null {
  const i = BY_INDEX.includes(key) ? BY_INDEX.indexOf(key) : BY_SIGN.indexOf(key.toLowerCase());
  return i < 0 ? null : (choices[i] ?? null);
}
