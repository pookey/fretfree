import { ENGINE_CONFIG } from '../../engine/config';
import type { StringSetLow } from '../../engine/items/inversion';
import {
  VOICE_LEAD_CHORDS,
  parseVoiceLeadItemId,
  voiceLeadItemId,
  type VoiceLeadChord,
} from '../../engine/items/voice-lead';
import type { Item } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import {
  COMMON_MAJOR_KEY_TONICS,
  NATURAL_PCS,
  chordFromNumeral,
  chromaOf,
  inRange,
  majorKey,
  midiAt,
  noteAt,
  samePosition,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Inversion,
  type Position,
  type ShapeNote,
  type TriadVoicing,
  type Tuning,
} from '../../theory';
import {
  D18_INVERSIONS,
  D18_REGION,
  D18_REGULAR_SPAN,
  d18DegreeStyle,
  d18Display,
  d18InversionName,
  d18StringSpan,
  d18Tone,
  d18Voicings,
} from '../d18-inversions/logic';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D19_SCOPES, type D19Scope } from './meta';

export { D19_ID, D19_SCOPE, D19_SCOPES, d19CanTest, d19ConceptOf, type D19Scope } from './meta';

/**
 * D19 "Voice-leading puzzle" (design §6), the pure half of the drill. It
 * tests I1's voice-leading cards (research/03: "voice-lead I–IV–V"):
 * `voice-lead:I-IV@s3` draws a I triad on strings 3–1, in some key and
 * inversion, and the learner taps the IV nearest it on the same strings.
 *
 * Each string carries one voice, so a voice moves as many semitones as its
 * note moves frets. The nearest voicing holds any note the chords share and
 * moves every other note by a step: no voice moves more than 2 frets, and
 * exactly one inversion of the next chord does that (`d19Nearest`). That is
 * the puzzle's answer: the learner taps all three of its notes, the held
 * note included. Each tap is marked at once; the round answers at the last
 * note, at the first wrong tap, or on "Done" (as D18).
 *
 * The voicings are D18's (`d18Voicings`, frets 0–15), so the inversions D19
 * moves between are the ones D18 teaches. A tap on a note of the key's third
 * chord, one in neither triad (asked I → IV, the B or D of V), is logged as
 * a confusion with that move (`voice-lead:I-V@s3`), so IV and V interleave
 * (rule 6).
 */

/** The neck the iPad shows: D18's, so every inversion fits at every root within it. */
export const D19_REGION: FretRange = D18_REGION;

/** The furthest a voice moves in the nearest voicing, in frets: a whole step. */
export const D19_MAX_MOVE = 2;

const NUMERAL_OF: Record<VoiceLeadChord, string> = { I: 'I', IV: 'IV', V: 'V' };

