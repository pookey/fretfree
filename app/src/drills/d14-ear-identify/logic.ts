import { ENGINE_CONFIG } from '../../engine/config';
import {
  I6_CHORD_GROUPS,
  I6_INTERVAL_GROUPS,
  I6_PROGRESSION_GROUPS,
  type EarDirection,
  type EarGroup,
} from '../../engine/items/ear';
import type { Item } from '../../engine/model';
import {
  allStrings,
  chordKindInfo,
  chromaOf,
  fromHarmonyQuality,
  getProgression,
  intervalInfo,
  intervalSemitones,
  midiToFretNote,
  openStringMidi,
  progressionChords,
  standardKeyTonic,
  type AccidentalPref,
  type ChordKind,
  type DiatonicChord,
  type IntervalName,
  type MusicalKey,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D14_SCOPE, d14AnswerOf, d14CanTest, d14Concept, d14Parse } from './meta';

export { D14_ID, D14_SCOPE, d14CanTest, d14ConceptOf } from './meta';

/**
 * D14 "Hear it → identify" (design §6 D14, research/03 I6): a sound plays
 * and the learner names it from a row of buttons.
 *
 * - **Intervals** (`ear-interval:M3:up`): two notes, rising, falling or
 *   together, from a random first note (research/02 rule 12).
 * - **Chord quality** (`ear-chord:minor`): one strum, from a random bass.
 *   Every quality is voiced the same way (root, 5th, root, 3rd, or root,
 *   5th, 7th, 3rd: the guitar's A- and E-shape grips), so only the quality
 *   changes between two chords on the same root.
 * - **Progressions** (`prog:I-V-vi-IV:ear`): one strum per chord, in a
 *   random key.
 *
 * Each prompt keeps its `anchor` (the first note, the bass or the key), so
 * a wrong answer can be played on it beside the right one: the contrast is
 * what an ear learns from (rule 10).
 *
 * **The buttons carry no clue.** They are the answer's sound set (`i6.ts`
 * groups), a window of two neighbouring sets round the ring, starting at
 * random, or every set. Any button in a set of buttons could be the answer
 * to it (tested exhaustively).
 *
 * The view plays the clip: the session's feedback sound is note-by-note,
 * which can't strum or keep time, so `sounds` is empty. The clip's length is
 * listening, not recall, so graded time starts once it has been heard.
 *
 * The words (questions, names, what to listen for) are in `text.ts`, which
 * only the lazy view loads.
 */

export type D14Kind = 'interval' | 'chord' | 'progression';

export interface D14Prompt {
  itemId: string;
  kind: D14Kind;
  /** How an interval's notes sound; null for chords and progressions. */
  direction: EarDirection | null;
  /** An interval name (`M3`), a chord kind (`minor`) or a progression ID (`I-V-vi-IV`). */
  answer: string;
  /** The buttons, in display order. */
  choices: string[];
  /**
   * What every choice's sound is built on: an interval's first note and a
   * chord's bass, as MIDI, or a progression's tonic, as a chroma (0–11).
   */
  anchor: number;
  pref: AccidentalPref;
}

/** A choice: an interval name, a chord kind or a progression ID. */
export type D14Answer = string;

/** A clip to play: the audio module's three ways of sounding notes. */
export type D14Clip =
  /** Notes `gap` seconds apart; 0 plays them together. */
  | { type: 'notes'; notes: string[]; gap: number }
  | { type: 'strum'; notes: string[] }
  | { type: 'progression'; chords: string[][]; bpm: number; beatsPerChord: number };

const CONFIG = ENGINE_CONFIG.earIdentify;

const KIND: Record<string, D14Kind> = {
  'ear-interval': 'interval',
  'ear-chord': 'chord',
  'progression-ear': 'progression',
};

const GROUPS: Record<D14Kind, readonly EarGroup<string>[]> = {
  interval: I6_INTERVAL_GROUPS,
  chord: I6_CHORD_GROUPS,
  progression: I6_PROGRESSION_GROUPS,
};

/** Every sound of a kind, in display order: intervals by size, the rest as `i6.ts` lists them. */
export function d14AllChoices(kind: D14Kind): string[] {
  const all = GROUPS[kind].flatMap((g) => g.members);
  if (kind !== 'interval') return all;
  return all.sort(
    (a, b) => intervalSemitones(a as IntervalName) - intervalSemitones(b as IntervalName),
  );
}

