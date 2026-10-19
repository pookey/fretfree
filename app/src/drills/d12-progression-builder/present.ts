import type { GuideLevel } from '../../engine/model';
import { diatonicChords, parseChordSymbol, parseKey, type ChordQuality } from '../../theory';
import {
  answerNumerals,
  d12Mix,
  d12Verdicts,
  isDominantProgression,
  pretty,
  type D12Answer,
  type D12Chart,
  type D12Prompt,
  type D12Tile,
} from './logic';

/*
 * What D12's views show and how they edit the chart. Only the lazy views
 * import this, so it stays out of first-load JS (design §10); logic.ts holds
 * what the eager drill plugin needs.
 */

// --- Words -----------------------------------------------------------------

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
