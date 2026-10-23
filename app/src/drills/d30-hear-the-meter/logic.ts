import { ENGINE_CONFIG } from '../../engine/config';
import {
  EAR_METERS,
  METER_SETS_BY_BAR,
  METER_SETS_BY_KIND,
  type EarMeter,
  type MeterSet,
} from '../../engine/items/meter-ear';
import type { Item } from '../../engine/model';
import {
  beats,
  fracToNumber,
  meterKind,
  parseTimeSignature,
  type TimeSignature,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D30_SCOPE, d30CanTest, d30Concept, d30Meter } from './meta';

export { D30_ID, D30_SCOPE, d30CanTest, d30ConceptOf } from './meta';

/**
 * D30 "Hear the meter" (design §6 D30, §12; research/03 T4, T7): a clip
 * plays, strummed on the guitar or played on drums, and the learner names
 * its meter from a row of buttons.
 *
 * **Sound before symbol.** The buttons are meter names, and nothing on
 * screen shows the beat while the clip plays. The time signature, the
 * notes of one bar and its counting appear only with the feedback, beside
 * the sound and its name (research/02 rule 10).
 *
 * **The clip is generated** from the time signature (`theory/meter.ts`):
 * every eighth of the bar sounds, and what sounds on it shows where it
 * falls. The downbeat is strongest (the bass note, or the kick drum), then
 * the start of a later group (the second half of a four-beat bar, or the
 * long group of 5/4), then each felt beat, then the eighths between. So 3/4
 * and 6/8 hold the same six eighths and differ only in where the beats
 * fall (twos or threes), and 4/4 and 12/8 differ only in how the beat
 * splits: exactly what the learner must hear. Tempo ranges overlap for the
 * same reason. A closing downbeat rounds the clip off.
 *
 * Each prompt varies the sound (guitar or drums), the chord, the tempo and,
 * for 5/4 and 7/8, the grouping (rule 12).
 *
 * The view plays the clip: the session's feedback sound is note-by-note,
 * which can't keep time, so `sounds` is empty. Graded time starts once the
 * clip has played, as D14's does.
 *
 * The words (names, facts, what to listen for) are in `text.ts`, which only
 * the lazy view loads.
 */

export type D30Style = 'strum' | 'drums';

export interface D30Prompt {
  itemId: string;
  /** The answer. */
  meter: EarMeter;
  /** The grouping the clip plays, as `theory` reads it: `7/8 (3+2+2)`; the meter itself if it has one. */
  signature: string;
  /** The buttons, in display order. */
  choices: EarMeter[];
  style: D30Style;
  /** The clip's tempo. */
  eighthsPerMinute: number;
  /** Index into `D30_CHORDS`: the chord a strummed clip plays. */
  chord: number;
}

/** A meter's name. */
export type D30Answer = EarMeter;

const CONFIG = ENGINE_CONFIG.hearTheMeter;

/**
 * The groupings a meter is played in, the usual one first. A simple or
 * compound meter has one; 5/4 and 7/8 are heard in several (research/03
 * T7: "3+2, 2+2+3").
 */
export const D30_GROUPINGS: Readonly<Record<EarMeter, readonly string[]>> = {
  '3/4': ['3/4'],
  '4/4': ['4/4'],
  '6/8': ['6/8'],
  '12/8': ['12/8'],
  '5/4': ['5/4 (3+2)', '5/4 (2+3)'],
  '7/8': ['7/8 (2+2+3)', '7/8 (3+2+2)', '7/8 (2+3+2)'],
};

