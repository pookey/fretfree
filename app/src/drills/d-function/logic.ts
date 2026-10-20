import type { Item } from '../../engine/model';
import {
  HARMONIC_FUNCTIONS,
  chordFromNumeral,
  chordSymbol,
  chromaOf,
  diatonicFunction,
  majorKey,
  parseChordSymbol,
  parseKey,
  parseRoman,
  romanOf,
  scaleOf,
  secondaryDominants,
  tritoneSubstitute,
  twoFiveOne,
  type ChordQuality,
  type ChordSpec,
  type MusicalKey,
  type Numeral,
} from '../../theory';
import { SECONDARY_TARGETS } from '../../engine/items/function';
import { d11Voicing } from '../d11-numerals/logic';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import {
  DF_CHOICES,
  DF_SCOPE,
  dfParse as parse,
  dfSource,
  type DfRef,
  type DfSource,
} from './meta';
import { dfDisplay, dfDominantLabel } from './text';

export { DF_CHOICES, DF_ID, DF_SCOPE, dfCanTest, dfConceptOf } from './meta';

/**
 * The function drill (design §6), the pure half: minor-key harmony (I4) and
 * chord function and substitution (I5), all answered by choice.
 *
 * | Card | Cue | Choices |
 * |---|---|---|
 * | `minor-chord:V7@key=Am` | V7 in A minor | chords: E7 Em7 G7 Gm7 … |
 * | `minor-source:V7@key=Am` | E7 in A minor | natural, harmonic minor, borrowed |
 * | `two-five:Am` | ii–V–i in A minor | Bm7♭5 E7 Am, Bm7 E7 Am, … |
 * | `function:vi@major` | Am (vi) in C major | tonic, subdominant, dominant |
 * | `secondary:V7/ii@key=C` | V7/ii in C major | dominant 7ths on the key's notes |
 * | `secondary-of:V7/ii@key=C` | A7 in C major | ii iii IV V vi |
 * | `borrowed:bVII@key=C` | a progression in C major | its chords |
 * | `tritone-sub:G7` | G7 | dominant 7ths |
 *
 * No choice row's shape points at the answer (rule 1: only knowing does):
 *
 * - A minor-key chord's choices come in quality pairs on two roots, the
 *   answer's and the natural ♭VII's (E7 Em7 G7 Gm7), so the harmonic V meets
 *   the natural v (the I4 misconception, rule 6), and the natural 7th meets
 *   the raised one. Level 1 adds the ii's root.
 * - The ii–V–i's choices cross half-diminished and minor ii with dominant
 *   and minor V; level 1 adds the ii–V–I of the relative and parallel major.
 * - A secondary dominant's choices are dominant 7ths on the key's notes,
 *   always including the one on the target itself (A7 for V7/ii, never D7).
 *   The reverse offers the targets, always including the one on the chord's
 *   own root (A7 is not about vi).
 * - A tritone substitute's choices are dominant 7ths at random intervals.
 *
 * Chord rows are shuffled per prompt, since most sets are fixed for a card
 * and a fixed place would be learned instead. Function, source and target
 * rows keep their reading order: the label is the answer.
 *
 * The key a function card is asked in varies per prompt (rule 12), from a
 * few keys at level 0 to most at level 1. Its three choices never vary.
 */

export type DfKind = DfRef['kind'];

export interface DfPrompt {
  itemId: string;
  kind: DfKind;
  /** The key the question is in; null for a tritone substitute. */
  key: MusicalKey | null;
  /** The numeral the cue names (`V7`, `vi`, `bVII`) or the target of `V7/…`; else null. */
  numeral: string | null;
  /** The chord the cue shows (`E7`, `Am`, `A7`, `G7`); else null. */
  chord: string | null;
  /** A borrowed card's progression, in playing order; its chords are the choices. */
  progression: string[] | null;
  /** The right choice: a chord, a source, a function, a target or a ii–V–i. */
  answer: string;
  choices: string[];
  level: number;
}

/** A choice, as written in `choices`. */
export type DfAnswer = string;

