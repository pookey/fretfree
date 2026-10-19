import { ENGINE_CONFIG } from '../../engine/config';
import {
  parseIntervalItemId,
  parseSpellChordItemId,
  parseSpellKeyItemId,
  type Item,
} from '../../engine/model';
import { pitchMatches } from '../../mic/tracker';
import type { PitchMatchMode } from '../../mic/types';
import {
  INTERVALS,
  allStrings,
  chordDegreeSemitones,
  chordFormula,
  chromaOf,
  intervalInfo,
  intervalSemitones,
  majorScale,
  midiAt,
  midiToFretNote,
  nameChord,
  noteAt,
  openStringMidi,
  positionForInterval,
  spellChord,
  stringCount,
  type AccidentalPref,
  type ChordKind,
  type FretRange,
  type IntervalName,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

/**
 * D17 "Play the interval, arpeggio or scale" (design §6): the mic drill that
 * turns screen knowledge into playing (research/02 rule 10). It reuses the
 * items of the skills it serves, asked the other way round, on the guitar:
 *
 * - `interval:M3@s6→s5` (C3): play the root, then the interval above it.
 * - `spell-key:F#` (C4): play the major scale, one octave up from the tonic.
 * - `spell-chord:m7@B` (C5): play the chord's notes one at a time, root up.
 *
 * Pitch identifies the pitch, not the string (design §6 mic constraint), so
 * any position counts: the first note may be the root in any octave, and
 * each later note is checked against the first, forgiving an octave error
 * (the detector's commonest mistake, design §9). The sequence is heard in
 * order; the first wrong note ends the attempt.
 */

export const D17_ID = 'play-sequence';

export type D17Kind = 'interval' | 'scale' | 'arpeggio';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), narrowest first:
 *
 * - `placed` (0): the root is marked on the neck, so the learner starts there.
 * - `anywhere` (1): only the root's name is given; finding it is part of the task.
 */
export type D17Scope = 'placed' | 'anywhere';

export const D17_SCOPES: readonly D17Scope[] = ['placed', 'anywhere'];
export const D17_SCOPE = { minLevel: 0, maxLevel: D17_SCOPES.length - 1 };

/** Each later note may be an octave off the expected pitch (design §9). */
export const D17_MATCH_MODE: PitchMatchMode = 'octave';

const CFG = ENGINE_CONFIG.playSequence;

export interface D17Step {
  /** The pitch in the fingering the prompt shows (any octave of it counts). */
  midi: number;
  /** The pitch class as the key or chord spells it, e.g. `E#`. */
  note: string;
  /** Its degree: `1`, `b3`, `7`. */
  label: string;
  /** Where the fingering plays it. */
  position: Position;
}