/** A uniform pick of `0 … n-1`, safe against an rng that returns 1. */
function pick(n: number, rng: () => number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

function level(scopeLevel: number): number {
  return Math.max(D30_SCOPE.minLevel, Math.min(D30_SCOPE.maxLevel, Math.round(scopeLevel)));
}

function setOf(sets: readonly MeterSet[], meter: EarMeter): readonly EarMeter[] {
  const set = sets.find((s) => s.members.includes(meter));
  if (!set) throw new RangeError(`D30 has no meter ${meter}`);
  return set.members;
}

/**
 * The buttons for an answer at a scope level, in display order: its kind
 * (0: 3/4 or 4/4), its confusable pair (1: 3/4 or 6/8), or every meter (2).
 * Each is a set any of whose buttons could be the answer, so the buttons
 * carry no clue (tested).
 */
export function d30Choices(meter: EarMeter, scopeLevel: number): EarMeter[] {
  const lvl = level(scopeLevel);
  const members =
    lvl === 0
      ? setOf(METER_SETS_BY_KIND, meter)
      : lvl === 1
        ? setOf(METER_SETS_BY_BAR, meter)
        : EAR_METERS;
  return EAR_METERS.filter((m) => members.includes(m));
}

export function d30MakePrompt(item: Item, ctx: DrillContext): D30Prompt {
  const meter = d30Meter(item);
  if (!meter || !d30CanTest(item)) throw new Error(`D30 cannot test item ${item.id}`);
  const groupings = D30_GROUPINGS[meter];
  const signature = groupings[pick(groupings.length, ctx.rng)] as string;
  const range = CONFIG.eighthsPerMinute[meter];
  const steps = Math.floor((range.to - range.from) / CONFIG.tempoStep) + 1;
  const eighthsPerMinute = range.from + CONFIG.tempoStep * pick(steps, ctx.rng);
  return {
    itemId: item.id,
    meter,
    signature,
    choices: d30Choices(meter, ctx.scopeLevel),
    style: ctx.rng() < 0.5 ? 'strum' : 'drums',
    eighthsPerMinute,
    chord: pick(D30_CHORDS.length, ctx.rng),
  };
}

export function d30Check(prompt: D30Prompt, answer: D30Answer): DrillCheck {
  const expected = prompt.meter;
  const concept = d30Concept(prompt.meter);
  if (answer === prompt.meter) return { correct: true, expected, concept };
  return {
    correct: false,
    expected,
    concept,
    ...(prompt.choices.includes(answer) ? { confusedWith: d30Concept(answer) } : {}),
  };
}

/** Stored as `answerGiven`. */
export function d30DescribeAnswer(answer: D30Answer): string {
  return answer;
}

/** Nothing for the session to play: the view plays the clips (see above). */
export function d30Sounds(_prompt: D30Prompt, _fb: DrillFeedback<D30Answer>): DrillSounds {
  return { expected: [] };
}

/**
 * Graded time starts once the clip has been heard: its last bar, plus
 * `listenMs`. An answer before then is graded as instant.
 */
export function d30GradedResponseMs(
  prompt: D30Prompt,
  _answer: D30Answer,
  elapsedMs: number,
): number {
  const ts = parseTimeSignature(prompt.signature);
  const heard =
    (d30Bars(ts, prompt.eighthsPerMinute) * eighthsPerBar(ts) * 60_000) /
      prompt.eighthsPerMinute +
    CONFIG.listenMs;
  return Math.max(0, elapsedMs - heard);
}

// --- The bar --------------------------------------------------------------------

/** How strongly an eighth of the bar sounds, strongest first. */
export type D30Accent = 'bar' | 'group' | 'beat' | 'off';

/** Eighths in a bar: 6 in 3/4 and 6/8, 7 in 7/8. */
export function eighthsPerBar(ts: TimeSignature): number {
  return (ts.top * 8) / ts.bottom;
}

/** Where each felt beat starts, in eighths from the bar line. */
export function beatStarts(ts: TimeSignature): number[] {
  return beats(ts).map((b) => fracToNumber(b.start) * 8);
}

/**
 * The beats that start a later group, the bar's secondary stress: the
 * middle of a four-beat bar (beat 3 of 4/4, beat 7 of 12/8's eighths), and
 * each later group of a meter counted in quarters (beat 4 of 5/4 as 3+2).
 * In 7/8 the groups are the beats themselves.
 */
function groupBeats(ts: TimeSignature): number[] {
  const n = beats(ts).length;
  if (meterKind(ts) === 'odd' && n === ts.top) {
    const out: number[] = [];
    let at = 0;
    for (const g of ts.groups.slice(0, -1)) out.push((at += g));
    return out;
  }
  return n === 4 ? [2] : [];
}

/** Each eighth of one bar's accent. */
export function d30Accents(ts: TimeSignature): D30Accent[] {
  const out = Array<D30Accent>(eighthsPerBar(ts)).fill('off');
  const starts = beatStarts(ts);
  const groups = groupBeats(ts);
  starts.forEach((at, i) => (out[at] = i === 0 ? 'bar' : groups.includes(i) ? 'group' : 'beat'));
  return out;
}

/** The clip's bars: at least `minBars` and `minSeconds` long, at most `maxBars`. */
export function d30Bars(ts: TimeSignature, eighthsPerMinute: number): number {
  const barSeconds = (eighthsPerBar(ts) * 60) / eighthsPerMinute;
  return Math.max(
    CONFIG.minBars,
    Math.min(CONFIG.maxBars, Math.ceil(CONFIG.minSeconds / barSeconds - 1e-9)),
  );
}

// --- Sound --------------------------------------------------------------------

/**
 * Open chords for strummed clips: the bass on the downbeat, another bass
 * (the 5th) on a later group's start, the upper strings on each beat, and
 * the top two strings, as an up-stroke catches them, between the beats.
 */
export interface D30Chord {
  name: string;
  bass: string;
  alt: string;
  upper: readonly string[];
  top: readonly string[];
}

export const D30_CHORDS: readonly D30Chord[] = [
  { name: 'E', bass: 'E2', alt: 'B2', upper: ['G#3', 'B3', 'E4'], top: ['B3', 'E4'] },
  { name: 'Em', bass: 'E2', alt: 'B2', upper: ['G3', 'B3', 'E4'], top: ['B3', 'E4'] },
  { name: 'A', bass: 'A2', alt: 'E2', upper: ['A3', 'C#4', 'E4'], top: ['C#4', 'E4'] },
  { name: 'Am', bass: 'A2', alt: 'E2', upper: ['A3', 'C4', 'E4'], top: ['C4', 'E4'] },
  { name: 'D', bass: 'D3', alt: 'A2', upper: ['A3', 'D4', 'F#4'], top: ['D4', 'F#4'] },
  { name: 'G', bass: 'G2', alt: 'D3', upper: ['G3', 'B3', 'G4'], top: ['B3', 'G4'] },
  { name: 'C', bass: 'C3', alt: 'G2', upper: ['G3', 'C4', 'E4'], top: ['C4', 'E4'] },
];

export type D30Drum = 'kick' | 'snare' | 'hat';

export interface D30DrumHit {
  /** Eighths from the clip's start. */
  at: number;
  drum: D30Drum;
  /** 0–1. */
  velocity: number;
}

export type D30Clip =
  | {
      style: 'strum';
      eighthsPerMinute: number;
      /** One stroke after another; each rings for its `eighths`. */
      strokes: { notes: string[]; eighths: number }[];
    }
  | {
      style: 'drums';
      eighthsPerMinute: number;
      hits: D30DrumHit[];
      /** Eighths from the start to the end of the last hit's ring. */
      length: number;
    };

/** Eighths the closing downbeat rings. */
const CLOSE_EIGHTHS = 4;

/** The hi-hat plays every eighth, louder on the stronger ones. */
const HAT_VELOCITY: Record<D30Accent, number> = { bar: 1, group: 0.85, beat: 0.7, off: 0.4 };

/** The downbeat and a later group's start are the kick; the other beats, the snare. */
const DRUM_ON: Record<D30Accent, D30Drum | null> = {
  bar: 'kick',
  group: 'kick',
  beat: 'snare',
  off: null,
};

function strokeNotes(chord: D30Chord, accent: D30Accent): string[] {
  switch (accent) {
    case 'bar':
      return [chord.bass, ...chord.upper];
    case 'group':
      return [chord.alt, ...chord.upper];
    case 'beat':
      return [...chord.upper];
    case 'off':
      return [...chord.top];
  }
}

/** Every eighth of the clip's bars, then the closing downbeat. */
function clipAccents(ts: TimeSignature, bars: number): D30Accent[] {
  const bar = d30Accents(ts);
  return [...Array.from({ length: bars }, () => bar).flat(), 'bar'];
}

/**
 * The clip of a meter, in the prompt's sound, chord and tempo. `meter`
 * defaults to the answer, played in the prompt's grouping; another meter
 * (the learner's wrong answer, to compare) is played in its usual grouping.
 */
export function d30Clip(prompt: D30Prompt, meter: EarMeter = prompt.meter): D30Clip {
  const signature =
    meter === prompt.meter ? prompt.signature : (D30_GROUPINGS[meter][0] as string);
  const ts = parseTimeSignature(signature);
  const accents = clipAccents(ts, d30Bars(ts, prompt.eighthsPerMinute));
  const { eighthsPerMinute } = prompt;
  if (prompt.style === 'strum') {
    const chord = D30_CHORDS[prompt.chord] ?? (D30_CHORDS[0] as D30Chord);
    return {
      style: 'strum',
      eighthsPerMinute,
      strokes: accents.map((a, i) => ({
        notes: strokeNotes(chord, a),
        eighths: i === accents.length - 1 ? CLOSE_EIGHTHS : 1,
      })),
    };
  }
  const hits = accents.flatMap((a, at): D30DrumHit[] => {
    const drum = DRUM_ON[a];
    const hat: D30DrumHit = { at, drum: 'hat', velocity: HAT_VELOCITY[a] };
    return drum ? [{ at, drum, velocity: 1 }, hat] : [hat];
  });
  return { style: 'drums', eighthsPerMinute, hits, length: accents.length - 1 + CLOSE_EIGHTHS };
}

/** Seconds a clip lasts, to the end of its closing downbeat. */
export function d30ClipSeconds(clip: D30Clip): number {
  const eighths =
    clip.style === 'strum' ? clip.strokes.reduce((s, k) => s + k.eighths, 0) : clip.length;
  return (eighths * 60) / clip.eighthsPerMinute;
}

// --- Notation, after the answer ----------------------------------------------------

export interface D30BeatNote {
  /** VexFlow's duration code: a quarter, an eighth or a half. */
  value: 'q' | '8' | 'h';
  dots: 0 | 1;
}

/**
 * One note per felt beat, for the staff in feedback: three quarters in 3/4,
 * two dotted quarters in 6/8, quarter, quarter, dotted quarter in 7/8
 * (2+2+3). The beat's own length shows how the bar is grouped, which is
 * what the ear just heard.
 */
export function d30BeatNotes(ts: TimeSignature): D30BeatNote[] {
  const starts = [...beatStarts(ts), eighthsPerBar(ts)];
  return starts.slice(0, -1).map((at, i) => {
    const eighths = (starts[i + 1] as number) - at;
    switch (eighths) {
      case 1:
        return { value: '8', dots: 0 };
      case 2:
        return { value: 'q', dots: 0 };
      case 3:
        return { value: 'q', dots: 1 };
      case 4:
        return { value: 'h', dots: 0 };
      case 6:
        return { value: 'h', dots: 1 };
      default:
        throw new RangeError(`D30 can't write a beat of ${eighths} eighths`);
    }
  });
}

// --- Keyboard -----------------------------------------------------------------

/** Keys for the buttons by position: the number row. */
const KEYBOARD = ['1', '2', '3', '4', '5', '6'];

export function d30KeyFor(index: number): string | undefined {
  return KEYBOARD[index];
}

/** Hardware-keyboard answers (design §7): the number row picks a button by position. */
export function d30KeyToAnswer(key: string, choices: readonly EarMeter[]): EarMeter | null {
  const i = KEYBOARD.indexOf(key);
  return i < 0 ? null : (choices[i] ?? null);
}
