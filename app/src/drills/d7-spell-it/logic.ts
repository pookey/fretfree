import {
  parseDegreeItemId,
  parseSpellChordItemId,
  parseSpellKeyItemId,
  type GuideLevel,
  type Item,
} from '../../engine/model';
import {
  MAJOR_SCALE_STEPS,
  chordFormula,
  chordKindInfo,
  chromaOf,
  compareSpelling,
  degreeOrdinal,
  isPracticalMajorKey,
  isPracticalSpelling,
  majorScale,
  spellChord,
  type SpellingVerdict,
} from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D7_SCOPE } from './meta';

export { D7_ID, D7_SCOPE, d7CanTest, d7ConceptOf } from './meta';

/**
 * D7 "Spell it" (design §6 D7): ordered-choice spelling of major keys (C4)
 * and chords (C5). The tonic or root is given; the learner fills the other
 * notes in order from a grid of letter × accidental buttons, then checks.
 * C4's degree cards use the same screen with one blank (`degree:6@Eb`) or
 * ask which degree a note is (`degree-of:6@Eb`).
 *
 * Spelling is strict (research/03 C4): each scale letter once, and chord
 * tones on every other letter. An enharmonic answer (F for E# in F# major)
 * is graded wrong like any other, so FSRS sees "Again"; its verdict only
 * picks the explanation ("right pitch, wrong letter").
 */

export type D7Kind = 'key' | 'chord' | 'degree' | 'degree-of';

export interface D7Slot {
  /** The degree label: `1`–`7` in a key, the formula degree (`b3`, `b7`) in a chord. */
  label: string;
  /** The note, spelled strictly. */
  note: string;
  /** The tonic or root: shown, not answered. */
  given: boolean;
}

export interface D7Prompt {
  itemId: string;
  kind: D7Kind;
  /** What is spelled: `F# major`, `Bm7`. */
  subject: string;
  /** The key's tonic or the chord's root. */
  tonic: string;
  /** In order, tonic or root first. A degree prompt has the tonic and its one target. */
  slots: D7Slot[];
  /** Keys and degrees: the step from each slot to the next, W or H (guide level 2+). */
  steps: ('W' | 'H')[];
  /** Note buttons, in grid order (letter A–G, then flat → sharp). Empty for `degree-of`. */
  choices: string[];
  /** `degree-of`: the degree buttons, 2–7. */
  degreeChoices: number[];
  /** `degree` and `degree-of`: the degree asked about. */
  degree: number | null;
}

/** The answer: the blanks in order, or the degree picked. */
export type D7Answer = { notes: string[] } | { degree: number };

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
/** Letter order from C, for octaves and counting letters. */
const C_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACCIDENTALS = ['bb', 'b', '', '#', '##'];

function letterOf(note: string): string {
  return note.charAt(0);
}

function accidentalOf(note: string): string {
  return note.slice(1);
}

