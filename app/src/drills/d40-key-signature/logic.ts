import type { Item } from '../../engine/model';
import { chromaOf, chromaToPc, majorScale, relativeMinor } from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import {
  D40_KEYS,
  D40_KEY_OF_ALTERATION as KEY_OF_ALTERATION,
  D40_SCOPE,
  alterationOf,
  d40CanTest,
  d40Concept as concept,
  d40Parse as parse,
  dominantOf,
  keyWith,
  type D40Kind,
} from './meta';

export {
  D40_ID,
  D40_KEYS,
  D40_SCOPE,
  alterationOf,
  d40CanTest,
  d40ConceptOf,
  dominantOf,
  keyWith,
  type D40Kind,
} from './meta';

/**
 * D40 "Key-signature cards" (design §6 D40): I3's facts about a major key as
 * one-tap choice cards.
 *
 * - `key-signature:Eb`: how many sharps or flats, and which (3♭: B♭ E♭ A♭).
 * - `signature-key:3b`: which major key has 3 flats (E♭).
 * - `relative-minor:Eb`: its relative minor (C minor).
 * - `dominant:Eb`: its V (B♭).
 *
 * **The choices carry no clue** (M4-02's review):
 *
 * - Signature cards offer every signature whose count is in a run of
 *   consecutive counts (0–7, wrapping), sharps and flats alike, or those
 *   signatures' keys. The run starts at a random place, so from the buttons
 *   alone each one is equally likely the answer (tested exhaustively), and
 *   3♯ always meets 3♭ (research/02 rule 6).
 * - The relative minor and the V offer a run of letters that contains the
 *   answer's, each letter in two spellings (C and C♯). Knowing only that
 *   the relative minor is a 3rd down, or the V a 5th up, narrows the choice
 *   to a pair: the accidental still has to be known. The V's letters skip the
 *   key's own, so the key itself is never offered, and its IV often is.
 *
 * Buttons are in a fixed order: signatures by count, keys alphabetically.
 *
 * The words (questions, facts, explanations, the panel's rules) are in
 * `text.ts`, which only the lazy view loads.
 */

export interface D40Prompt {
  itemId: string;
  kind: D40Kind;
  /** The major key asked about; for `signature-key`, the key that answers it. */
  tonic: string;
  /** The key's signature: sharps up, flats down. */
  alteration: number;
  /** The answer, as a choice: a signature (`3b`, `0`), a major tonic (`Bb`) or a minor one (`C`). */
  answer: string;
  /** The buttons, in display order. */
  choices: string[];
}

/** A choice: a signature code (`3b`), or a tonic. */
export type D40Answer = string;

const RUNS = [2, 3, 4];

const LETTERS = 'ABCDEFG';
const ACCIDENTAL_ORDER = ['b', '', '#'];

/** Alphabetical, flat before natural before sharp: A♭ A B♭ B C C♯. */
export function byName(a: string, b: string): number {
  return (
    LETTERS.indexOf(a.charAt(0)) - LETTERS.indexOf(b.charAt(0)) ||
    ACCIDENTAL_ORDER.indexOf(a.slice(1)) - ACCIDENTAL_ORDER.indexOf(b.slice(1))
  );
}

/** Spellings by letter, flat to sharp: `C` → C♭ C C♯. */
function byLetter(names: readonly string[]): Map<string, string[]> {
  return new Map([...LETTERS].map((l) => [l, names.filter((n) => n.charAt(0) === l).sort(byName)]));
}

const MAJORS_BY_LETTER = byLetter(D40_KEYS);
const MINORS_BY_LETTER = byLetter(D40_KEYS.map(relativeMinor));

/** The IV of a major key: its 4th degree (A♭ for E♭). */
export function subdominantOf(tonic: string): string {
  return majorScale(tonic)[3] as string;
}

/** A signature as a choice: `0`, `3#`, `3b`. */
export function signatureCode(alteration: number): string {
  if (alteration === 0) return '0';
  return `${Math.abs(alteration)}${alteration > 0 ? '#' : 'b'}`;
}