export const DF_SOURCES: readonly DfSource[] = ['natural', 'harmonic', 'borrowed'];

/**
 * The keys a function card is asked in, per scope level: few accidentals
 * first, then most of the circle (rule 12).
 */
export const DF_FUNCTION_KEYS: Readonly<Record<'major' | 'minor', readonly (readonly string[])[]>> =
  {
    major: [
      ['C', 'G', 'D', 'F'],
      ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'],
    ],
    minor: [
      ['Am', 'Em', 'Dm'],
      ['Am', 'Em', 'Bm', 'F#m', 'Dm', 'Gm', 'Cm'],
    ],
  };

/** Roots for chords the key doesn't spell (tritone distractors). */
const ROOT_BY_CHROMA = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function clampLevel(level: number): number {
  return Math.max(DF_SCOPE.minLevel, Math.min(DF_SCOPE.maxLevel, Math.round(level)));
}

function choiceCount(level: number): number {
  return DF_CHOICES[clampLevel(level)] as number;
}

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function pick<T>(xs: readonly T[], rng: () => number): T {
  return xs[Math.floor(rng() * xs.length)] as T;
}

function sym(root: string, quality: ChordQuality): string {
  return chordSymbol({ root, quality });
}

// ---------------------------------------------------------------------------
// Prompts

/** The qualities offered on each root of a minor-key chord card. */
const MINOR_CHORD_QUALITIES: Readonly<Record<string, readonly ChordQuality[]>> = {
  V: ['major', 'minor'],
  V7: ['dominant7', 'minor7'],
  'vii°': ['diminished', 'major'],
};

/** `minor-chord`: quality pairs on the answer's root, ♭VII's, then ii's. */
export function dfMinorChordChoices(key: MusicalKey, numeral: string, level: number): string[] {
  const qualities = MINOR_CHORD_QUALITIES[numeral] as readonly ChordQuality[];
  const roots = [numeral, 'bVII', 'ii°'].map((n) => chordFromNumeral(key, n).root);
  const n = choiceCount(level) / 2;
  return roots.slice(0, n).flatMap((r) => qualities.map((q) => sym(r, q)));
}

/** `two-five`: the minor ii–V–i and its near misses, as space-separated symbols. */
export function dfTwoFiveChoices(key: MusicalKey, level: number): string[] {
  const ii = chordFromNumeral(key, 'ii°').root;
  const v = chordFromNumeral(key, 'V').root;
  const i = chordFromNumeral(key, 'i').symbol;
  const grid = (['half-diminished7', 'minor7'] as const).flatMap((iiQ) =>
    (['dominant7', 'minor7'] as const).map((vQ) => `${sym(ii, iiQ)} ${sym(v, vQ)} ${i}`),
  );
  if (clampLevel(level) === 0) return grid;
  const relative = chordFromNumeral(key, 'bIII').root;
  const majors = [majorKey(relative), majorKey(key.tonic)].map((k) =>
    twoFiveOne(k)
      .map((c) => c.symbol)
      .join(' '),
  );
  return [...grid, ...majors];
}

export function dfTwoFiveAnswer(key: MusicalKey): string {
  return twoFiveOne(key)
    .map((c) => c.symbol)
    .join(' ');
}

/** The dominant 7th that resolves to `target` in a major key: V7/ii in C → A7. */
export function dfSecondaryChord(key: MusicalKey, target: string): ChordSpec {
  const reading = secondaryDominants(key, { sevenths: true }).find((r) => r.target === target);
  if (!reading) throw new Error(`No V7/${target} in ${key.tonic}`);
  return reading.chord;
}

/** `secondary`: dominant 7ths on the key's notes: the answer's, the target's, then others. */
export function dfSecondaryChoices(
  key: MusicalKey,
  target: string,
  level: number,
  rng: () => number,
): string[] {
  const answer = dfSecondaryChord(key, target).root;
  const on = chordFromNumeral(key, target).root;
  const rest = scaleOf(key).filter((r) => r !== answer && r !== on);
  const roots = [answer, on, ...shuffle(rest, rng)].slice(0, choiceCount(level));
  return roots.map((r) => sym(r, 'dominant7'));
}