function isNote(note: string): boolean {
  return /^[A-G](#{1,2}|b{1,2})?$/.test(note);
}

/** Display form: `F#` → `F♯`, `Bbb` → `B𝄫`. */
export function pretty(note: string): string {
  if (!isNote(note)) return note;
  const acc = accidentalOf(note)
    .replace('##', '𝄪')
    .replace('bb', '𝄫')
    .replace('#', '♯')
    .replace('b', '♭');
  return letterOf(note) + acc;
}

/**
 * Display form of a formula degree: `b3` → `♭3`, `#11` → `♯11`, `bb7` → `♭♭7`.
 * The slot labels stay ASCII; this is what the learner reads.
 */
export function prettyDegree(label: string): string {
  return label.replace(/b/g, '♭').replace(/#/g, '♯');
}

/** Formula: `1 ♭3 5 ♭7`. */
export function d7Formula(prompt: D7Prompt): string {
  return prompt.slots.map((s) => prettyDegree(s.label)).join(' ');
}

const SPOKEN: Record<string, string> = {
  bb: ' double flat',
  b: ' flat',
  '': '',
  '#': ' sharp',
  '##': ' double sharp',
};

/** Accessible name: `F#` → `F sharp`. */
export function spoken(note: string): string {
  return isNote(note) ? letterOf(note) + SPOKEN[accidentalOf(note)] : note;
}

/** The letters from `from` up to `to`, inclusive: E → C gives E F G A B C. */
export function letterRun(from: string, to: string): string[] {
  const start = C_LETTERS.indexOf(letterOf(from));
  const end = C_LETTERS.indexOf(letterOf(to));
  const n = (end - start + 7) % 7;
  return Array.from({ length: n + 1 }, (_, i) => C_LETTERS[(start + i) % 7] as string);
}

function parse(item: Item): Omit<D7Prompt, 'itemId' | 'choices' | 'degreeChoices'> | null {
  const key = parseSpellKeyItemId(item.id);
  if (key && isPracticalMajorKey(key.tonic)) {
    return {
      kind: 'key',
      subject: `${pretty(key.tonic)} major`,
      tonic: key.tonic,
      slots: majorScale(key.tonic).map((note, i) => ({
        label: String(i + 1),
        note,
        given: i === 0,
      })),
      steps: MAJOR_SCALE_STEPS.slice(0, 6),
      degree: null,
    };
  }
  const chord = parseSpellChordItemId(item.id);
  // Roots whose spelling needs a double sharp or flat (Fb minor: Fb Abb Cb) aren't asked.
  if (chord && isPracticalSpelling(spellChord(chord.root, chord.chord))) {
    const formula = chordFormula(chord.chord);
    return {
      kind: 'chord',
      subject: displayPc(pretty(chord.root) + chordKindInfo(chord.chord).suffix),
      tonic: chord.root,
      slots: spellChord(chord.root, chord.chord).map((note, i) => ({
        label: formula[i] as string,
        note,
        given: i === 0,
      })),
      steps: [],
      degree: null,
    };
  }
  const deg = parseDegreeItemId(item.id);
  if (deg && deg.degree > 1 && isPracticalMajorKey(deg.tonic)) {
    const scale = majorScale(deg.tonic);
    return {
      kind: deg.kind,
      subject: `${pretty(deg.tonic)} major`,
      tonic: deg.tonic,
      slots: [
        { label: '1', note: scale[0] as string, given: true },
        { label: String(deg.degree), note: scale[deg.degree - 1] as string, given: false },
      ],
      steps: [],
      degree: deg.degree,
    };
  }
  return null;
}

/** The notes the learner must enter, in order. */
export function d7Blanks(prompt: Pick<D7Prompt, 'slots'>): string[] {
  return prompt.slots.filter((s) => !s.given).map((s) => s.note);
}

/** Spellings of the same pitch on other letters, with at most one accidental: E# → F. */
export function enharmonicTwins(note: string): string[] {
  const c = chromaOf(note);
  return LETTERS.flatMap((l) =>
    ['b', '', '#'].map((a) => l + a).filter((n) => letterOf(n) !== letterOf(note)),
  ).filter((n) => chromaOf(n) === c);
}

/** Grid order: by letter A–G, then flat to sharp. */
function gridSort(notes: Iterable<string>): string[] {
  const rank = (n: string) =>
    LETTERS.indexOf(letterOf(n)) * 10 + ACCIDENTALS.indexOf(accidentalOf(n));
  return [...new Set(notes)].sort((a, b) => rank(a) - rank(b));
}

/** A letter with flat, natural and sharp: `C` → `Cb C C#`. */
function letterColumn(letter: string): string[] {
  return [`${letter}b`, letter, `${letter}#`];
}

/**
 * The note buttons. Every level includes the answers (a double flat in a
 * dim7 too), so the grid never hides the right spelling. Scope 0 offers each
 * answer's letter with ♭, ♮ and ♯ and its enharmonic twins, so even a
 * one-note degree card asks for both the letter (C, not B♯) and the
 * accidental (C, not C♯ or C♭); scope 1 offers every letter.
 */
export function d7Choices(blanks: readonly string[], scopeLevel: number): string[] {
  const level = Math.max(D7_SCOPE.minLevel, Math.min(D7_SCOPE.maxLevel, scopeLevel));
  if (level >= 1) return gridSort([...LETTERS.flatMap(letterColumn), ...blanks]);
  return gridSort(blanks.flatMap((n) => [n, ...letterColumn(letterOf(n)), ...enharmonicTwins(n)]));
}

export function d7MakePrompt(item: Item, ctx: DrillContext): D7Prompt {
  const p = parse(item);
  if (!p) throw new Error(`D7 cannot test item ${item.id}`);
  const blanks = d7Blanks(p);
  return {
    ...p,
    itemId: item.id,
    choices: p.kind === 'degree-of' ? [] : d7Choices(blanks, ctx.scopeLevel),
    degreeChoices: p.kind === 'degree-of' ? [2, 3, 4, 5, 6, 7] : [],
  };
}

function isDegreeAnswer(answer: D7Answer): answer is { degree: number } {
  return 'degree' in answer;
}

/** Per-blank verdicts for a spelled answer; empty for a degree answer. */
export function d7Verdicts(prompt: D7Prompt, answer: D7Answer): SpellingVerdict[] {
  if (isDegreeAnswer(answer)) return [];
  return d7Blanks(prompt).map((e, i) => {
    const g = answer.notes[i];
    return g === undefined ? 'wrong' : compareSpelling(e, g);
  });
}

/** The expected answer as the feedback bar shows it. */
export function d7Expected(prompt: D7Prompt): string {
  if (prompt.kind === 'degree-of') return degreeOrdinal(prompt.degree as number);
  if (prompt.kind === 'degree') return pretty(d7Blanks(prompt)[0] as string);
  return prompt.slots.map((s) => pretty(s.note)).join(' ');
}

export function d7Check(prompt: D7Prompt, answer: D7Answer): DrillCheck {
  const expected = d7Expected(prompt);
  if (isDegreeAnswer(answer)) {
    return { correct: prompt.kind === 'degree-of' && answer.degree === prompt.degree, expected };
  }
  if (prompt.kind === 'degree-of') return { correct: false, expected };
  const verdicts = d7Verdicts(prompt, answer);
  // Strict: an enharmonic spelling is wrong, so it rates "Again" (rule 2).
  const correct = answer.notes.length === verdicts.length && verdicts.every((v) => v === 'correct');
  return { correct, expected };
}

/** Grade time per note entered, so a seven-note key meets the usual speed targets (§3.2). */
export function d7GradedResponseMs(prompt: D7Prompt, _answer: D7Answer, elapsedMs: number) {
  return elapsedMs / Math.max(1, d7Blanks(prompt).length);
}

function ordinalWord(n: number): string {
  if (n === 1) return 'root';
  return `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

/** A chord tone by its formula number (`b3` → `3rd`), a key degree by its own. */
function toneWord(label: string): string {
  return ordinalWord(Number(label.replace(/[#b]/g, '')));
}

/** `the 7th of F♯ major`, `the 3rd of Bm7`. */
function slotPhrase(prompt: D7Prompt, slot: D7Slot): string {
  return `the ${toneWord(slot.label)} of ${prompt.subject}`;
}

/** Why the letter is what it is: count letters up from the tonic or root. */
function letterReason(prompt: D7Prompt, slot: D7Slot): string {
  const run = letterRun(prompt.tonic, slot.note);
  return `count letters up from ${pretty(prompt.tonic)}: ${run.join(' ')}`;
}

/** Half steps above the tonic or root, for a wrong-pitch explanation. */
function wrongPitchReason(prompt: D7Prompt, slot: D7Slot): string {
  const semis = (chromaOf(slot.note) - chromaOf(prompt.tonic) + 12) % 12;
  return `${semis} half steps above ${pretty(prompt.tonic)}`;
}

/**
 * The explanation shown when an answer is wrong: one line per mistake, then
 * the rule behind them. Enharmonic slips say "right pitch, wrong letter".
 */
export function d7Explain(prompt: D7Prompt, answer: D7Answer): string[] {
  if (isDegreeAnswer(answer)) {
    if (prompt.kind !== 'degree-of' || answer.degree === prompt.degree) return [];
    const slot = prompt.slots[1] as D7Slot;
    return [
      `${pretty(slot.note)} is ${slotPhrase(prompt, slot)}, not the ${degreeOrdinal(answer.degree)}: ${letterReason(prompt, slot)}.`,
    ];
  }
  const verdicts = d7Verdicts(prompt, answer);
  const blanks = prompt.slots.filter((s) => !s.given);
  const lines: string[] = [];
  let enharmonic = false;
  blanks.forEach((slot, i) => {
    const v = verdicts[i];
    const given = answer.notes[i];
    if (v === 'correct') return;
    if (given === undefined) {
      lines.push(`${slotPhrase(prompt, slot)} is missing: it's ${pretty(slot.note)}.`);
      return;
    }
    if (v === 'enharmonic') {
      enharmonic = true;
      lines.push(
        `Right pitch, wrong letter: ${pretty(given)} sounds like ${pretty(slot.note)}, but ${slotPhrase(prompt, slot)} sits on ${letterOf(slot.note)} (${letterReason(prompt, slot)}).`,
      );
      return;
    }
    lines.push(
      `${pretty(given)} isn't ${slotPhrase(prompt, slot)}: it's ${pretty(slot.note)}, ${wrongPitchReason(prompt, slot)}.`,
    );
  });
  if (lines.length === 0) return [];
  if (enharmonic) {
    lines.push(
      prompt.kind === 'chord'
        ? chordRule(prompt)
        : 'A major key uses each letter A–G exactly once, in order, whatever accidental that needs.',
    );
  }
  return lines;
}

