import { ENGINE_CONFIG } from '../../engine/config';
import { parseFindItemId, parseOctaveItemId, type GuideLevel, type Item } from '../../engine/model';
import { pitchMatches } from '../../mic/tracker';
import type { PitchMatchMode } from '../../mic/types';
import {
  allStrings,
  chromaOf,
  chromaToPc,
  midiAt,
  midiToFretNote,
  noteAt,
  octaveOnString,
  positionsOfPitchClass,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { d4ConceptOf } from '../d4-octave-finder/logic';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

/**
 * D16 "Play the note" (design §6): the learner plays the note on a real
 * guitar and the mic grades it, the pure half of the drill.
 *
 * Mic constraint (design §6): pitch identifies the pitch, not the string. So
 * each prompt runs in one of three modes:
 *
 * - `pitch-class`: any octave of the named note counts. Scope level 0 of a
 *   find item ("Play A on string 6", any A), which also forgives an octave
 *   error by the detector while the learner starts out.
 * - `region`: the named string within frets 0–12, where the note has one
 *   pitch (two for the open string's note, at frets 0 and 12). Scope level 1
 *   of a find item. Only that pitch counts.
 * - `any-position`: an octave shape (`octave:s6f5→s4`). The octave is one
 *   pitch, and every position that sounds it counts: the prompt names the
 *   shape's string, but the mic can't hear strings.
 */

export const D16_ID = 'play-the-note';

export type D16Mode = 'pitch-class' | 'region' | 'any-position';

/** Adaptive scope for find items (design §3.3 step 4), most forgiving first. */
export const D16_SCOPES = ['pitch-class', 'region'] as const satisfies readonly D16Mode[];
export const D16_SCOPE = { minLevel: 0, maxLevel: D16_SCOPES.length - 1 };

export const D16_REGION: FretRange = { from: 0, to: 12 };

export interface D16Prompt {
  itemId: string;
  mode: D16Mode;
  /** The note to play, spelled per the accidental preference. */
  pc: string;
  /** The string the prompt names: the note's string, or the octave shape's. */
  string: number;
  /** The dot an octave shape starts from; null for a find item. */
  source: Position | null;
  /** Where the note is on `string` within the region; shown as feedback. */
  targets: Position[];
  /** The pitches that count, as MIDI numbers, low to high (any octave of them in `pitch-class`). */
  midis: number[];
  activeRange: FretRange;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The note the mic heard. */
export interface D16Answer {
  midi: number;
  /** Scientific pitch name, e.g. `A2`. */
  name: string;
  cents: number;
  /**
   * The time from when the prompt appeared, or the mic started if later, to
   * the note (`performance.now()`), so starting the mic isn't graded.
   */
  listenedMs?: number;
}

export function d16ModeFor(level: number): D16Mode {
  const i = Math.max(0, Math.min(D16_SCOPES.length - 1, Math.round(level)));
  return D16_SCOPES[i] as D16Mode;
}

export function d16MatchMode(mode: D16Mode): PitchMatchMode {
  return mode === 'pitch-class' ? 'pitch-class' : 'exact';
}

export function d16CanTest(item: Item): boolean {
  return parseFindItemId(item.id) !== null || parseOctaveItemId(item.id) !== null;
}

const uniqueMidis = (positions: readonly Position[], tuning: Tuning) =>
  [...new Set(positions.map((p) => midiAt(p, tuning)))].sort((a, b) => a - b);

export function d16MakePrompt(item: Item, ctx: DrillContext): D16Prompt {
  const { tuning, accidentalPref } = ctx;
  const n = stringCount(tuning);
  const base = { itemId: item.id, activeRange: D16_REGION, tuning, accidentalPref };

  const find = parseFindItemId(item.id);
  if (find && find.string <= n) {
    const targets = positionsOfPitchClass(find.pc, {
      tuning,
      fretRange: D16_REGION,
      strings: [find.string],
    });
    return {
      ...base,
      mode: d16ModeFor(ctx.scopeLevel),
      pc: chromaToPc(chromaOf(find.pc), accidentalPref),
      string: find.string,
      source: null,
      targets,
      midis: uniqueMidis(targets, tuning),
    };
  }

  const octave = parseOctaveItemId(item.id);
  const target =
    octave && octave.from.string <= n && octave.string <= n
      ? octaveOnString(octave.from, octave.string, tuning)
      : null;
  if (octave && target) {
    return {
      ...base,
      mode: 'any-position',
      pc: noteAt(octave.from, tuning, accidentalPref).pc,
      string: octave.string,
      source: octave.from,
      targets: [target],
      midis: [midiAt(target, tuning)],
    };
  }
  throw new Error(`D16 cannot test item ${item.id}`);
}

export function d16Check(prompt: D16Prompt, answer: D16Answer): DrillCheck {
  const mode = d16MatchMode(prompt.mode);
  if (prompt.midis.some((m) => pitchMatches(answer.midi, m, mode))) {
    return { correct: true, expected: prompt.pc };
  }
  const played = chromaToPc(answer.midi, prompt.accidentalPref);
  // An octave shape's concept is the shape; the wrong octave is no note confusion.
  return prompt.source === null && chromaOf(played) !== chromaOf(prompt.pc)
    ? { correct: false, expected: prompt.pc, confusedWith: played }
    : { correct: false, expected: prompt.pc };
}

export function d16DescribeAnswer(answer: D16Answer): string {
  return answer.name;
}

/**
 * The time to the stable note, less the detector's latency and the extra
 * time a guitar takes over a tap, so the usual speed targets apply
 * (research/02 rules 2–3; engine/config/playNote.ts). Timed from when the mic
 * was listening, so tapping "Start listening" and the permission prompt don't
 * count against the learner.
 */
export function d16GradedResponseMs(
  _prompt: D16Prompt,
  answer: D16Answer,
  elapsedMs: number,
): number {
  const { micLatencyMs, playAllowanceMs } = ENGINE_CONFIG.playNote;
  const ms = Math.min(elapsedMs, answer.listenedMs ?? elapsedMs);
  return Math.max(0, ms - micLatencyMs - playAllowanceMs);
}

/**
 * How long the session's feedback sounds play after a wrong answer, so the
 * view can ignore the speaker for that long (M5-05 review): notes spaced
 * `playbackGapMs` apart, the last ringing `playbackTailMs`.
 */
export function d16PlaybackMs(sounds: DrillSounds): number {
  const notes = sounds.expected.length + (sounds.given?.length ?? 0);
  const { playbackGapMs, playbackTailMs } = ENGINE_CONFIG.playNote;
  return notes === 0 ? 0 : (notes - 1) * playbackGapMs + playbackTailMs;
}

const nameOf = (prompt: D16Prompt, midi: number) =>
  midiToFretNote(midi, prompt.accidentalPref).name;

/**
 * Correct: nothing, since the learner just heard their own guitar (and a
 * sound ringing into the next prompt would be heard by the mic). Wrong: the
 * right pitch, then the one played (design §7). The session plays them
 * during feedback, before the next prompt, so they can't answer it.
 */
export function d16Sounds(prompt: D16Prompt, fb: DrillFeedback<D16Answer>): DrillSounds {
  if (fb.result.correct) return { expected: [] };
  const nearest = d16NearestMidi(prompt, fb.answer.midi);
  return { expected: [nameOf(prompt, nearest)], given: [fb.answer.name] };
}

/** The target pitch closest to what was played, so a wrong note is heard against the nearest right one. */
export function d16NearestMidi(prompt: D16Prompt, played: number): number {
  let best = prompt.midis[0] as number;
  for (const m of prompt.midis) if (Math.abs(m - played) < Math.abs(best - played)) best = m;
  return best;
}

/** Where the played note sits on the prompt's string within the region, if it does. */
function playedOnString(prompt: D16Prompt, midi: number): Position[] {
  const fret = midi - midiAt({ string: prompt.string, fret: 0 }, prompt.tuning);
  return fret >= prompt.activeRange.from && fret <= prompt.activeRange.to
    ? [{ string: prompt.string, fret }]
    : [];
}

/** Every right cell on the prompt's string, and the played note there when it was wrong. */
export function d16FeedbackPositions(
  prompt: D16Prompt,
  fb: DrillFeedback<D16Answer>,
): { expected: Position[]; given: Position[] } {
  return {
    expected: prompt.targets,
    given: fb.result.correct ? [] : playedOnString(prompt, fb.answer.midi),
  };
}

function fretList(frets: readonly number[]): string {
  if (frets.length <= 1) return `fret ${frets[0] ?? '–'}`;
  return `frets ${frets.slice(0, -1).join(', ')} and ${frets.at(-1)}`;
}

/** One line of feedback: where the note is, and what was heard when that differs. */
export function d16Explain(prompt: D16Prompt, fb: DrillFeedback<D16Answer>): string {
  const frets = fretList(prompt.targets.map((t) => t.fret));
  const where =
    prompt.source === null
      ? `${prompt.pc} is at ${frets} on string ${prompt.string}.`
      : `The octave of ${prompt.pc} on string ${prompt.source.string}, fret ${prompt.source.fret} is at ${frets} on string ${prompt.string}.`;
  const heard = `You played ${nameOf(prompt, fb.answer.midi)}.`;
  if (!fb.result.correct) return `${heard} ${where}`;
  // Pitch-class mode took another octave: say where the asked-for one is.
  return prompt.midis.includes(fb.answer.midi)
    ? where
    : `${heard} Any ${prompt.pc} counts. ${where}`;
}

/** What the mode lets count, said once under the prompt. */
export function d16ModeHint(prompt: D16Prompt): string {
  switch (prompt.mode) {
    case 'pitch-class':
      return `Any ${prompt.pc} counts, in any octave.`;
    case 'region':
      return `Frets ${prompt.activeRange.from}–${prompt.activeRange.to}. The mic hears the pitch, so the same note on another string counts too.`;
    case 'any-position':
      return 'The mic hears the pitch, so the same note on another string counts too.';
  }
}

export function d16ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const find = parseFindItemId(item.id);
  if (find) return chromaToPc(chromaOf(find.pc), ctx.accidentalPref);
  // Keyed as D4 keys it, so both drills share the shape's confusions.
  return d4ConceptOf(item, ctx);
}

/**
 * The guide level the neck is drawn at. Before an answer the open-string
 * names (guide level 2+) would show where a fret-0 answer is, so the neck
 * drops to inlays only when an open string has the note's pitch class.
 * Guided reps (worked examples) and feedback show everything.
 */
export function d16NeckGuideLevel(
  prompt: D16Prompt,
  guideLevel: GuideLevel,
  opts: { guided: boolean; answered: boolean },
): GuideLevel {
  if (opts.guided) return 3;
  if (opts.answered || guideLevel < 2) return guideLevel;
  const target = chromaOf(prompt.pc);
  const named = allStrings(prompt.tuning).some(
    (string) => noteAt({ string, fret: 0 }, prompt.tuning).chroma === target,
  );
  return named ? 1 : guideLevel;
}

/**
 * The compact window (design §7 iPhone): `size` frets of the region. Before
 * an answer it starts at the nut (or round an octave shape's dot), so it gives
 * nothing away; a worked example and feedback centre it on the answer.
 */
export function d16Window(prompt: D16Prompt, opts: { reveal: boolean; size: number }): FretRange {
  const bounds = prompt.activeRange;
  const frets = [
    ...(prompt.source ? [prompt.source.fret] : []),
    ...(opts.reveal ? prompt.targets.map((t) => t.fret) : []),
  ];
  const lo = frets.length ? Math.min(...frets) : bounds.from;
  const hi = frets.length ? Math.max(...frets) : bounds.from;
  const width = Math.min(bounds.to - bounds.from + 1, Math.max(opts.size, hi - lo + 1));
  const start = frets.length ? lo - Math.floor((width - (hi - lo + 1)) / 2) : bounds.from;
  const from = Math.max(bounds.from, Math.min(start, bounds.to - width + 1));
  return { from, to: from + width - 1 };
}