export interface D17Prompt {
  itemId: string;
  kind: D17Kind;
  /** The interval, for `interval` prompts. */
  interval: IntervalName | null;
  /** What is played: `major 3rd`, `F♯ major scale`, `Bm7`. */
  subject: string;
  /** In playing order, root first, rising. */
  steps: D17Step[];
  scope: D17Scope;
  /** The frets the fingering spans. */
  span: FretRange;
  /** A hand position of at least five frets round the fingering, for compact screens. */
  window: FretRange;
  mode: PitchMatchMode;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/**
 * The answer: the notes heard, as MIDI numbers, in order. These are the
 * credited notes, then the wrong one that ended the attempt (if any).
 */
export interface D17Answer {
  played: number[];
  /** "Show me": the learner asked for the answer instead of playing it. */
  gaveUp?: boolean;
  /**
   * Time from when the drill began listening to the answer, measured by the
   * view. The session's own timer also counts the mic starting up.
   */
  responseMs?: number;
}

export function d17ScopeFor(level: number): D17Scope {
  const i = Math.max(0, Math.min(D17_SCOPES.length - 1, Math.round(level)));
  return D17_SCOPES[i] as D17Scope;
}

/** Display form: `F#` → `F♯`, `Bb` → `B♭`. */
export function pretty(note: string): string {
  return note
    .replace(/##/g, '𝄪')
    .replace(/#/g, '♯')
    .replace(/(?<=.)bb/g, '𝄫')
    .replace(/(?<=.)b/g, '♭');
}

/** A degree label for display: `b3` → `♭3`. */
function degreeText(label: string): string {
  return label.replace(/^b/, '♭').replace(/^#/, '♯');
}

// --- Items ------------------------------------------------------------------

interface Plan {
  kind: D17Kind;
  interval: IntervalName | null;
  subject: string;
  /** The root's pitch class, or null when the root's position decides it (intervals). */
  root: string | null;
  /** Spelled notes, root first; intervals name theirs from the neck. */
  notes: string[];
  labels: string[];
  /** Half steps above the root, rising. */
  offsets: number[];
  /** Interval items keep their shape's strings. */
  strings: { from: number; to: number } | null;
}

function plan(item: Item): Plan | null {
  const interval = parseIntervalItemId(item.id);
  if (interval?.kind === 'interval') {
    const info = intervalInfo(interval.interval);
    return {
      kind: 'interval',
      interval: interval.interval,
      subject: info.long,
      root: null,
      notes: [],
      labels: ['1', info.degree],
      offsets: [0, intervalSemitones(interval.interval)],
      strings: { from: interval.from, to: interval.to },
    };
  }
  const key = parseSpellKeyItemId(item.id);
  if (key) {
    const scale = majorScale(key.tonic);
    return {
      kind: 'scale',
      interval: null,
      subject: `${pretty(key.tonic)} major scale`,
      root: key.tonic,
      notes: [...scale, scale[0] as string],
      labels: ['1', '2', '3', '4', '5', '6', '7', '1'],
      offsets: [0, 2, 4, 5, 7, 9, 11, 12],
      strings: null,
    };
  }
  const chord = parseSpellChordItemId(item.id);
  return chord ? arpeggioPlan(chord.root, chord.chord) : null;
}

function arpeggioPlan(root: string, kind: ChordKind): Plan {
  const formula = chordFormula(kind);
  return {
    kind: 'arpeggio',
    interval: null,
    subject: pretty(nameChord(root, kind)),
    root,
    notes: spellChord(root, kind),
    labels: [...formula],
    offsets: formula.map((d) => chordDegreeSemitones(d)),
    strings: null,
  };
}

export function d17CanTest(item: Item): boolean {
  return plan(item) !== null;
}

// --- Fingering --------------------------------------------------------------

/** The hand position for a root fret: a fret behind it to `handAbove` frets past it. */
export function d17Hand(rootFret: number): FretRange {
  return { from: Math.max(0, rootFret - 1), to: rootFret + CFG.handAbove };
}

/**
 * One way to play rising pitches from a root in a single hand position: each
 * note stays on the current string while it fits under the hand, then moves
 * to the next higher string. Null if a note doesn't fit.
 */
export function d17Fingering(
  root: Position,
  offsets: readonly number[],
  tuning: Tuning,
): Position[] | null {
  const hand = d17Hand(root.fret);
  const base = midiAt(root, tuning);
  const out: Position[] = [root];
  let string = root.string;
  for (const offset of offsets.slice(1)) {
    const midi = base + offset;
    let placed: Position | null = null;
    for (let s = string; s >= 1; s--) {
      const fret = midi - openStringMidi(s, tuning);
      if (fret >= hand.from && fret <= hand.to && fret <= CFG.maxFret) {
        placed = { string: s, fret };
        break;
      }
    }
    if (!placed) return null;
    out.push(placed);
    string = placed.string;
  }
  return out;
}

function intervalFingering(root: Position, p: Plan, tuning: Tuning): Position[] | null {
  const to = p.strings?.to ?? root.string;
  const upper = positionForInterval(root, p.interval as IntervalName, to, { tuning });
  if (!upper || upper.fret < 0 || upper.fret > CFG.maxFret) return null;
  return [root, upper];
}

/** Every root position a prompt may use, with its fingering. */
function placements(p: Plan, tuning: Tuning): Position[][] {
  const out: Position[][] = [];
  const strings = p.strings
    ? [p.strings.from]
    : // Scales and arpeggios start on one of the three lowest strings.
      allStrings(tuning).slice(-3);
  for (const string of strings) {
    for (let fret = CFG.rootFrets.from; fret <= CFG.rootFrets.to; fret++) {
      const root = { string, fret };
      if (p.root !== null && midiAt(root, tuning) % 12 !== chromaOf(p.root)) continue;
      const fingering =
        p.kind === 'interval'
          ? intervalFingering(root, p, tuning)
          : d17Fingering(root, p.offsets, tuning);
      if (fingering) out.push(fingering);
    }
  }
  return out;
}

function spanOf(positions: readonly Position[]): FretRange {
  const frets = positions.map((p) => p.fret);
  return { from: Math.min(...frets), to: Math.max(...frets) };
}

/** At least `size` frets round a span, kept within frets 0 to `maxFret`. */
export function d17Window(span: FretRange, size = 5): FretRange {
  const width = Math.max(size, span.to - span.from + 1);
  const ideal = span.from - Math.floor((width - (span.to - span.from + 1)) / 2);
  const from = Math.max(0, Math.min(ideal, CFG.maxFret - width + 1));
  return { from, to: from + width - 1 };
}

export function d17MakePrompt(item: Item, ctx: DrillContext): D17Prompt {
  const p = plan(item);
  const strings = stringCount(ctx.tuning);
  if (!p || (p.strings && (p.strings.from > strings || p.strings.to > strings))) {
    throw new Error(`D17 cannot test item ${item.id}`);
  }
  const options = placements(p, ctx.tuning);
  if (options.length === 0) throw new Error(`D17 cannot place item ${item.id} on the neck`);
  // A fresh root position each time: the same shape in many places (rule 12).
  const fingering = options[Math.min(options.length - 1, Math.floor(ctx.rng() * options.length))]!;
  const steps = fingering.map((position, i): D17Step => {
    const midi = midiAt(position, ctx.tuning);
    return {
      midi,
      note: p.notes[i] ?? noteAt(position, ctx.tuning, ctx.accidentalPref).pc,
      label: p.labels[i] as string,
      position,
    };
  });
  const span = spanOf(fingering);
  return {
    itemId: item.id,
    kind: p.kind,
    interval: p.interval,
    subject: p.subject,
    steps,
    scope: d17ScopeFor(ctx.scopeLevel),
    span,
    window: d17Window(span),
    mode: D17_MATCH_MODE,
    tuning: ctx.tuning,
    accidentalPref: ctx.accidentalPref,
  };
}

// --- Hearing the sequence ---------------------------------------------------

/**
 * What a heard note does, given the notes credited so far:
 *
 * - `next`: it is the next note (the root in any octave first, then each
 *   note's distance from the first, forgiving an octave error).
 * - `repeat`: it is a note already credited, re-picked or still ringing
 *   when another string takes over. Ignored, so it neither counts nor fails.
 * - `wrong`: anything else. The attempt ends.
 *
 * Rising sequences never repeat a pitch class back to back, so a held or
 * re-picked note is never mistaken for the next one. The scale's top tonic
 * is the root's pitch class, but it is checked as `next` first.
 */
export type D17Verdict = 'next' | 'repeat' | 'wrong';

export function d17Judge(prompt: D17Prompt, credited: readonly number[], midi: number): D17Verdict {
  const { steps, mode } = prompt;
  const root = steps[0] as D17Step;
  if (credited.length === 0) return pitchMatches(midi, root.midi, 'pitch-class') ? 'next' : 'wrong';
  if (credited.length >= steps.length) return 'repeat';
  const anchor = credited[0] as number;
  const step = steps[credited.length] as D17Step;
  if (pitchMatches(midi, anchor + (step.midi - root.midi), mode)) return 'next';
  if (credited.some((m) => pitchMatches(midi, m, mode))) return 'repeat';
  return 'wrong';
}

export type D17Status = 'listening' | 'done' | 'wrong';

/** Credits the heard notes in order: the notes counted, and where that leaves the attempt. */
export function d17Replay(
  prompt: D17Prompt,
  heard: readonly number[],
): { credited: number[]; wrong: number | null; status: D17Status } {
  const credited: number[] = [];
  for (const midi of heard) {
    const verdict = d17Judge(prompt, credited, midi);
    if (verdict === 'wrong') return { credited, wrong: midi, status: 'wrong' };
    if (verdict === 'next') credited.push(midi);
    if (credited.length === prompt.steps.length) return { credited, wrong: null, status: 'done' };
  }
  return { credited, wrong: null, status: 'listening' };
}

/**
 * Whether a stable note may answer the prompt, on the view's one clock
 * (`performance.now()`): it must start after the prompt appeared, so a string
 * still ringing from the last item can't answer this one, and not while the
 * session is playing the last answer back, so the speaker can't answer for
 * the learner (M5-01 and M5-02 reviews).
 */
export function d17Accepts(noteStart: number, shownAt: number, quietUntil: number): boolean {
  return noteStart >= shownAt && noteStart >= quietUntil;
}

/** How long the session's playback of a wrong answer's sounds lasts (`playNotes`). */
export function d17PlaybackMs(notes: number): number {
  return notes === 0 ? 0 : (notes - 1) * CFG.playbackGapMs + CFG.playbackTailMs;
}

// --- Plugin hooks -----------------------------------------------------------

function noteName(prompt: D17Prompt, i: number): string {
  return pretty((prompt.steps[i] as D17Step).note);
}

/** The expected sequence as the feedback bar shows it: `F♯ G♯ A♯ B C♯ D♯ E♯ F♯`. */
export function d17Expected(prompt: D17Prompt): string {
  return prompt.steps.map((_, i) => noteName(prompt, i)).join(' ');
}

function conceptOfPrompt(prompt: D17Prompt): string | null {
  return d17ConceptOf({ id: prompt.itemId, skillId: '' });
}

/** The confusion a wrong note shows: the other interval, or the other triad's 3rd (rule 6). */
function confusion(
  prompt: D17Prompt,
  credited: readonly number[],
  wrong: number,
): string | undefined {
  const anchor = credited[0];
  if (anchor === undefined) return undefined;
  const up = (((wrong - anchor) % 12) + 12) % 12;
  if (prompt.kind === 'interval' && credited.length === 1) {
    const name = (INTERVALS[up] as { name: IntervalName }).name;
    return up !== 0 && name !== prompt.interval ? name : undefined;
  }
  if (prompt.kind === 'arpeggio' && credited.length === 1) {
    const concept = conceptOfPrompt(prompt);
    if (concept === 'triad:maj' && up === 3) return 'triad:min';
    if (concept === 'triad:min' && up === 4) return 'triad:maj';
  }
  return undefined;
}

export function d17Check(prompt: D17Prompt, answer: D17Answer): DrillCheck {
  const expected = d17Expected(prompt);
  const concept = conceptOfPrompt(prompt);
  const base = concept ? { expected, concept } : { expected };
  if (answer.gaveUp) return { correct: false, ...base };
  const { credited, wrong, status } = d17Replay(prompt, answer.played);
  if (status === 'done') return { correct: true, ...base };
  const confusedWith = wrong === null ? undefined : confusion(prompt, credited, wrong);
  return { correct: false, ...base, ...(confusedWith ? { confusedWith } : {}) };
}

/**
 * Grade time per note played, after the detector's delay, so a scale meets
 * the same speed targets as an interval (§3.2). The view's own listening time
 * is used when there is one, so starting the mic doesn't count.
 */
export function d17GradedResponseMs(prompt: D17Prompt, answer: D17Answer, elapsedMs: number) {
  const ms = answer.responseMs ?? elapsedMs;
  return Math.max(0, ms - CFG.micLatencyMs) / Math.max(1, prompt.steps.length);
}

/**
 * A correct answer plays nothing: the learner has just heard it on the
 * guitar (rule 10), and a speaker sounding while the next prompt listens
 * would answer it. A miss plays the sequence, root first.
 */
export function d17Sounds(prompt: D17Prompt, fb: DrillFeedback<D17Answer>): DrillSounds {
  if (fb.result.correct) return { expected: [] };
  return { expected: prompt.steps.map((s) => midiToFretNote(s.midi, 'sharp').name) };
}

export function d17FeedbackPositions(
  prompt: D17Prompt,
  _fb: DrillFeedback<D17Answer>,
): { expected: Position[]; given: Position[] } {
  // The mic hears pitches, not positions, so a played note has no cell.
  return { expected: prompt.steps.map((s) => s.position), given: [] };
}

/** Major and minor triads use the seed pair `triad:maj` / `triad:min` (engine/confusions), as D7. */
function chordConcept(kind: ChordKind): string {
  if (kind === 'major') return 'triad:maj';
  if (kind === 'minor') return 'triad:min';
  return `chord:${kind}`;
}

export function d17ConceptOf(item: Item): string | null {
  const interval = parseIntervalItemId(item.id);
  if (interval?.kind === 'interval') return interval.interval;
  const key = parseSpellKeyItemId(item.id);
  if (key) return `key:${key.tonic}`;
  const chord = parseSpellChordItemId(item.id);
  if (chord) return chordConcept(chord.chord);
  return null;
}

/** Stored as `answerGiven`: the pitches heard, e.g. `F#3 G#3 A3`. */
export function d17DescribeAnswer(answer: D17Answer): string {
  const notes = answer.played.map((m) => midiToFretNote(m, 'sharp').name).join(' ');
  return answer.gaveUp ? `${notes} (show me)`.trim() : notes;
}

// --- Words ------------------------------------------------------------------

/** The task, e.g. `Play A, then the major 3rd above it.` */
export function d17Task(prompt: D17Prompt): string {
  const root = noteName(prompt, 0);
  switch (prompt.kind) {
    case 'interval':
      return `Play ${root}, then the ${prompt.subject} above it.`;
    case 'scale':
      return `Play the ${prompt.subject}, one octave up from ${root}.`;
    case 'arpeggio':
      return `Play ${prompt.subject} one note at a time, from ${root} up.`;
  }
}

/** Guide level 2 and up: how the sequence is built, never its notes. */
export function d17Hint(prompt: D17Prompt): string {
  switch (prompt.kind) {
    case 'interval': {
      const semis = intervalSemitones(prompt.interval as IntervalName);
      return `${semis} half step${semis === 1 ? '' : 's'} up from the root.`;
    }
    case 'scale':
      return 'Whole and half steps: W W H W W W H.';
    case 'arpeggio':
      return `Chord tones: ${prompt.steps.map((s) => degreeText(s.label)).join(' ')}.`;
  }
}

/** The worked example (a new item's first rep): one way to play it, shown on the neck. */
export function d17WorkedExample(prompt: D17Prompt): string {
  return `Here's one way: play the numbered dots in order, from the root. That's ${d17Expected(prompt)}.`;
}

/** What the feedback says under the prompt. */
export function d17Explain(prompt: D17Prompt, fb: DrillFeedback<D17Answer>): string {
  const expected = d17Expected(prompt);
  if (fb.result.correct) return `You played ${expected}.`;
  if (fb.answer.gaveUp) return `It goes ${expected}. Play it along once you've heard it.`;
  const { credited, wrong } = d17Replay(prompt, fb.answer.played);
  if (wrong === null) return `It goes ${expected}.`;
  const heard = pretty(midiToFretNote(wrong, prompt.accidentalPref).pc);
  const want = noteName(prompt, credited.length);
  if (credited.length === 0)
    return `You played ${heard}. Start on the root, ${want}. It goes ${expected}.`;
  const after = noteName(prompt, credited.length - 1);
  return `You played ${heard}. After ${after} comes ${want}. It goes ${expected}.`;
}