export interface D19Prompt {
  itemId: string;
  from: VoiceLeadChord;
  to: VoiceLeadChord;
  lowString: StringSetLow;
  /** The set's strings, low to high pitch: [3, 2, 1]. */
  strings: number[];
  /** The key's tonic: `C`, `F#`. */
  key: string;
  /** Each of I, IV and V's roots in the key. */
  roots: Record<VoiceLeadChord, string>;
  /** The starting triad, low to high, with its degrees. */
  fromNotes: ShapeNote[];
  fromInversion: Inversion;
  /** The nearest voicing of the next chord, low to high: the notes to tap. */
  targets: ShapeNote[];
  toInversion: Inversion;
  /** The key's third chord, neither from nor to. */
  other: VoiceLeadChord;
  /** Its pitch classes in neither triad (B and D for I → IV in C): a tap on one is that move. */
  otherChromas: number[];
  scope: D19Scope;
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

export interface D19Answer {
  readonly taps: readonly Position[];
}

/** One voice's move, low string first. */
export interface D19Move {
  string: number;
  from: ShapeNote;
  to: ShapeNote;
  /** Frets (semitones) up; negative is down. */
  frets: number;
}

export function d19ScopeFor(level: number): D19Scope {
  const i = Math.max(0, Math.min(D19_SCOPES.length - 1, Math.round(level)));
  return D19_SCOPES[i] as D19Scope;
}

/** The keys a scope serves: natural tonics, or one spelling of each of the 12 (no G♭ or C♭). */
export function d19Keys(scope: D19Scope): readonly string[] {
  return scope === 'naturals'
    ? COMMON_MAJOR_KEY_TONICS.filter((t) => NATURAL_PCS.includes(t))
    : COMMON_MAJOR_KEY_TONICS;
}

/** I, IV and V's roots in a major key, spelled for the key: F♯ → B and C♯. */
export function d19Roots(key: string): Record<VoiceLeadChord, string> {
  const k = majorKey(key);
  const root = (n: VoiceLeadChord) => chordFromNumeral(k, NUMERAL_OF[n]).root;
  return { I: root('I'), IV: root('IV'), V: root('V') };
}

/** The voice moves from one triad to another on the same set, low string first. */
export function d19MovesBetween(from: readonly ShapeNote[], to: readonly ShapeNote[]): D19Move[] {
  return from.map((n, i) => {
    const t = to[i] as ShapeNote;
    return { string: n.string, from: n, to: t, frets: t.fret - n.fret };
  });
}

/**
 * The voicing of `root`'s major triad nearest `from` on the same set: the
 * one inversion whose every voice moves at most `D19_MAX_MOVE` frets. Null
 * when it would fall off the region (near the nut or fret 15).
 */
export function d19Nearest(
  from: TriadVoicing,
  root: string,
  lowString: StringSetLow,
  tuning: Tuning,
): TriadVoicing | null {
  const near = D18_INVERSIONS.flatMap((inv) =>
    d18Voicings(root, 'major', lowString, inv, tuning),
  ).filter((v) =>
    d19MovesBetween(from.notes, v.notes).every((m) => Math.abs(m.frets) <= D19_MAX_MOVE),
  );
  return near.length === 1 ? (near[0] as TriadVoicing) : null;
}

function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

interface Start {
  from: TriadVoicing;
  to: TriadVoicing;
}

/** Every starting voicing of `root` in this inversion whose nearest next chord fits the region. */
function starts(
  fromRoot: string,
  toRoot: string,
  inversion: Inversion,
  lowString: StringSetLow,
  tuning: Tuning,
): Start[] {
  return d18Voicings(fromRoot, 'major', lowString, inversion, tuning).flatMap((from) => {
    const to = d19Nearest(from, toRoot, lowString, tuning);
    return to ? [{ from, to }] : [];
  });
}

export function d19MakePrompt(item: Item, ctx: DrillContext): D19Prompt {
  const ref = parseVoiceLeadItemId(item.id);
  const { tuning, accidentalPref } = ctx;
  if (!ref || stringCount(tuning) !== 6) throw new Error(`D19 cannot test item ${item.id}`);
  const { from, to, lowString } = ref;
  const scope = d19ScopeFor(ctx.scopeLevel);
  const placeable = (key: string, inv: Inversion) => {
    const roots = d19Roots(key);
    return starts(roots[from], roots[to], inv, lowString, tuning);
  };
  const keys = d19Keys(scope).filter((k) => D18_INVERSIONS.some((inv) => placeable(k, inv).length));
  const key = pick(keys, ctx.rng);
  if (key === undefined) throw new Error(`D19 cannot place item ${item.id}`);
  // Every key in `keys` places at least one inversion, and each of those a start.
  const inversion = pick(
    D18_INVERSIONS.filter((inv) => placeable(key, inv).length),
    ctx.rng,
  ) as Inversion;
  const start = pick(placeable(key, inversion), ctx.rng) as Start;

  const roots = d19Roots(key);
  const other = VOICE_LEAD_CHORDS.find((c) => c !== from && c !== to) as VoiceLeadChord;
  const chromas = (c: VoiceLeadChord) =>
    [0, 4, 7].map((semis) => (chromaOf(roots[c]) + semis) % 12);
  const inTriads = new Set([...chromas(from), ...chromas(to)]);
  return {
    itemId: item.id,
    from,
    to,
    lowString,
    strings: [lowString, lowString - 1, lowString - 2],
    key,
    roots,
    fromNotes: [...start.from.notes],
    fromInversion: start.from.inversion,
    targets: [...start.to.notes],
    toInversion: start.to.inversion,
    other,
    otherChromas: chromas(other).filter((c) => !inTriads.has(c)),
    scope,
    activeRange: D19_REGION,
    tuning,
    accidentalPref,
  };
}

// --- Rounds ----------------------------------------------------------------

export function d19IsLive(prompt: D19Prompt, pos: Position): boolean {
  return inRange(pos.fret, prompt.activeRange);
}

export function d19TargetAt(prompt: D19Prompt, pos: Position): ShapeNote | undefined {
  return prompt.targets.find((t) => samePosition(t, pos));
}

/** The targets among the taps, in tap order. */
export function d19Found(prompt: D19Prompt, taps: readonly Position[]): ShapeNote[] {
  return taps.flatMap((p) => d19TargetAt(prompt, p) ?? []);
}

/** The targets not tapped. */
export function d19Missed(prompt: D19Prompt, taps: readonly Position[]): ShapeNote[] {
  return prompt.targets.filter((t) => !taps.some((p) => samePosition(p, t)));
}

/** Taps that are not a target. */
export function d19WrongTaps(prompt: D19Prompt, taps: readonly Position[]): Position[] {
  return taps.filter((p) => !d19TargetAt(prompt, p));
}

/** The voice moves of the answer, low string first. */
export function d19Moves(prompt: D19Prompt): D19Move[] {
  return d19MovesBetween(prompt.fromNotes, prompt.targets);
}

/** A chord by its numeral in the prompt's key, for display: `F`, `C♯`. */
export function d19Chord(prompt: D19Prompt, chord: VoiceLeadChord): string {
  return d18Display(prompt.roots[chord]);
}

/** "F in 2nd inversion on strings 3–1": the feedback bar's answer. */
export function d19Subject(prompt: D19Prompt): string {
  const chord = d19Chord(prompt, prompt.to);
  const where = d18StringSpan(prompt.lowString);
  return prompt.toInversion === 0
    ? `${chord} in root position on ${where}`
    : `${chord} in ${d18InversionName(prompt.toInversion).toLowerCase()} on ${where}`;
}

export function d19Check(prompt: D19Prompt, answer: D19Answer): DrillCheck {
  const expected = d19Subject(prompt);
  const wrong = d19WrongTaps(prompt, answer.taps)[0];
  if (wrong) {
    const chroma = midiAt(wrong, prompt.tuning) % 12;
    return prompt.otherChromas.includes(chroma)
      ? {
          correct: false,
          expected,
          confusedWith: voiceLeadItemId(prompt.from, prompt.other, prompt.lowString),
          concept: prompt.itemId,
        }
      : { correct: false, expected };
  }
  return { correct: d19Missed(prompt, answer.taps).length === 0, expected };
}

export function d19DescribeAnswer(answer: D19Answer): string {
  return answer.taps.map((p) => `s${p.string}f${p.fret}`).join(' ') || 'none';
}

/** A round grades its completion time per note, so the usual speed targets apply (design §3.2). */
export function d19GradedResponseMs(
  prompt: D19Prompt,
  _answer: D19Answer,
  elapsedMs: number,
): number {
  return elapsedMs / Math.max(1, prompt.targets.length);
}

function names(prompt: D19Prompt, positions: readonly Position[]): string[] {
  const sorted = [...positions].sort((a, b) => midiAt(a, prompt.tuning) - midiAt(b, prompt.tuning));
  return sorted.map((p) => noteAt(p, prompt.tuning, prompt.accidentalPref).name);
}

/**
 * The move as heard: the starting triad, then the nearest next one, each low
 * to high (sound, sight and name together); a wrong tap adds the tapped note.
 */
export function d19Sounds(prompt: D19Prompt, fb: DrillFeedback<D19Answer>): DrillSounds {
  const expected = [...names(prompt, prompt.fromNotes), ...names(prompt, prompt.targets)];
  const wrong = d19WrongTaps(prompt, fb.answer.taps);
  return wrong.length > 0 ? { expected, given: names(prompt, wrong) } : { expected };
}

export function d19FeedbackPositions(
  prompt: D19Prompt,
  fb: DrillFeedback<D19Answer>,
): { expected: Position[]; given: Position[] } {
  return { expected: prompt.targets, given: d19WrongTaps(prompt, fb.answer.taps) };
}

/** A note of a triad on the neck, spelled as its chord spells it. */
export function d19NoteName(prompt: D19Prompt, chord: VoiceLeadChord, note: ShapeNote): string {
  return d18Tone(prompt.roots[chord], 'major', note.degree);
}

function fretsWord(n: number): string {
  return Math.abs(n) === 1 ? '1 fret' : `${Math.abs(n)} frets`;
}

/** "C stays", "E up 1 fret to F". */
export function d19MoveLine(prompt: D19Prompt, move: D19Move): string {
  const from = d19NoteName(prompt, prompt.from, move.from);
  const to = d19NoteName(prompt, prompt.to, move.to);
  if (move.frets === 0) return `${from} stays`;
  return `${from} ${move.frets > 0 ? 'up' : 'down'} ${fretsWord(move.frets)} to ${to}`;
}

/** "C stays, E up 1 fret to F, G up 2 frets to A". */
export function d19MovesLine(prompt: D19Prompt): string {
  return d19Moves(prompt)
    .map((m) => d19MoveLine(prompt, m))
    .join(', ');
}

function where(pos: Position): string {
  return `string ${pos.string}, fret ${pos.fret}`;
}

/** Why a wrong tap is wrong: a note of the other chord, a far note of the right one, or one held. */
function wrongWhy(prompt: D19Prompt, wrong: Position, confused: boolean): string {
  const pc = d18Display(noteAt(wrong, prompt.tuning, prompt.accidentalPref).pc);
  const to = d19Chord(prompt, prompt.to);
  if (confused) {
    return ` That's ${pc}, a note of ${d19Chord(prompt, prompt.other)} (${prompt.other}), not ${to}.`;
  }
  const held = prompt.fromNotes.find((n) => samePosition(n, wrong));
  if (held) {
    const move = d19Moves(prompt).find((m) => m.string === wrong.string) as D19Move;
    return ` That holds ${d19NoteName(prompt, prompt.from, held)}, which moves to ${d19NoteName(prompt, prompt.to, move.to)}.`;
  }
  const chroma = midiAt(wrong, prompt.tuning) % 12;
  const toChromas = prompt.targets.map((t) => midiAt(t, prompt.tuning) % 12);
  if (toChromas.includes(chroma)) return ` That's ${pc}, a note of ${to}, but not the nearest one.`;
  return ` That's ${pc}, not a note of ${to}.`;
}

/** One line of feedback: how each voice moves, or what went wrong. */
export function d19Explain(prompt: D19Prompt, fb: DrillFeedback<D19Answer>): string {
  const answer = `${d19Subject(prompt)}: ${d19MovesLine(prompt)}.`;
  if (fb.result.correct) return `That's ${answer}`;
  const wrong = d19WrongTaps(prompt, fb.answer.taps)[0];
  if (!wrong) {
    const missed = d19Missed(prompt, fb.answer.taps).length;
    return `It's ${answer} ${missed} still to find.`;
  }
  const why = wrongWhy(prompt, wrong, Boolean(fb.result.confusedWith));
  return `You tapped ${where(wrong)}.${why} It's ${answer}`;
}

/** The answer's notes are drawn by degree, in shape as well as colour. */
export const d19DegreeStyle = d18DegreeStyle;

// --- Windows ---------------------------------------------------------------

/** The frets a prompt must show: the starting triad, and every fret a voice could move to. */
function needed(prompt: D19Prompt): FretRange {
  const frets = prompt.fromNotes.map((n) => n.fret);
  return {
    from: Math.max(prompt.activeRange.from, Math.min(...frets) - D19_MAX_MOVE),
    to: Math.min(prompt.activeRange.to, Math.max(...frets) + D19_MAX_MOVE),
  };
}

/**
 * The neck shown: the whole region on iPad landscape; iPad portrait's
 * 12-fret neck slid just far enough to hold what's needed; compact screens a
 * window centred on the starting triad. Each window holds 2 frets either
 * side of the triad, so it never hints at which way the next chord lies.
 */
export function d19Window(
  prompt: D19Prompt,
  sizeClass: SizeClass,
  compactFrets: number,
): FretRange {
  const bounds = prompt.activeRange;
  if (sizeClass === 'regular-wide') return bounds;
  const need = needed(prompt);
  if (sizeClass === 'regular') {
    const top = Math.min(bounds.to, Math.max(bounds.from + D18_REGULAR_SPAN, need.to));
    return { from: top - D18_REGULAR_SPAN, to: top };
  }
  const size = Math.max(
    ENGINE_CONFIG.voiceLeading.compactWindowFrets,
    compactFrets,
    need.to - need.from + 1,
  );
  const width = Math.min(size, bounds.to - bounds.from + 1);
  const centre = Math.floor((need.from + need.to) / 2);
  const start = Math.max(
    bounds.from,
    Math.min(centre - Math.floor(width / 2), bounds.to - width + 1),
  );
  return { from: start, to: start + width - 1 };
}
