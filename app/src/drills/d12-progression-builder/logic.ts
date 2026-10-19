import { ENGINE_CONFIG } from '../../engine/config';
import { parseProgressionItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  chordFromNumeral,
  diatonicChords,
  getProgression,
  keyLabel,
  keyName,
  matchProgression,
  parseChordSymbol,
  parseKey,
  parseRoman,
  progressionChords,
  romanOf,
  rotationOffset,
  relatedRotations,
  sameChord,
  type ChordQuality,
  type MusicalKey,
  type Progression,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

/**
 * D12 "Progression builder" (design §6 D12, research/03 C9): drag chords
 * into a progression's slots. A build card names the progression and a key
 * (I–V–vi–IV in G → G D Em C); a transpose card shows the chart in one key
 * and asks for it in another, naming the progression only as a guide. Keys
 * stay in the progression's own mode, so its numerals keep their meaning.
 *
 * Building a rotation of the progression (vi–IV–I–V for I–V–vi–IV) is the
 * C9 misconception: it is graded wrong, explained as "the same chords from
 * another start", and logged as that confusion when the rotation is in the
 * catalogue, so the pair gets interleaved (rule 6).
 */

export const D12_ID = 'progression-builder';

export type D12Task = 'build' | 'transpose';

export interface D12Tile {
  /** Chord symbol spelled in the key, e.g. `F#m`, `Bb7`. */
  symbol: string;
  /** Its numeral in the key: `vi`, `bVII`, `IV7`. */
  roman: string;
}

export interface D12Chart {
  /** Key label: `C`, `Am`. */
  key: string;
  /** Spoken key: `C major`. */
  keyName: string;
  /** One chord per slot. */
  chords: string[];
}

export interface D12Prompt {
  itemId: string;
  task: D12Task;
  progressionId: string;
  /** For display: `I–V–vi–IV`, `i–♭VII–♭VI–♭VII`, `12-bar blues`. */
  name: string;
  description: string;
  /** The key to fill the slots in. */
  key: string;
  keyName: string;
  /** Numerals, one per slot. */
  numerals: string[];
  /** The answer, one chord symbol per slot. */
  expected: string[];
  /** Transpose: the chart to move. */
  from: D12Chart | null;
  /** Chord tiles to drag, in letter order. */
  palette: D12Tile[];
  /** Catalogue names of the progression's rotations (I–V–vi–IV ↔ vi–IV–I–V). */
  rotations: string[];
}

/** One chord symbol per slot, in order. */
export interface D12Answer {
  chords: string[];
}

/**
 * Scope levels (research/02 rule 5): more keys and more distractor tiles.
 * Level 0 is the open-chord keys and two distractors; level 2 is every key
 * and the whole palette.
 */
export const D12_SCOPE = { minLevel: 0, maxLevel: 2 };

const cfg = () => ENGINE_CONFIG.progressionBuilder;

function clampScope(level: number): number {
  return Math.max(D12_SCOPE.minLevel, Math.min(D12_SCOPE.maxLevel, Math.floor(level)));
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))] as T;
}

/** Keys for a mode at a scope level: each level adds to the one before. */
export function d12Keys(mode: MusicalKey['mode'], scopeLevel: number): string[] {
  return cfg()
    .keysByScope[mode].slice(0, clampScope(scopeLevel) + 1)
    .flat();
}

/** Every chord is a dominant 7 (the blues). */
function isDominantProgression(p: Pick<Progression, 'numerals'>): boolean {
  return p.numerals.every((n) => parseRoman(n)?.quality === 'dominant7');
}

/**
 * Distractor numerals, most useful first: the key's other common chords,
 * so the progression's neighbours (and its rotations' chords) are always
 * there. A blues offers other dominant 7 chords, not triads.
 */