/** `secondary-of`: the targets, always including the one on the chord's own root. */
export function dfTargetChoices(
  key: MusicalKey,
  target: string,
  level: number,
  rng: () => number,
): string[] {
  const root = chromaOf(dfSecondaryChord(key, target).root);
  const own = SECONDARY_TARGETS.filter(
    (t) => t !== target && chromaOf(chordFromNumeral(key, t).root) === root,
  );
  const rest = shuffle(
    SECONDARY_TARGETS.filter((t) => t !== target && !own.includes(t)),
    rng,
  );
  const picked = [target, ...own, ...rest].slice(0, choiceCount(level));
  return SECONDARY_TARGETS.filter((t) => picked.includes(t));
}

/**
 * `borrowed`: the tonic first, then the key's other major and minor chords
 * at random with the borrowed chord at a random place after the tonic.
 */
export function dfProgression(
  key: MusicalKey,
  numeral: string,
  level: number,
  rng: () => number,
): string[] {
  const length = choiceCount(level);
  const others = shuffle(['ii', 'iii', 'IV', 'V', 'vi'], rng).slice(0, length - 2);
  const at = 1 + Math.floor(rng() * (length - 1));
  const numerals = ['I', ...others];
  numerals.splice(at, 0, numeral);
  return numerals.map((n) => chordFromNumeral(key, n).symbol);
}

/** `tritone-sub`: the substitute, and dominant 7ths at other random intervals from the chord. */
export function dfTritoneChoices(chord: string, level: number, rng: () => number): string[] {
  const c = parseChordSymbol(chord);
  const answer = chordSymbol(tritoneSubstitute(c));
  const from = chromaOf(c.root);
  const steps = shuffle([1, 2, 3, 4, 5, 7, 8, 9, 10, 11], rng).slice(0, choiceCount(level) - 1);
  return [answer, ...steps.map((s) => sym(ROOT_BY_CHROMA[(from + s) % 12] as string, 'dominant7'))];
}

function functionKey(mode: 'major' | 'minor', level: number, rng: () => number): MusicalKey {
  return parseKey(pick(DF_FUNCTION_KEYS[mode][clampLevel(level)] as readonly string[], rng));
}

export function dfMakePrompt(item: Item, ctx: DrillContext): DfPrompt {
  const ref = parse(item);
  if (!ref) throw new Error(`The function drill cannot test item ${item.id}`);
  const level = ctx.scopeLevel;
  const rng = ctx.rng;
  const base = { itemId: item.id, kind: ref.kind, level, progression: null };
  switch (ref.kind) {
    case 'minor-chord': {
      const key = parseKey(ref.key);
      return {
        ...base,
        key,
        numeral: ref.numeral,
        chord: null,
        answer: chordFromNumeral(key, ref.numeral).symbol,
        choices: shuffle(dfMinorChordChoices(key, ref.numeral, level), rng),
      };
    }
    case 'minor-source': {
      const key = parseKey(ref.key);
      return {
        ...base,
        key,
        numeral: ref.numeral,
        chord: chordFromNumeral(key, ref.numeral).symbol,
        answer: dfSource(ref.numeral),
        choices: [...DF_SOURCES],
      };
    }
    case 'two-five': {
      const key = parseKey(ref.key);
      return {
        ...base,
        key,
        numeral: null,
        chord: null,
        answer: dfTwoFiveAnswer(key),
        choices: shuffle(dfTwoFiveChoices(key, level), rng),
      };
    }
    case 'function': {
      const key = functionKey(ref.mode, level, rng);
      const { degree } = parseRoman(ref.numeral) as Numeral;
      return {
        ...base,
        key,
        numeral: ref.numeral,
        chord: chordFromNumeral(key, ref.numeral).symbol,
        answer: diatonicFunction(ref.mode, degree),
        choices: [...HARMONIC_FUNCTIONS],
      };
    }
    case 'secondary': {
      const key = parseKey(ref.key);
      return {
        ...base,
        key,
        numeral: ref.target,
        chord: null,
        answer: chordSymbol(dfSecondaryChord(key, ref.target)),
        choices: shuffle(dfSecondaryChoices(key, ref.target, level, rng), rng),
      };
    }
    case 'secondary-of': {
      const key = parseKey(ref.key);
      return {
        ...base,
        key,
        numeral: ref.target,
        chord: chordSymbol(dfSecondaryChord(key, ref.target)),
        answer: ref.target,
        choices: dfTargetChoices(key, ref.target, level, rng),
      };
    }
    case 'borrowed': {
      const key = parseKey(ref.key);
      const progression = dfProgression(key, ref.numeral, level, rng);
      return {
        ...base,
        key,
        numeral: ref.numeral,
        chord: null,
        progression,
        answer: chordFromNumeral(key, ref.numeral).symbol,
        choices: progression,
      };
    }
    case 'tritone-sub':
      return {
        ...base,
        key: null,
        numeral: null,
        chord: ref.chord,
        answer: chordSymbol(tritoneSubstitute(ref.chord)),
        choices: shuffle(dfTritoneChoices(ref.chord, level, rng), rng),
      };
  }
}

