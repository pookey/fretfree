import {
  parseKeyFactItemId,
  parseSignatureKeyItemId,
  type GuideLevel,
  type Item,
} from '../../engine/model';
import {
  CIRCLE_OF_FIFTHS,
  chromaOf,
  chromaToPc,
  keySignature,
  majorKey,
  majorScale,
  relativeMinor,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

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
 */

export const D40_ID = 'key-signature';

export type D40Kind = 'key-signature' | 'signature-key' | 'relative-minor' | 'dominant';

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

/**
 * Scope levels (research/02 rule 5, distractors): a run of 2, 3 or 4
 * signature counts or letters, each in two spellings: 4, 6 or 8 buttons
 * (one fewer when the run holds no sharps or flats).
 */
export const D40_SCOPE = { minLevel: 0, maxLevel: 2 };

const RUNS = [2, 3, 4];

/** The keys D40 asks about: C4's fifteen, each with a real signature. */
const KEYS = CIRCLE_OF_FIFTHS.flatMap((e) => [
  e.major,
  ...(e.enharmonic ? [e.enharmonic.major] : []),
]);

const KEY_OF_ALTERATION = new Map(KEYS.map((k) => [alterationOf(k), k]));

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

const MAJORS_BY_LETTER = byLetter(KEYS);
const MINORS_BY_LETTER = byLetter(KEYS.map(relativeMinor));

function alterationOf(tonic: string): number {
  return keySignature(majorKey(tonic)).alteration;
}

function keyWith(alteration: number): string {
  const key = KEY_OF_ALTERATION.get(alteration);
  if (key === undefined) throw new RangeError(`No major key has alteration ${alteration}`);
  return key;
}

/** The V of a major key: its 5th degree (B♭ for E♭). */
export function dominantOf(tonic: string): string {
  return majorScale(tonic)[4] as string;
}

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

function parse(item: Item): { kind: D40Kind; tonic: string } | null {
  const fact = parseKeyFactItemId(item.id);
  if (fact) return KEYS.includes(fact.tonic) ? fact : null;
  const sig = parseSignatureKeyItemId(item.id);
  if (sig) return { kind: 'signature-key', tonic: keyWith(sig.alteration) };
  return null;
}

export function d40CanTest(item: Item): boolean {
  const ref = parse(item);
  // C♯'s V is G♯ major, a key with a double sharp: no card.
  return ref !== null && !(ref.kind === 'dominant' && !KEYS.includes(dominantOf(ref.tonic)));
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

/**
 * The confusion-matrix concept: the key a card is about, for each kind of
 * fact, so `key-signature:Eb` and `signature-key:3b` share `signature:Eb`.
 * A wrong choice is keyed by the key whose fact it is: picking 3♯ for E♭
 * major confuses it with A major.
 */
const CONCEPT: Record<D40Kind, string> = {
  'key-signature': 'signature',
  'signature-key': 'signature',
  'relative-minor': 'relative-minor',
  dominant: 'dominant',
};

function concept(kind: D40Kind, tonic: string): string {
  return `${CONCEPT[kind]}:${tonic}`;
}

/** The key whose fact a choice is, or null for a choice no card answers. */
function keyOfChoice(kind: D40Kind, choice: string): string | null {
  switch (kind) {
    case 'key-signature': {
      const a = parseSignatureCode(choice);
      return a === null ? null : (KEY_OF_ALTERATION.get(a) ?? null);
    }
    case 'signature-key':
      return KEYS.includes(choice) ? choice : null;
    case 'relative-minor':
      return KEYS.find((k) => relativeMinor(k) === choice) ?? null;
    case 'dominant':
      return KEYS.find((k) => dominantOf(k) === choice) ?? null;
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

export function d40ConceptOf(item: Item): string | null {
  const ref = parse(item);
  return ref ? concept(ref.kind, ref.tonic) : null;
}

/** Stored as `answerGiven`. */
export function d40DescribeAnswer(answer: D40Answer): string {
  return answer;
}

// --- Text -------------------------------------------------------------------

/** Display form: `F#` → `F♯`, `Bb` → `B♭`. */
export function pretty(note: string): string {
  return note.replace('#', '♯').replace(/^([A-G])b/, '$1♭');
}

/** Accessible name: `F#` → `F sharp`, `Bb` → `B flat`. */
export function spoken(note: string): string {
  const letter = note.charAt(0);
  const acc = note.slice(1);
  return acc === '#' ? `${letter} sharp` : acc === 'b' ? `${letter} flat` : letter;
}

function plural(n: number, what: string): string {
  return `${n} ${what}${n === 1 ? '' : 's'}`;
}

/** `3 flats`, `1 sharp`, `No sharps or flats`. */
export function signatureName(alteration: number): string {
  if (alteration === 0) return 'No sharps or flats';
  return plural(Math.abs(alteration), alteration > 0 ? 'sharp' : 'flat');
}

/** The altered notes, in signature order: `B♭ E♭ A♭`. */
export function signatureNotes(alteration: number): string[] {
  return keySignature(majorKey(keyWith(alteration))).accidentals.map(pretty);
}

/** `3 flats: B♭ E♭ A♭`. */
function signatureLine(alteration: number): string {
  return alteration === 0
    ? 'no sharps or flats'
    : `${signatureName(alteration)}: ${signatureNotes(alteration).join(' ')}`;
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

/** A choice's accessible name: `3 flats: B flat, E flat, A flat`, `E flat major`, `C minor`. */
export function spokenChoice(kind: D40Kind, choice: string): string {
  switch (kind) {
    case 'key-signature': {
      const a = parseSignatureCode(choice) ?? 0;
      if (a === 0) return 'No sharps or flats';
      const notes = keySignature(majorKey(keyWith(a)))
        .accidentals.map(spoken)
        .join(', ');
      return `${signatureName(a)}: ${notes}`;
    }
    case 'relative-minor':
      return `${spoken(choice)} minor`;
    case 'signature-key':
    case 'dominant':
      return `${spoken(choice)} major`;
  }
}

/** What the card is about, in large type: `E♭ major`, or `3 flats`. */
export function d40Subject(prompt: D40Prompt): string {
  return prompt.kind === 'signature-key'
    ? signatureName(prompt.alteration)
    : `${pretty(prompt.tonic)} major`;
}

/** The question under the subject. */
export function d40Task(prompt: D40Prompt): string {
  switch (prompt.kind) {
    case 'key-signature':
      return 'How many sharps or flats?';
    case 'signature-key':
      return 'Which major key?';
    case 'relative-minor':
      return 'Its relative minor?';
    case 'dominant':
      return 'Which key is its V?';
  }
}

/**
 * The fact and why, in one line: the worked example on a new item's first
 * rep (rule 8), and the answer's name in feedback (rule 10).
 */
export function d40Fact(prompt: D40Prompt): string {
  const key = `${pretty(prompt.tonic)} major`;
  const a = prompt.alteration;
  switch (prompt.kind) {
    case 'key-signature':
      return a === 0
        ? `${key} has no sharps or flats.`
        : `${key} has ${signatureLine(a)}. ${a > 0 ? 'Sharps' : 'Flats'} always come in the order ${order(a)}.`;
    case 'signature-key': {
      if (a === 0) return `No sharps or flats is ${key}.`;
      const notes = signatureNotes(a);
      if (a > 0) {
        return `${signatureLine(a)} is ${key}: a half step above the last sharp, ${notes[notes.length - 1] as string}.`;
      }
      if (a === -1) return `1 flat, B♭, is ${key}.`;
      return `${signatureLine(a)} is ${key}: the second-last flat names the key.`;
    }
    case 'relative-minor': {
      const minor = `${pretty(prompt.answer)} minor`;
      const shared =
        a === 0 ? 'no sharps or flats either' : `its ${signatureName(a).toLowerCase()}`;
      return `${minor} is the relative minor of ${key}: it shares ${shared}, and ${pretty(prompt.answer)} is the 6th of ${key}.`;
    }
    case 'dominant':
      return `${pretty(prompt.answer)} is the V of ${key}: a 5th up, the next key clockwise on the circle.`;
  }
}

/** Why a wrong choice is wrong: what it is the answer to. */
export function d40Explain(prompt: D40Prompt, answer: D40Answer): string | null {
  if (answer === prompt.answer) return null;
  switch (prompt.kind) {
    case 'key-signature': {
      const a = parseSignatureCode(answer);
      if (a === null) return null;
      return a === 0
        ? 'No sharps or flats is C major.'
        : `${signatureName(a)} is ${pretty(keyWith(a))} major.`;
    }
    case 'signature-key':
      return KEYS.includes(answer)
        ? `${pretty(answer)} major has ${signatureLine(alterationOf(answer))}.`
        : null;
    case 'relative-minor': {
      const major = keyOfChoice(prompt.kind, answer);
      return major
        ? `${pretty(answer)} minor is the relative minor of ${pretty(major)} major.`
        : null;
    }
    case 'dominant': {
      if (answer === subdominantOf(prompt.tonic)) {
        return `${pretty(answer)} is the IV of ${pretty(prompt.tonic)} major, a 5th down: the V is the other way round the circle.`;
      }
      const below = keyOfChoice(prompt.kind, answer);
      return below ? `${pretty(answer)} is the V of ${pretty(below)} major.` : null;
    }
  }
}

function order(alteration: number): string {
  return alteration > 0 ? 'F C G D A E B' : 'B E A D G C F';
}

/** What the context panel shows (rule 9: faded within and across sessions). */
export interface D40Guides {
  /** The rule for the kind of card. */
  rule: string | null;
  /** The orders of sharps and flats. */
  orders: boolean;
  /** Level 2+: the keys in circle order, for counting round (signature cards only). */
  circle: boolean;
}

export function d40Guides(kind: D40Kind, guideLevel: GuideLevel): D40Guides {
  if (guideLevel <= 0) return { rule: null, orders: false, circle: false };
  const signatures = kind === 'key-signature' || kind === 'signature-key';
  return {
    rule: RULES[kind],
    orders: signatures || guideLevel >= 2,
    circle: signatures && guideLevel >= 2,
  };
}

const RULES: Record<D40Kind, string> = {
  'key-signature':
    'Each step clockwise round the circle adds a sharp; each step anticlockwise adds a flat.',
  'signature-key':
    'Sharps: the key is a half step above the last sharp. Flats: the second-last flat names the key (1 flat is F).',
  'relative-minor':
    'A relative minor shares its major key’s signature. Its tonic is the major’s 6th, a minor 3rd down.',
  dominant: 'The V is a 5th up: the next key clockwise, with one more sharp or one fewer flat.',
};

/** The sharp keys and the flat keys, in circle order, for the panel. */
export const SHARP_KEY_ORDER = KEYS.filter((k) => alterationOf(k) >= 0)
  .sort((a, b) => alterationOf(a) - alterationOf(b))
  .map(pretty);
export const FLAT_KEY_ORDER = KEYS.filter((k) => alterationOf(k) <= 0)
  .sort((a, b) => alterationOf(b) - alterationOf(a))
  .map(pretty);

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