/** True for chords stacked in 3rds (1 3 5 7, any accidentals): each tone skips a letter. */
function isStackedThirds(prompt: D7Prompt): boolean {
  return prompt.slots.every((s) => /^[b#]*[1357]$/.test(s.label));
}

/** Why a chord is spelled on its letters, after an enharmonic slip. */
function chordRule(prompt: D7Prompt): string {
  if (isStackedThirds(prompt)) {
    return 'Chord tones are spelled by letter: root, 3rd, 5th and 7th skip a letter each time, whatever accidental that needs.';
  }
  // Sus and add chords don't stack 3rds (Csus4 = C F G): read the letter off each number.
  const map = prompt.slots
    .map((s) => `${s.label.replace(/[b#]/g, '')} → ${letterOf(s.note)}`)
    .join(', ');
  return `Chord tones are spelled by letter: each sits on the letter its number names, counting the root as 1 (${map}), whatever accidental that needs.`;
}

/** The hint under the task (guide level 2+). It names the rule, never the answer. */
export function d7Hint(prompt: D7Prompt): string {
  if (prompt.kind !== 'chord') return 'Each letter A–G once, in order.';
  return isStackedThirds(prompt)
    ? 'Root, 3rd, 5th, 7th: skip a letter each time.'
    : 'Each tone sits on the letter its number names, counting the root as 1.';
}

/** The worked-example line for the first, guided rep of a new item (rule 8). */
export function d7WorkedExample(prompt: D7Prompt): string {
  const subject = prompt.subject;
  const notes = prompt.slots.map((s) => pretty(s.note)).join(' ');
  const target = prompt.slots[1] as D7Slot;
  switch (prompt.kind) {
    case 'key':
      return `${subject} uses each letter once, going up in whole and half steps (W W H W W W H): ${notes}.`;
    case 'chord':
      return `${subject} is ${d7Formula(prompt)} from ${pretty(prompt.tonic)}: ${notes}.`;
    case 'degree':
    case 'degree-of':
      return `${pretty(target.note)} is ${slotPhrase(prompt, target)}: ${letterReason(prompt, target)}.`;
  }
}

/** The task line under the subject. */
export function d7Task(prompt: D7Prompt): string {
  const subject = prompt.subject;
  switch (prompt.kind) {
    case 'key':
    case 'chord':
      return `Spell ${subject}`;
    case 'degree':
      return `The ${degreeOrdinal(prompt.degree as number)} of ${subject}?`;
    case 'degree-of':
      return `${pretty((prompt.slots[1] as D7Slot).note)} is which degree of ${subject}?`;
  }
}

/** The tonic's octave for playback: guitar-range, low enough that a 9th stays in range. */
const START_OCTAVE = 3;

/** Spelled notes in rising order, with octaves for playback: E F# G# → E3 F#3 G#3. */
export function withOctaves(notes: readonly string[], start = START_OCTAVE): string[] {
  let octave = start;
  return notes.map((n, i) => {
    if (i > 0) {
      const prev = C_LETTERS.indexOf(letterOf(notes[i - 1] as string));
      if (C_LETTERS.indexOf(letterOf(n)) <= prev) octave += 1;
    }
    return `${n}${octave}`;
  });
}

export function d7Sounds(prompt: D7Prompt, fb: DrillFeedback<D7Answer>): DrillSounds {
  const expected = withOctaves(prompt.slots.map((s) => s.note));
  if (fb.result.correct || isDegreeAnswer(fb.answer)) return { expected };
  // Replay the learner's spelling only when it sounds different: an
  // enharmonic slip is the same pitch, and its lesson is the letter.
  const verdicts = d7Verdicts(prompt, fb.answer);
  if (!verdicts.includes('wrong')) return { expected };
  const given = fb.answer.notes.filter(isNote);
  if (given.length === 0) return { expected };
  return { expected, given: withOctaves([prompt.tonic, ...given]) };
}

/** Stored as `answerGiven`. */
export function d7DescribeAnswer(answer: D7Answer): string {
  return isDegreeAnswer(answer) ? String(answer.degree) : answer.notes.join(' ');
}

/** What each guide level shows (rule 9: faded within and across sessions). */
export interface D7Guides {
  /** Degree labels under the slots. */
  labels: boolean;
  /** W/H marks between key slots and the "each letter once" hint. */
  steps: boolean;
  /** Each blank shows its letter, without the accidental. */
  letters: boolean;
}

export function d7Guides(level: GuideLevel): D7Guides {
  return { labels: level >= 1, steps: level >= 2, letters: level >= 3 };
}

/**
 * Hardware keyboard (design §7): A–G enter a natural, `#` or `+` sharpens
 * the last note entered and `-` flattens it, Backspace removes it, Enter
 * checks. Degree prompts take 2–7.
 */
export type D7KeyAction =
  | { type: 'add'; note: string }
  | { type: 'alter'; by: 1 | -1 }
  | { type: 'remove' }
  | { type: 'check' }
  | { type: 'degree'; degree: number };

export function d7KeyAction(key: string, kind: D7Kind): D7KeyAction | null {
  if (kind === 'degree-of') {
    return /^[2-7]$/.test(key) ? { type: 'degree', degree: Number(key) } : null;
  }
  if (/^[a-gA-G]$/.test(key)) return { type: 'add', note: key.toUpperCase() };
  if (key === '#' || key === '+') return { type: 'alter', by: 1 };
  if (key === '-') return { type: 'alter', by: -1 };
  if (key === 'Backspace') return { type: 'remove' };
  if (key === 'Enter') return { type: 'check' };
  return null;
}

/** Raise or lower a note by one accidental, within double flat to double sharp. */
export function alterNote(note: string, by: 1 | -1): string {
  const i = ACCIDENTALS.indexOf(accidentalOf(note));
  const next = ACCIDENTALS[Math.max(0, Math.min(ACCIDENTALS.length - 1, i + by))] as string;
  return letterOf(note) + next;
}