/** A uniform pick of `0 … n-1`, safe against an rng that returns 1. */
function pick(n: number, rng: () => number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

function between(range: { from: number; to: number }, rng: () => number): number {
  return range.from + pick(range.to - range.from + 1, rng);
}

function level(scopeLevel: number): number {
  return Math.max(D14_SCOPE.minLevel, Math.min(D14_SCOPE.maxLevel, Math.round(scopeLevel)));
}

/**
 * The buttons for an answer at a scope level: its own sound set (0), a
 * window of two neighbouring sets that holds it, starting at random (1), or
 * every set (2). In display order.
 */
export function d14Choices(
  kind: D14Kind,
  answer: string,
  scopeLevel: number,
  rng: () => number,
): string[] {
  const groups = GROUPS[kind];
  const at = groups.findIndex((g) => g.members.includes(answer));
  if (at < 0) throw new RangeError(`D14 has no ${kind} ${answer}`);
  const lvl = level(scopeLevel);
  const span = lvl === 0 ? 1 : lvl === 1 ? Math.min(2, groups.length) : groups.length;
  const start = at - pick(span, rng) + groups.length;
  const members = new Set(
    Array.from(
      { length: span },
      (_, j) => groups[(start + j) % groups.length] as EarGroup<string>,
    ).flatMap((g) => g.members),
  );
  return d14AllChoices(kind).filter((c) => members.has(c));
}

export function d14MakePrompt(item: Item, ctx: DrillContext): D14Prompt {
  const ref = d14Parse(item);
  if (!ref || !d14CanTest(item)) throw new Error(`D14 cannot test item ${item.id}`);
  const kind = KIND[ref.kind] as D14Kind;
  const answer = d14AnswerOf(ref);
  const choices = d14Choices(kind, answer, ctx.scopeLevel, ctx.rng);
  let anchor: number;
  if (ref.kind === 'ear-interval') {
    const low = between(CONFIG.intervalLow, ctx.rng);
    // A falling interval starts on its top note.
    anchor = ref.direction === 'down' ? low + intervalSemitones(ref.interval) : low;
  } else if (ref.kind === 'ear-chord') {
    anchor = between(CONFIG.chordRoot, ctx.rng);
  } else {
    anchor = pick(12, ctx.rng);
  }
  return {
    itemId: item.id,
    kind,
    direction: ref.kind === 'ear-interval' ? ref.direction : null,
    answer,
    choices,
    anchor,
    pref: ctx.accidentalPref,
  };
}

export function d14Check(prompt: D14Prompt, answer: D14Answer): DrillCheck {
  const ref = REF_KIND[prompt.kind];
  const name = d14LongName(prompt.kind, prompt.answer);
  // "That was minor chord." reads better than "That was minor."
  const expected = prompt.kind === 'chord' ? `${name} chord` : name;
  const concept = d14Concept(ref, prompt.answer);
  if (answer === prompt.answer) return { correct: true, expected, concept };
  return {
    correct: false,
    expected,
    concept,
    ...(prompt.choices.includes(answer) ? { confusedWith: d14Concept(ref, answer) } : {}),
  };
}

const REF_KIND = {
  interval: 'ear-interval',
  chord: 'ear-chord',
  progression: 'progression-ear',
} as const;

/** Stored as `answerGiven`. */
export function d14DescribeAnswer(answer: D14Answer): string {
  return answer;
}

/** Nothing for the session to play: the view plays the clips (see above). */
export function d14Sounds(_prompt: D14Prompt, _fb: DrillFeedback<D14Answer>): DrillSounds {
  return { expected: [] };
}

/**
 * Graded time starts once the clip has been heard: its last sound, plus
 * `listenMs`. An answer before then is graded as instant.
 */
export function d14GradedResponseMs(
  prompt: D14Prompt,
  _answer: D14Answer,
  elapsedMs: number,
): number {
  const heard = d14LastOnsetS(d14Clip(prompt, prompt.answer)) * 1000 + CONFIG.listenMs;
  return Math.max(0, elapsedMs - heard);
}

// --- Names --------------------------------------------------------------------

/** Display form: `bVII` → `♭VII`, `m7b5` → `m7♭5`, `F#` → `F♯`. */
export function pretty(text: string): string {
  return text
    .replace(/#/g, '♯')
    .replace(/([A-G])b/g, '$1♭')
    .replace(/(^|[^A-Za-z])b(?=[IViv1-7])/g, '$1♭');
}

const CHORD_SHORT: Partial<Record<ChordKind, string>> = {
  major: 'Major',
  minor: 'Minor',
  diminished: 'Dim',
  augmented: 'Aug',
};

/** A button's main label: `M3`, `Major`, `m7♭5`, `I–V–vi–IV`. */
export function d14ShortName(kind: D14Kind, choice: string): string {
  switch (kind) {
    case 'interval':
      return choice;
    case 'chord':
      return CHORD_SHORT[choice as ChordKind] ?? pretty(choice);
    case 'progression':
      return pretty(getProgression(choice).name);
  }
}

/** The full name: `major 3rd`, `minor`, `dominant seventh`, `I–V–vi–IV`. */
export function d14LongName(kind: D14Kind, choice: string): string {
  switch (kind) {
    case 'interval':
      return intervalInfo(choice as IntervalName).long;
    case 'chord':
      return chordKindInfo(choice as ChordKind).name;
    case 'progression':
      return pretty(getProgression(choice).name);
  }
}

// --- Sound --------------------------------------------------------------------

/**
 * Chord voicings, as semitones above the bass: root, 5th, root, 3rd for a
 * triad, root, 5th, 7th, 3rd for a 7th chord. On a root on string 5 these
 * are the open A-shape grips (A x0222x, Am x0221x, A7 x0202x, Amaj7 x0212x,
 * Am7 x0201x, Am7♭5 x0101x), so every quality sounds like a guitar chord.
 */
export const D14_VOICINGS: Readonly<Record<string, readonly number[]>> = {
  major: [0, 7, 12, 16],
  minor: [0, 7, 12, 15],
  diminished: [0, 6, 12, 15],
  augmented: [0, 8, 12, 16],
  '7': [0, 7, 10, 16],
  maj7: [0, 7, 11, 16],
  m7: [0, 7, 10, 15],
  m7b5: [0, 6, 10, 15],
};

function voicing(kind: string): readonly number[] {
  const v = D14_VOICINGS[kind];
  if (!v) throw new RangeError(`D14 has no voicing for ${kind}`);
  return v;
}

const name = (midi: number, pref: AccidentalPref) => midiToFretNote(midi, pref).name;

/** An interval's two notes as MIDI, in the order they sound. */
export function intervalMidis(anchor: number, interval: string, direction: EarDirection): number[] {
  const n = intervalSemitones(interval as IntervalName);
  return [anchor, direction === 'down' ? anchor - n : anchor + n];
}

/** A chord's notes as MIDI, low to high, from its bass. */
export function chordMidis(bass: number, kind: string): number[] {
  return voicing(kind).map((s) => bass + s);
}

/**
 * The key a progression plays in. A progression in the other mode than the
 * prompt's plays in the relative key, so it shares the key signature (C
 * major beside A minor).
 */
export function d14KeyOf(prompt: D14Prompt, progression: string): MusicalKey {
  const mode = getProgression(progression).mode;
  const home = getProgression(prompt.answer).mode;
  const shift = mode === home ? 0 : mode === 'minor' ? 9 : 3;
  return { tonic: standardKeyTonic(prompt.anchor + shift, mode), mode };
}

/** A progression's chords in the key it plays in. */
export function d14Chart(prompt: D14Prompt, progression: string): DiatonicChord[] {
  return progressionChords(d14KeyOf(prompt, progression), getProgression(progression));
}

/** The bass of a progression's chord: E2 to D♯3, the guitar's lowest octave. */
function progressionBass(root: string): number {
  return 40 + ((chromaOf(root) - 4 + 12) % 12);
}

/** The sound of a choice, built on the prompt's anchor. */
export function d14Clip(prompt: D14Prompt, choice: string): D14Clip {
  switch (prompt.kind) {
    case 'interval': {
      const direction = prompt.direction ?? 'up';
      const notes = intervalMidis(prompt.anchor, choice, direction).map((m) =>
        name(m, prompt.pref),
      );
      return { type: 'notes', notes, gap: direction === 'together' ? 0 : CONFIG.intervalGapS };
    }
    case 'chord':
      return {
        type: 'strum',
        notes: chordMidis(prompt.anchor, choice).map((m) => name(m, prompt.pref)),
      };
    case 'progression':
      return {
        type: 'progression',
        chords: d14Chart(prompt, choice).map((c) =>
          chordMidis(progressionBass(c.root), fromHarmonyQuality(c.quality)).map((m) =>
            name(m, prompt.pref),
          ),
        ),
        bpm: CONFIG.progression.bpm,
        beatsPerChord: CONFIG.progression.beatsPerChord,
      };
  }
}

/** Seconds from a clip's start to its last sound. */
export function d14LastOnsetS(clip: D14Clip): number {
  switch (clip.type) {
    case 'notes':
      return Math.max(0, clip.notes.length - 1) * clip.gap;
    case 'strum':
      return 0;
    case 'progression':
      return (Math.max(0, clip.chords.length - 1) * clip.beatsPerChord * 60) / clip.bpm;
  }
}

// --- The neck, in feedback ------------------------------------------------------

/** How far a hand stretches: fretted notes at most this many frets apart (C3's limit). */
const MAX_SPAN = 4;
const TOP_FRET = 15;

/**
 * Where to play some notes on the neck: one string each, low notes on low
 * strings, within a hand's stretch, frets 0–15. Fewest skipped strings
 * first, then the smallest stretch, then nearest the nut. Null if none fits.
 * Returned in the order the notes were given.
 */
export function placeOnNeck(midis: readonly number[], tuning: Tuning): Position[] | null {
  const order = midis.map((m, i) => ({ m, i })).sort((a, b) => a.m - b.m);
  // Low strings first: string 6 is the lowest.
  const strings = allStrings(tuning).reverse();
  let best: { pos: Position[]; score: number[] } | null = null;
  const walk = (k: number, from: number, acc: Position[]) => {
    if (k === order.length) {
      const fretted = acc.map((p) => p.fret).filter((f) => f > 0);
      const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
      if (span > MAX_SPAN) return;
      const first = acc[0] as Position;
      const last = acc[acc.length - 1] as Position;
      const skipped = first.string - last.string - (acc.length - 1);
      const score = [skipped, span, Math.max(...acc.map((p) => p.fret))];
      if (!best || lexLess(score, best.score)) best = { pos: [...acc], score };
      return;
    }
    const { m } = order[k] as { m: number };
    for (let s = from; s < strings.length; s++) {
      const string = strings[s] as number;
      const fret = m - openStringMidi(string, tuning);
      if (fret < 0 || fret > TOP_FRET) continue;
      acc.push({ string, fret });
      walk(k + 1, s + 1, acc);
      acc.pop();
    }
  };
  walk(0, 0, []);
  const found = best as { pos: Position[] } | null;
  if (!found) return null;
  const out: Position[] = new Array<Position>(midis.length);
  order.forEach(({ i }, k) => (out[i] = found.pos[k] as Position));
  return out;
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if ((a[i] as number) !== (b[i] as number)) return (a[i] as number) < (b[i] as number);
  }
  return false;
}

export type D14Degree = 'root' | 'third' | 'fifth' | 'seventh';

/** A chord note's role, by semitones above the bass: shapes and colours as the other chord drills. */
export function degreeOf(semitones: number): D14Degree {
  const s = ((semitones % 12) + 12) % 12;
  if (s === 0) return 'root';
  if (s === 3 || s === 4) return 'third';
  if (s >= 6 && s <= 8) return 'fifth';
  return 'seventh';
}

export interface D14NeckNote extends Position {
  /** The pitch class, spelled by the accidental preference. */
  pc: string;
  /** Interval notes: the first note is `root`; chord notes: their degree. */
  role: D14Degree | 'other';
}

/**
 * The answer on the neck, for sight beside sound and name (rule 10): an
 * interval's two notes or a chord's grip. Null for progressions, and for a
 * sound that fits no hand (never, in the configured ranges; tested).
 */
export function d14NeckNotes(prompt: D14Prompt, tuning: Tuning): D14NeckNote[] | null {
  if (prompt.kind === 'progression') return null;
  const midis =
    prompt.kind === 'interval'
      ? intervalMidis(prompt.anchor, prompt.answer, prompt.direction ?? 'up')
      : chordMidis(prompt.anchor, prompt.answer);
  const pos = placeOnNeck(midis, tuning);
  if (!pos) return null;
  return pos.map((p, i) => ({
    ...p,
    pc: midiToFretNote(midis[i] as number, prompt.pref).pc,
    role:
      prompt.kind === 'interval'
        ? i === 0
          ? 'root'
          : 'other'
        : degreeOf((midis[i] as number) - prompt.anchor),
  }));
}

// --- Keyboard -----------------------------------------------------------------

/** Keys for the buttons by position: the number row, then - and = (twelve intervals). */
const KEYBOARD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export function d14KeyFor(index: number): string | undefined {
  return KEYBOARD[index];
}

/** Hardware-keyboard answers (design §7): the number row picks a button by position. */
export function d14KeyToAnswer(key: string, choices: readonly string[]): string | null {
  const i = KEYBOARD.indexOf(key);
  return i < 0 ? null : (choices[i] ?? null);
}