function distractorPool(p: Progression): string[] {
  if (isDominantProgression(p)) return ['I7', 'IV7', 'V7', 'II7', 'VI7', 'bVII7', 'III7'];
  return p.mode === 'major'
    ? ['I', 'IV', 'V', 'vi', 'ii', 'iii', 'vii°']
    : ['i', 'bVII', 'bVI', 'iv', 'v', 'bIII', 'ii°'];
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const ACCIDENTAL_RANK: Record<string, number> = { bb: 0, b: 1, '': 2, '#': 3, '##': 4 };

function rootOf(symbol: string): string {
  return parseChordSymbol(symbol).root;
}

/** Letter order A–G, flats before naturals before sharps, so tiles never sit in numeral order. */
function letterRank(symbol: string): number {
  const root = rootOf(symbol);
  return LETTERS.indexOf(root.charAt(0)) * 10 + (ACCIDENTAL_RANK[root.slice(1)] ?? 2);
}

/** The progression's chords, then distractors, as tiles in letter order. */
export function d12Palette(p: Progression, key: MusicalKey, scopeLevel: number): D12Tile[] {
  const own = [...new Set(p.numerals)];
  const extra = distractorPool(p).filter((n) => !own.includes(n));
  const count = cfg().distractorsByScope[clampScope(scopeLevel)] as number;
  const numerals = [...own, ...extra.slice(0, count)];
  return numerals
    .map((n) => {
      const c = chordFromNumeral(key, n);
      return { symbol: c.symbol, roman: c.roman };
    })
    .sort((a, b) => letterRank(a.symbol) - letterRank(b.symbol));
}

function parse(item: Item): { progression: Progression; task: D12Task } | null {
  const ref = parseProgressionItemId(item.id);
  if (!ref) return null;
  return { progression: getProgression(ref.progression), task: ref.task };
}

export function d12CanTest(item: Item): boolean {
  return parse(item) !== null;
}

function chart(key: MusicalKey, p: Progression): D12Chart {
  return {
    key: keyLabel(key),
    keyName: prettyKeyName(key),
    chords: progressionChords(key, p).map((c) => c.symbol),
  };
}

function prettyKeyName(key: MusicalKey): string {
  return pretty(keyName(key));
}

export function d12MakePrompt(item: Item, ctx: DrillContext): D12Prompt {
  const parsed = parse(item);
  if (!parsed) throw new Error(`D12 cannot test item ${item.id}`);
  const { progression: p, task } = parsed;
  const keys = d12Keys(p.mode, ctx.scopeLevel);
  // A transposition picks its source first, then a different key to move to.
  const fromLabel = task === 'transpose' ? pick(keys, ctx.rng) : null;
  const keyLabelText = pick(
    keys.filter((k) => k !== fromLabel),
    ctx.rng,
  );
  const key = parseKey(keyLabelText);
  return {
    itemId: item.id,
    task,
    progressionId: p.id,
    name: pretty(p.name),
    description: p.description,
    key: keyLabelText,
    keyName: prettyKeyName(key),
    numerals: [...p.numerals],
    expected: progressionChords(key, p).map((c) => c.symbol),
    from: fromLabel === null ? null : chart(parseKey(fromLabel), p),
    palette: d12Palette(p, key, ctx.scopeLevel),
    rotations: relatedRotations(p).map((r) => pretty(r.name)),
  };
}

// --- Checking ---------------------------------------------------------------

/** Per-slot verdicts: each chord against the expected one. */
export function d12Verdicts(prompt: D12Prompt, answer: D12Answer): boolean[] {
  return prompt.expected.map((e, i) => {
    const given = answer.chords[i];
    return given !== undefined && sameChord(e, given);
  });
}

/** The answer's numerals in the prompt's key, or null if a slot is empty. */
function answerNumerals(prompt: D12Prompt, answer: D12Answer): string[] | null {
  if (answer.chords.length !== prompt.expected.length) return null;
  const key = parseKey(prompt.key);
  return answer.chords.map((c) => romanOf(key, c));
}

/** The concept a progression is keyed by in the confusion matrix (engine/confusions). */
export function progressionConcept(progressionId: string): string {
  return `prog:${progressionId}`;
}

/**
 * How a wrong chart relates to the progression: a rotation of it (the C9
 * misconception), another catalogue progression, or neither.
 */
export interface D12Mix {
  /** Left rotation from the expected numerals to the answer's; null if not a rotation. */
  rotation: number | null;
  /** A different catalogue progression the answer is exactly. */
  other: Progression | null;
}

export function d12Mix(prompt: D12Prompt, answer: D12Answer): D12Mix {
  const numerals = answerNumerals(prompt, answer);
  if (numerals === null) return { rotation: null, other: null };
  const offset = rotationOffset(prompt.numerals, numerals);
  const exact = matchProgression(numerals).find(
    (m) => m.rotation === 0 && m.progression.id !== prompt.progressionId,
  );
  return { rotation: offset === 0 ? null : offset, other: exact?.progression ?? null };
}

/** The expected answer as the feedback bar shows it. */
export function d12Expected(prompt: D12Prompt): string {
  return prompt.expected.map(pretty).join(' ');
}

export function d12Check(prompt: D12Prompt, answer: D12Answer): DrillCheck {
  // `expected` is display text, so the confusion matrix gets the concept.
  const base = { expected: d12Expected(prompt), concept: progressionConcept(prompt.progressionId) };
  const verdicts = d12Verdicts(prompt, answer);
  const correct = answer.chords.length === verdicts.length && verdicts.every(Boolean);
  if (correct) return { correct, ...base };
  const { other } = d12Mix(prompt, answer);
  return other
    ? { correct, ...base, confusedWith: progressionConcept(other.id) }
    : { correct, ...base };
}

/** Grade time per slot, so a 12-bar blues meets the usual speed targets (§3.2). */
export function d12GradedResponseMs(prompt: D12Prompt, _answer: D12Answer, elapsedMs: number) {
  return elapsedMs / Math.max(1, prompt.expected.length);
}

// --- Words -----------------------------------------------------------------

/**
 * Display form: `F#m` → `F♯m`, `Bb7` → `B♭7`, `Bb major` → `B♭ major`, and
 * numerals anywhere in a name: `i–bVII–bVI–bVII` → `i–♭VII–♭VI–♭VII`.
 */
export function pretty(text: string): string {
  return text
    .replace(/^([A-G])(#{1,2}|b{1,2})/, (_, l: string, a: string) => l + accidental(a))
    .replace(
      /(^|[–\s])(#{1,2}|b{1,2})(?=[iIvV])/g,
      (_, pre: string, a: string) => pre + accidental(a),
    );
}

function accidental(a: string): string {
  return a.replace(/#/g, '♯').replace(/b/g, '♭');
}

const QUALITY_WORDS: Record<ChordQuality, string> = {
  major: '',
  minor: ' minor',
  diminished: ' diminished',
  augmented: ' augmented',
  dominant7: ' 7',
  major7: ' major 7',
  minor7: ' minor 7',
  'half-diminished7': ' minor 7 flat 5',
  diminished7: ' diminished 7',
};

const ACCIDENTAL_WORDS: Record<string, string> = {
  '': '',
  '#': ' sharp',
  '##': ' double sharp',
  b: ' flat',
  bb: ' double flat',
};

/** Accessible name: `F#m` → `F sharp minor`, `Bb7` → `B flat 7`. */
export function spokenChord(symbol: string): string {
  const c = parseChordSymbol(symbol);
  return c.root.charAt(0) + (ACCIDENTAL_WORDS[c.root.slice(1)] ?? '') + QUALITY_WORDS[c.quality];
}

/** Slot names: bars for the blues, chords otherwise. */
export function d12SlotNoun(prompt: Pick<D12Prompt, 'expected'>): 'bar' | 'chord' {
  return prompt.expected.length > 4 ? 'bar' : 'chord';
}

function numeralsName(numerals: readonly string[]): string {
  return numerals.map(pretty).join('–');
}

/** At most this many per-slot lines, then a count of the rest. */
const MAX_SLOT_LINES = 3;

/**
 * The explanation shown when an answer is wrong. A rotation says it is the
 * same chords from another start (the C9 misconception); another catalogue
 * progression is named; otherwise each wrong slot gets its numeral.
 */
export function d12Explain(prompt: D12Prompt, answer: D12Answer): string[] {
  const verdicts = d12Verdicts(prompt, answer);
  if (verdicts.every(Boolean) && answer.chords.length === verdicts.length) return [];
  const { rotation, other } = d12Mix(prompt, answer);
  const numerals = answerNumerals(prompt, answer);
  const first = pretty(prompt.expected[0] as string);
  const firstNumeral = pretty(prompt.numerals[0] as string);
  if (rotation !== null && numerals !== null) {
    const built = other ? pretty(other.name) : numeralsName(numerals);
    const start = pretty(numerals[0] as string);
    return [
      `You built ${built}: the same chords as ${prompt.name}, started from the ${start}.`,
      `${prompt.name} starts on its ${firstNumeral}, ${first}. Same chords, different starting point, different feel.`,
    ];
  }
  const lines: string[] = [];
  if (other) lines.push(`That's ${pretty(other.name)}, not ${prompt.name}.`);
  const noun = d12SlotNoun(prompt);
  const wrong = verdicts.flatMap((ok, i) => (ok ? [] : [i]));
  for (const i of wrong.slice(0, MAX_SLOT_LINES)) {
    const expected = pretty(prompt.expected[i] as string);
    const given = answer.chords[i];
    const numeral = pretty(prompt.numerals[i] as string);
    const where = `${capitalise(noun)} ${i + 1} is the ${numeral}`;
    const why =
      prompt.from === null
        ? `${where} in ${prompt.keyName}: ${expected}`
        : `${where}: ${pretty(prompt.from.chords[i] as string)} in ${prompt.from.keyName}, ${expected} in ${prompt.keyName}`;
    lines.push(given === undefined ? `${why}.` : `${why}, not ${pretty(given)}.`);
  }
  if (wrong.length > MAX_SLOT_LINES) {
    lines.push(`…and ${wrong.length - MAX_SLOT_LINES} more.`);
  }
  return lines;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The subject line: the progression, or the destination of a transposition. */
export function d12Subject(prompt: D12Prompt, showName: boolean): string {
  if (prompt.task === 'build' || showName) return prompt.name;
  return 'Transpose the chart';
}

/** The task line under the subject. */
export function d12Task(prompt: D12Prompt): string {
  return prompt.task === 'build'
    ? `Build it in ${prompt.keyName}`
    : `Move it from ${prompt.from?.keyName ?? ''} to ${prompt.keyName}`;
}

/** The worked-example line for the first, guided rep of a new item (rule 8). */
export function d12WorkedExample(prompt: D12Prompt): string {
  const chords = prompt.expected.map(pretty).join(' ');
  if (prompt.task === 'build') {
    return `In ${prompt.keyName}, ${prompt.name} is ${chords}.`;
  }
  const from = prompt.from as D12Chart;
  return `In ${from.keyName} this is ${prompt.name}. Each chord keeps its numeral, so in ${prompt.keyName} it is ${chords}.`;
}

/**
 * The key's chords with their numerals, for the context panel. A blues is
 * built from dominant 7s, not the key's triads, so it lists its own chords.
 */
export function d12KeyChords(prompt: Pick<D12Prompt, 'key' | 'numerals' | 'expected'>): D12Tile[] {
  if (isDominantProgression(prompt)) {
    const own = new Map<string, D12Tile>();
    prompt.numerals.forEach((roman, i) => {
      if (!own.has(roman)) own.set(roman, { symbol: prompt.expected[i] as string, roman });
    });
    return [...own.values()];
  }
  return diatonicChords(parseKey(prompt.key)).map((c) => ({ symbol: c.symbol, roman: c.roman }));
}

// --- Guides ------------------------------------------------------------------

/** What each guide level shows (rule 9: faded within and across sessions). */
export interface D12Guides {
  /** Each slot shows its numeral. At level 0 the learner recalls the form. */
  slotNumerals: boolean;
  /** Each tile names its numeral in the key. */
  tileNumerals: boolean;
  /** A transposition names its progression and labels the source chart's numerals. */
  sourceNumerals: boolean;
}

export function d12Guides(level: GuideLevel): D12Guides {
  return { slotNumerals: level >= 1, tileNumerals: level >= 3, sourceNumerals: level >= 2 };
}

// --- Sounds and logging --------------------------------------------------------

/** Roots in a guitar-friendly octave, one per slot. */
function roots(chords: readonly string[]): string[] {
  return chords.map((c) => `${rootOf(c)}3`);
}

/** The roots of the progression, then the learner's when wrong and short enough to compare. */
export function d12Sounds(prompt: D12Prompt, fb: DrillFeedback<D12Answer>): DrillSounds {
  const expected = roots(prompt.expected);
  if (fb.result.correct || prompt.expected.length > 4) return { expected };
  if (fb.answer.chords.length !== prompt.expected.length) return { expected };
  return { expected, given: roots(fb.answer.chords) };
}

export function d12ConceptOf(item: Item): string | null {
  const ref = parseProgressionItemId(item.id);
  return ref ? progressionConcept(ref.progression) : null;
}

/** Stored as `answerGiven`. */
export function d12DescribeAnswer(answer: D12Answer): string {
  return answer.chords.join(' ');
}

// --- Editing the chart ---------------------------------------------------------

/** A chart being filled: one chord or `null` per slot. */
export type D12Slots = readonly (string | null)[];

export function emptySlots(prompt: Pick<D12Prompt, 'expected'>): (string | null)[] {
  return prompt.expected.map(() => null);
}

/** Put a chord in a slot, replacing what was there. */
export function placeChord(slots: D12Slots, index: number, chord: string): (string | null)[] {
  return slots.map((c, i) => (i === index ? chord : c));
}

/** Move a slot's chord to another slot, swapping with what is there. */
export function moveChord(slots: D12Slots, from: number, to: number): (string | null)[] {
  if (from === to) return [...slots];
  return slots.map((c, i) => (i === to ? slots[from] : i === from ? slots[to] : c) ?? null);
}

export function clearSlot(slots: D12Slots, index: number): (string | null)[] {
  return slots.map((c, i) => (i === index ? null : c));
}

/** The first empty slot at or after `from`, wrapping round; `from` itself when all are full. */
export function nextEmpty(slots: D12Slots, from: number): number {
  for (let k = 0; k < slots.length; k++) {
    const i = (from + k) % slots.length;
    if (slots[i] === null) return i;
  }
  return Math.min(from, slots.length - 1);
}

export function isFull(slots: D12Slots): slots is readonly string[] {
  return slots.every((c) => c !== null);
}

/**
 * Hardware keyboard (design §7), outside a keyboard drag: 1–9 put that tile
 * in the selected slot, Backspace undoes, Enter checks.
 */
export type D12KeyAction = { type: 'tile'; index: number } | { type: 'undo' } | { type: 'check' };

export function d12KeyAction(key: string, tiles: number): D12KeyAction | null {
  if (/^[1-9]$/.test(key) && Number(key) <= tiles) return { type: 'tile', index: Number(key) - 1 };
  if (key === 'Backspace') return { type: 'undo' };
  if (key === 'Enter') return { type: 'check' };
  return null;
}

/** Keyboard drag (WAI-ARIA drag pattern): a target slot moved by the arrow keys. */
export function d12MoveTarget(key: string, target: number, slots: number, columns: number) {
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, target - 1);
    case 'ArrowRight':
      return Math.min(slots - 1, target + 1);
    case 'ArrowUp':
      return target - columns >= 0 ? target - columns : target;
    case 'ArrowDown':
      return target + columns < slots ? target + columns : target;
    case 'Home':
      return 0;
    case 'End':
      return slots - 1;
    default:
      return null;
  }
}

/** Slots per row: bars of four for the blues, otherwise the whole progression. */
export function d12Columns(slots: number): number {
  return Math.min(4, slots);
}
