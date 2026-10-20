import { ENGINE_CONFIG } from '../../engine/config';
import type { Item } from '../../engine/model';
import {
  chordFromNumeral,
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
  type MusicalKey,
  type Progression,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D12_SCOPE, d12Parse as parse, progressionConcept, type D12Task } from './meta';

export {
  D12_ID,
  D12_SCOPE,
  d12CanTest,
  d12ConceptOf,
  progressionConcept,
  type D12Task,
} from './meta';

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
export function isDominantProgression(p: Pick<Progression, 'numerals'>): boolean {
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
export function answerNumerals(prompt: D12Prompt, answer: D12Answer): string[] | null {
  if (answer.chords.length !== prompt.expected.length) return null;
  const key = parseKey(prompt.key);
  return answer.chords.map((c) => romanOf(key, c));
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

/** Stored as `answerGiven`. */
export function d12DescribeAnswer(answer: D12Answer): string {
  return answer.chords.join(' ');
}