export function parseSignatureCode(code: string): number | null {
  if (code === '0') return 0;
  const m = /^([1-7])([#b])$/.exec(code);
  if (!m) return null;
  return m[2] === '#' ? Number(m[1]) : -Number(m[1]);
}

/** A uniform pick of `0 … n-1`, safe against an rng that returns 1. */
function pick(n: number, rng: () => number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

/** `size` neighbours round a ring that contain `at`, starting at a random place. */
function run<T>(ring: readonly T[], at: number, size: number, rng: () => number): T[] {
  const start = at - pick(size, rng) + ring.length;
  return Array.from({ length: size }, (_, j) => ring[(start + j) % ring.length] as T);
}

const COUNTS = [0, 1, 2, 3, 4, 5, 6, 7];

/** The signatures of a random run of counts that contains `alteration`'s, sharps and flats both. */
function signatureRun(alteration: number, scopeLevel: number, rng: () => number): number[] {
  const size = d40RunSize(scopeLevel);
  return run(COUNTS, Math.abs(alteration), size, rng).flatMap((c) => (c === 0 ? [0] : [c, -c]));
}

/** How many counts or letters a run spans at a scope level. */
export function d40RunSize(scopeLevel: number): number {
  return RUNS[level(scopeLevel)] as number;
}

function level(scopeLevel: number): number {
  return Math.max(D40_SCOPE.minLevel, Math.min(D40_SCOPE.maxLevel, Math.round(scopeLevel)));
}

/** By count, sharps before flats: 0 1♯ 1♭ 2♯ 2♭. */
function bySignature(a: number, b: number): number {
  return Math.abs(a) - Math.abs(b) || b - a;
}

export function d40Choices(
  kind: D40Kind,
  tonic: string,
  scopeLevel: number,
  rng: () => number,
): string[] {
  switch (kind) {
    case 'key-signature':
      return signatureRun(alterationOf(tonic), scopeLevel, rng)
        .sort(bySignature)
        .map(signatureCode);
    case 'signature-key':
      return signatureRun(alterationOf(tonic), scopeLevel, rng).map(keyWith).sort(byName);
    case 'relative-minor':
      return letterPairs(relativeMinor(tonic), MINORS_BY_LETTER, null, scopeLevel, rng);
    case 'dominant':
      return letterPairs(dominantOf(tonic), MAJORS_BY_LETTER, tonic, scopeLevel, rng);
  }
}

/**
 * A random run of letters that contains the answer's, skipping `skip`'s
 * letter, each letter in two spellings. A letter with three (C♭ C C♯) keeps
 * its natural and the answer's spelling, or a random one of the others.
 */
function letterPairs(
  answer: string,
  spellings: ReadonlyMap<string, readonly string[]>,
  skip: string | null,
  scopeLevel: number,
  rng: () => number,
): string[] {
  const ring = [...LETTERS].filter((l) => l !== skip?.charAt(0));
  const letters = run(ring, ring.indexOf(answer.charAt(0)), d40RunSize(scopeLevel), rng);
  return letters
    .flatMap((l) => {
      const all = spellings.get(l) ?? [];
      if (all.length <= 2) return all;
      const others = all.filter((s) => s !== l);
      return [l, others.includes(answer) ? answer : (others[pick(others.length, rng)] as string)];
    })
    .sort(byName);
}

/** The answer to a kind of card about a key, as a choice. */
function answerOf(kind: D40Kind, tonic: string): string {
  switch (kind) {
    case 'key-signature':
      return signatureCode(alterationOf(tonic));
    case 'signature-key':
      return tonic;
    case 'relative-minor':
      return relativeMinor(tonic);
    case 'dominant':
      return dominantOf(tonic);
  }
}

export function d40MakePrompt(item: Item, ctx: DrillContext): D40Prompt {
  const ref = parse(item);
  if (!ref || !d40CanTest(item)) throw new Error(`D40 cannot test item ${item.id}`);
  return {
    itemId: item.id,
    kind: ref.kind,
    tonic: ref.tonic,
    alteration: alterationOf(ref.tonic),
    answer: answerOf(ref.kind, ref.tonic),
    choices: d40Choices(ref.kind, ref.tonic, ctx.scopeLevel, ctx.rng),
  };
}

/** The key whose fact a choice is, or null for a choice no card answers. */
export function keyOfChoice(kind: D40Kind, choice: string): string | null {
  switch (kind) {
    case 'key-signature': {
      const a = parseSignatureCode(choice);
      return a === null ? null : (KEY_OF_ALTERATION.get(a) ?? null);
    }
    case 'signature-key':
      return D40_KEYS.includes(choice) ? choice : null;
    case 'relative-minor':
      return D40_KEYS.find((k) => relativeMinor(k) === choice) ?? null;
    case 'dominant':
      return D40_KEYS.find((k) => dominantOf(k) === choice) ?? null;
  }
}

export function d40Check(prompt: D40Prompt, answer: D40Answer): DrillCheck {
  const expected = display(prompt.kind, prompt.answer);
  const key = concept(prompt.kind, prompt.tonic);
  if (answer === prompt.answer) return { correct: true, expected, concept: key };
  const other = keyOfChoice(prompt.kind, answer);
  return {
    correct: false,
    expected,
    concept: key,
    ...(other === null ? {} : { confusedWith: concept(prompt.kind, other) }),
  };
}

/** Stored as `answerGiven`. */
export function d40DescribeAnswer(answer: D40Answer): string {
  return answer;
}

// --- Display ----------------------------------------------------------------

/** Display form: `F#` → `F♯`, `Bb` → `B♭`. */
export function pretty(note: string): string {
  return note.replace('#', '♯').replace(/^([A-G])b/, '$1♭');
}

/** A choice as the learner reads it: `3♭`, `E♭`, `Cm`. */
export function display(kind: D40Kind, choice: string): string {
  switch (kind) {
    case 'key-signature': {
      const a = parseSignatureCode(choice) ?? 0;
      return a === 0 ? '0' : `${Math.abs(a)}${a > 0 ? '♯' : '♭'}`;
    }
    case 'relative-minor':
      return `${pretty(choice)}m`;
    case 'signature-key':
    case 'dominant':
      return pretty(choice);
  }
}

// --- Sound ------------------------------------------------------------------

/** A key's tonic triad with octaves for playback, from the C below middle C: A minor → A3 C4 E4. */
export function tonicTriad(tonic: string, mode: 'major' | 'minor'): string[] {
  const root = 48 + chromaOf(tonic);
  return [0, mode === 'major' ? 4 : 3, 7].map((s) => {
    const midi = root + s;
    return `${chromaToPc(midi % 12, 'sharp')}${Math.floor(midi / 12) - 1}`;
  });
}

/** The chord a choice names, so the learner hears it (rule 10). */
function chordOf(kind: D40Kind, choice: string): string[] | null {
  switch (kind) {
    case 'key-signature': {
      const a = parseSignatureCode(choice);
      const key = a === null ? undefined : KEY_OF_ALTERATION.get(a);
      return key ? tonicTriad(key, 'major') : null;
    }
    case 'relative-minor':
      return tonicTriad(choice, 'minor');
    case 'signature-key':
    case 'dominant':
      return tonicTriad(choice, 'major');
  }
}

/**
 * A signature card plays its key's tonic chord. The relative minor and the
 * V play the key's chord, then the answer's, so the move is heard; a wrong
 * answer plays the same with the chosen chord.
 */
export function d40Sounds(prompt: D40Prompt, fb: DrillFeedback<D40Answer>): DrillSounds {
  const home = tonicTriad(prompt.tonic, 'major');
  const paired = prompt.kind === 'relative-minor' || prompt.kind === 'dominant';
  const withHome = (chord: string[]) => (paired ? [...home, ...chord] : chord);
  const expected = withHome(chordOf(prompt.kind, prompt.answer) as string[]);
  if (fb.result.correct) return { expected };
  const given = chordOf(prompt.kind, fb.answer);
  return given ? { expected, given: withHome(given) } : { expected };
}

// --- Keyboard ---------------------------------------------------------------

/** Keys for the buttons by position: 1–8 (a hardware keyboard row). */
const KEYBOARD = ['1', '2', '3', '4', '5', '6', '7', '8'];

export function d40KeyFor(index: number): string | undefined {
  return KEYBOARD[index];
}

/** Hardware-keyboard answers (design §7): the number row picks a button by position. */
export function d40KeyToAnswer(key: string, choices: readonly string[]): string | null {
  const i = KEYBOARD.indexOf(key);
  return i < 0 ? null : (choices[i] ?? null);
}