// ---------------------------------------------------------------------------
// Grading

/** The concept a choice stands for, as `meta.ts` keys the cards; null where no card shares it. */
export function dfConcept(prompt: DfPrompt, value: string): string | null {
  const key = prompt.key as MusicalKey;
  switch (prompt.kind) {
    case 'minor-chord':
      return `numeral:${romanOf(key, value)}`;
    case 'minor-source':
      return `source:${value}`;
    case 'function':
      return `function:${value}`;
    case 'secondary-of':
      return `numeral:V7/${value}`;
    case 'secondary':
      return `numeral:${dfDominantLabel(key, value)}`;
    default:
      return value === prompt.answer ? prompt.itemId : null;
  }
}

export function dfCheck(prompt: DfPrompt, answer: DfAnswer): DrillCheck {
  const expected = dfDisplay(prompt, prompt.answer);
  const concept = dfConcept(prompt, prompt.answer) as string;
  if (answer === prompt.answer) return { correct: true, expected, concept };
  const given = prompt.choices.includes(answer) ? dfConcept(prompt, answer) : null;
  return {
    correct: false,
    expected,
    concept,
    ...(given && given !== concept ? { confusedWith: given } : {}),
  };
}

/** Stored as `answerGiven`. */
export function dfDescribeAnswer(answer: DfAnswer): string {
  return answer;
}

/** The chords a choice stands for, if it names any. */
function chordsOf(prompt: DfPrompt, value: string): string[] {
  switch (prompt.kind) {
    case 'two-five':
      return value.split(' ');
    case 'minor-chord':
    case 'secondary':
    case 'borrowed':
    case 'tritone-sub':
      return [value];
    default:
      return [];
  }
}

/**
 * Sound with the name (rule 10): the answer's chords, then the chosen ones
 * when wrong. A card answered with a label plays its own chord, and a
 * secondary dominant's reverse card plays it resolving to its target.
 */
export function dfSounds(prompt: DfPrompt, fb: DrillFeedback<DfAnswer>): DrillSounds {
  const voice = (chords: readonly string[]) => chords.flatMap(d11Voicing);
  const answerChords = chordsOf(prompt, prompt.answer);
  if (answerChords.length === 0) {
    const key = prompt.key as MusicalKey;
    const resolution =
      prompt.kind === 'secondary-of' ? [chordFromNumeral(key, prompt.answer).symbol] : [];
    return { expected: voice([prompt.chord as string, ...resolution]) };
  }
  const expected = voice(answerChords);
  if (fb.result.correct) return { expected };
  const given = chordsOf(prompt, fb.answer);
  return given.length > 0 ? { expected, given: voice(given) } : { expected };
}

/** Hardware keyboard (design §7): 1–9 pick the choice in that place. */
export function dfKeyToAnswer(key: string, choices: readonly string[]): DfAnswer | null {
  if (!/^[1-9]$/.test(key)) return null;
  return choices[Number(key) - 1] ?? null;
}
