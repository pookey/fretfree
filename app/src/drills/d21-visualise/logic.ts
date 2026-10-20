import { ENGINE_CONFIG } from '../../engine/config';
import { parseCagedItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  CAGED_ORDER,
  CAGED_QUALITIES,
  STANDARD_TUNING,
  chromaToPc,
  inRange,
  midiAt,
  noteAt,
  samePosition,
  stringCount,
  type AccidentalPref,
  type CagedQuality,
  type CagedShapeName,
  type Degree,
  type FretRange,
  type Position,
  type ShapeNote,
  type Tuning,
} from '../../theory';
import { d9ChordSymbol, d9DegreeLine, d9Display, d9StringSpan } from '../d9-build-caged/logic';
import { d10Placements } from '../d10-which-shape/logic';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D21_LEVELS, type D21Ask, type D21Level } from './meta';

export { D21_ID, D21_LEVELS, D21_SCOPE, d21CanTest, d21ConceptOf, type D21Ask } from './meta';

/**
 * D21 "Visualise it" (design §6), the pure half of the drill: mental practice
 * for when the guitar isn't to hand (research/02 rule 14). It tests C6's
 * whole-shape cards (`caged:A-shape@major`). The prompt names a shape and a
 * position, "picture the A shape at fret 5", and the neck stays blank: the
 * learner pictures the shape there and taps its roots (at the widest scope,
 * its 3rds or ♭7s). Nothing of the shape is drawn before the answer (rule 4).
 *
 * A shape's position is its lowest fret, where the barre or index finger
 * goes: the open chord slid up the neck, so the A shape at fret 5 is D
 * (x-5-7-7-7-5) and at fret 0 the open A. The position varies per prompt
 * (rule 12). The round answers at the last target, at the first wrong tap or
 * on "Done", as D9's does. A wrong tap where the shape sharing the root
 * string, at the same position, has the asked note (the C shape for the A
 * shape, G for E) is logged as that confusion, keyed `caged:<shape>` like
 * the seed pair (rule 6).
 *
 * Templates are standard tuning. In another tuning each note keeps its pitch
 * and moves along its string, as in D9, and the position is still the lowest
 * fret the shape uses.
 */

/** Shapes sit within frets 0–15, the whole neck the iPad shows. */
export const D21_REGION: FretRange = { from: 0, to: 15 };

/** The frets iPad portrait shows at once: a 12-fret neck (design §7), 13 cells. */
export const D21_REGULAR_SPAN = 12;

/** The shape sharing each shape's root string: the one it is confused with. */
const PARTNER: Partial<Record<CagedShapeName, CagedShapeName>> = {
  C: 'A',
  A: 'C',
  G: 'E',
  E: 'G',
};

/** The degrees each ask taps, in any quality. */
const ASK_DEGREES: Record<D21Ask, readonly Degree[]> = {
  root: ['R'],
  third: ['3', 'b3'],
  seventh: ['b7'],
};

export interface D21Prompt {
  itemId: string;
  shape: CagedShapeName;
  quality: CagedQuality;
  /** The shape's lowest fret: where it is pictured. */
  position: number;
  ask: D21Ask;
  /** The root, spelled per the accidental preference: feedback only. */
  root: string;
  /** The chord symbol, e.g. `D`, `Dm`, `D7`: feedback only. */
  chord: string;
  /** The notes to tap, low to high. */
  targets: ShapeNote[];
  /** Every note of the shape, low to high: feedback and sound. */
  shapeNotes: ShapeNote[];
  /**
   * The confusable shape at the same position (null for D, or where it
   * doesn't fit): where it has the asked notes, and the asked shape doesn't.
   */
  partner: { shape: CagedShapeName; targets: Position[] } | null;
  level: number;
  /** Frets that accept taps. */
  activeRange: FretRange;
  /**
   * The most frets any CAGED shape spans above its lowest, in this tuning
   * (3 in standard). Windows cover this much above the position, whatever
   * the shape, so they don't hint at its size.
   */
  span: number;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The taps, in order. */
export type D21Answer = readonly Position[];

export function d21LevelFor(level: number): D21Level {
  const i = Math.max(0, Math.min(D21_LEVELS.length - 1, Math.round(level)));
  return D21_LEVELS[i] as D21Level;
}

function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

const byPitch = (tuning: Tuning) => (a: Position, b: Position) =>
  midiAt(a, tuning) - midiAt(b, tuning);

const lowestFret = (notes: readonly Position[]) => Math.min(...notes.map((n) => n.fret));

interface Placed {
  root: string;
  notes: ShapeNote[];
  position: number;
}

/** Every placement of the shape in frets 0–15, at every root, with its position. */
export function d21Placements(
  shape: CagedShapeName,
  quality: CagedQuality,
  tuning: Tuning,
  accidentalPref: AccidentalPref,
): Placed[] {
  return [...Array(12).keys()].flatMap((chroma) => {
    const root = chromaToPc(chroma, accidentalPref);
    return d10Placements(shape, quality, root, tuning, D21_REGION).map((p) => ({
      root,
      notes: p.notes,
      position: lowestFret(p.notes),
    }));
  });
}

/** `d21Span` per tuning ID: it depends on the tuning alone. */
const SPANS = new Map<string, number>();

/** The most frets any shape spans above its lowest fret, in `tuning` (memoised). */
export function d21Span(tuning: Tuning): number {
  const known = SPANS.get(tuning.id);
  if (known !== undefined) return known;
  let span = 0;
  for (const shape of CAGED_ORDER) {
    for (const quality of CAGED_QUALITIES) {
      for (const p of d21Placements(shape, quality, tuning, 'sharp')) {
        span = Math.max(span, Math.max(...p.notes.map((n) => n.fret)) - p.position);
      }
    }
  }
  SPANS.set(tuning.id, span);
  return span;
}

const hasAsk = (notes: readonly ShapeNote[], ask: D21Ask) =>
  notes.some((n) => ASK_DEGREES[ask].includes(n.degree));

function partnerOf(
  shape: CagedShapeName,
  quality: CagedQuality,
  position: number,
  ask: D21Ask,
  own: readonly ShapeNote[],
  tuning: Tuning,
): D21Prompt['partner'] {
  const other = PARTNER[shape];
  if (!other) return null;
  const placed = d21Placements(other, quality, tuning, 'sharp').find(
    (p) => p.position === position,
  );
  if (!placed) return null;
  const targets = placed.notes
    .filter((n) => ASK_DEGREES[ask].includes(n.degree) && !own.some((o) => samePosition(o, n)))
    .map((n) => ({ string: n.string, fret: n.fret }));
  return { shape: other, targets };
}

export function d21MakePrompt(item: Item, ctx: DrillContext): D21Prompt {
  const ref = parseCagedItemId(item.id);
  const { tuning, accidentalPref } = ctx;
  if (ref?.kind !== 'caged' || stringCount(tuning) !== 6) {
    throw new Error(`D21 cannot test item ${item.id}`);
  }
  const level = d21LevelFor(ctx.scopeLevel);
  const placements = d21Placements(ref.shape, ref.quality, tuning, accidentalPref).filter(
    (p) => p.position <= level.maxPosition,
  );
  const placed = pick(placements, ctx.rng);
  const ask = pick(
    level.asks.filter((a) => placed && hasAsk(placed.notes, a)),
    ctx.rng,
  );
  if (!placed || !ask) throw new Error(`D21 cannot place item ${item.id}`);

  const shapeNotes = [...placed.notes].sort(byPitch(tuning));
  return {
    itemId: item.id,
    shape: ref.shape,
    quality: ref.quality,
    position: placed.position,
    ask,
    root: placed.root,
    chord: d9ChordSymbol(placed.root, ref.quality),
    targets: shapeNotes.filter((n) => ASK_DEGREES[ask].includes(n.degree)),
    shapeNotes,
    partner: partnerOf(ref.shape, ref.quality, placed.position, ask, shapeNotes, tuning),
    level: D21_LEVELS.indexOf(level),
    activeRange: D21_REGION,
    span: d21Span(tuning),
    tuning,
    accidentalPref,
  };
}

// --- Wording ---------------------------------------------------------------

/** "root", "3rd", "♭3", "♭7": one of the notes to tap. */
export function d21Noun(prompt: Pick<D21Prompt, 'ask' | 'quality'>): string {
  if (prompt.ask === 'root') return 'root';
  if (prompt.ask === 'seventh') return '♭7';
  return prompt.quality === 'minor' ? '♭3' : '3rd';
}

/** "at fret 5", or "in open position" at the nut. */
export function d21Where(position: number): string {
  return position === 0 ? 'in open position' : `at fret ${position}`;
}

/** "the A shape at fret 5": what the learner pictures. */
export function d21ShapeAt(prompt: Pick<D21Prompt, 'shape' | 'position'>): string {
  return `the ${prompt.shape} shape ${d21Where(prompt.position)}`;
}

/** "the A shape of D at fret 5": the feedback bar's answer. */
export function d21Subject(prompt: D21Prompt): string {
  return `the ${prompt.shape} shape of ${d9Display(prompt.chord)} ${d21Where(prompt.position)}`;
}

/** "Picture the A shape at fret 5, then tap every root." */
export function d21Question(prompt: D21Prompt): string {
  return `Picture ${d21ShapeAt(prompt)}, then tap every ${d21Noun(prompt)}.`;
}

/** Where the position is on the neck, without saying anything about the shape. */
export function d21PositionHint(prompt: Pick<D21Prompt, 'position'>): string {
  return prompt.position === 0
    ? 'Open position: the nut is where a barre would go.'
    : `Fret ${prompt.position} is its lowest fret, where the barre or first finger goes.`;
}

// --- Grading ---------------------------------------------------------------

export function d21TargetAt(prompt: D21Prompt, pos: Position): ShapeNote | undefined {
  return prompt.targets.find((t) => samePosition(t, pos));
}

export function d21IsLive(prompt: D21Prompt, pos: Position): boolean {
  return inRange(pos.fret, prompt.activeRange);
}

/** The targets among the taps, in tap order. */
export function d21Found(prompt: D21Prompt, taps: D21Answer): ShapeNote[] {
  return taps.flatMap((p) => d21TargetAt(prompt, p) ?? []);
}

/** The targets not tapped. */
export function d21Missed(prompt: D21Prompt, taps: D21Answer): ShapeNote[] {
  return prompt.targets.filter((t) => !taps.some((p) => samePosition(p, t)));
}

export function d21WrongTaps(prompt: D21Prompt, taps: D21Answer): Position[] {
  return taps.filter((p) => !d21TargetAt(prompt, p));
}

/** True if the partner shape, at the same position, has the asked note there. */
export function d21InPartner(prompt: D21Prompt, pos: Position): boolean {
  return prompt.partner?.targets.some((n) => samePosition(n, pos)) ?? false;
}

export function d21Check(prompt: D21Prompt, taps: D21Answer): DrillCheck {
  const expected = d21Subject(prompt);
  const wrong = d21WrongTaps(prompt, taps)[0];
  if (wrong) {
    return prompt.partner && d21InPartner(prompt, wrong)
      ? {
          correct: false,
          expected,
          confusedWith: `caged:${prompt.partner.shape}`,
          concept: `caged:${prompt.shape}`,
        }
      : { correct: false, expected };
  }
  return { correct: d21Missed(prompt, taps).length === 0, expected };
}

export function d21DescribeAnswer(taps: D21Answer): string {
  return taps.map((p) => `s${p.string}f${p.fret}`).join(' ') || 'none';
}

/** Completion time per target, so the usual speed targets apply (design §3.2). */
export function d21GradedResponseMs(
  prompt: D21Prompt,
  _taps: D21Answer,
  elapsedMs: number,
): number {
  return elapsedMs / Math.max(1, prompt.targets.length);
}

function names(prompt: D21Prompt, positions: readonly Position[]): string[] {
  const sorted = [...positions].sort(byPitch(prompt.tuning));
  return [...new Set(sorted.map((p) => noteAt(p, prompt.tuning, prompt.accidentalPref).name))];
}

/**
 * The whole chord, low to high, so the pictured shape is heard as well as
 * seen and named; a wrong tap adds the tapped note (design §7, rule 10).
 */
export function d21Sounds(prompt: D21Prompt, fb: DrillFeedback<D21Answer>): DrillSounds {
  const expected = names(prompt, prompt.shapeNotes);
  const wrong = d21WrongTaps(prompt, fb.answer);
  return wrong.length > 0 ? { expected, given: names(prompt, wrong) } : { expected };
}

export function d21FeedbackPositions(
  prompt: D21Prompt,
  fb: DrillFeedback<D21Answer>,
): { expected: Position[]; given: Position[] } {
  return { expected: prompt.targets, given: d21WrongTaps(prompt, fb.answer) };
}

/** "root", "3rd", "♭3", "5th", "♭7". */
export function d21DegreeName(degree: Degree): string {
  if (degree === 'R') return 'root';
  if (degree === '3') return '3rd';
  if (degree === '5') return '5th';
  return d9Display(degree);
}

function where(pos: Position): string {
  return `string ${pos.string}, fret ${pos.fret}`;
}

/** One line of feedback: the shape's degrees, or what went wrong. */
export function d21Explain(prompt: D21Prompt, fb: DrillFeedback<D21Answer>): string {
  const notes = prompt.shapeNotes;
  const shape = `${d21Subject(prompt)}: ${d9DegreeLine(notes)} from ${d9StringSpan(notes.map((n) => n.string))}.`;
  if (fb.result.correct) return `That's ${shape}`;
  const wrong = d21WrongTaps(prompt, fb.answer)[0];
  const missed = d21Missed(prompt, fb.answer).length;
  const left = missed > 0 ? ` ${missed} still to find, ringed on the neck.` : '';
  if (!wrong) return `It's ${shape}${left}`;
  const noun = d21Noun(prompt);
  const own = notes.find((n) => samePosition(n, wrong));
  let why = '';
  if (fb.result.confusedWith && prompt.partner) {
    why = ` That's a ${noun} of the ${prompt.partner.shape} shape ${d21Where(prompt.position)}.`;
  } else if (own) {
    why = ` That's the shape's ${d21DegreeName(own.degree)}, not a ${noun}.`;
  }
  return `You tapped ${where(wrong)}.${why} It's ${shape}`;
}

/** Feedback and found notes are drawn by degree, in shape as well as colour. */
export function d21DegreeStyle(degree: Degree): 'root' | 'third' | 'fifth' | 'seventh' {
  if (degree === 'R') return 'root';
  if (degree === '5') return 'fifth';
  if (degree === 'b7') return 'seventh';
  return 'third';
}

/** The found count shows its total only while guides are up (rule 9). */
export function d21ShowsCount(guideLevel: GuideLevel, guided: boolean): boolean {
  return guided || guideLevel >= ENGINE_CONFIG.visualise.countGuideLevel;
}

// --- Windows ---------------------------------------------------------------

/**
 * The compact window: from a fret below the position, wide enough for any
 * shape there, so its width doesn't say which shape it is.
 */
export function d21Window(prompt: D21Prompt, compactFrets: number): FretRange {
  const bounds = prompt.activeRange;
  const size = Math.max(ENGINE_CONFIG.visualise.compactWindowFrets, compactFrets, prompt.span + 2);
  const width = Math.min(size, bounds.to - bounds.from + 1);
  const start = Math.max(bounds.from, Math.min(prompt.position - 1, bounds.to - width + 1));
  return { from: start, to: start + width - 1 };
}

/**
 * iPad portrait's 12-fret neck: frets 0–12, slid up just far enough that any
 * shape at the position fits. It follows the position alone.
 */
export function d21RegularWindow(prompt: D21Prompt): FretRange {
  const bounds = prompt.activeRange;
  const top = Math.min(
    bounds.to,
    Math.max(bounds.from + D21_REGULAR_SPAN, prompt.position + prompt.span),
  );
  return { from: top - D21_REGULAR_SPAN, to: top };
}

// --- Context panel ---------------------------------------------------------

/**
 * The shape in open position in standard tuning: the picture to slide up the
 * neck. Plain notes, so it doesn't mark the roots the learner is to find.
 */
export function d21OpenShape(prompt: Pick<D21Prompt, 'shape' | 'quality'>): ShapeNote[] {
  const open = d21Placements(prompt.shape, prompt.quality, STANDARD_TUNING, 'sharp').find(
    (p) => p.position === 0,
  );
  return open ? open.notes : [];
}

/** "x-0-2-2-2-0": frets from string 6 to string 1, `x` for a muted string. */
export function d21FretLine(notes: readonly Position[]): string {
  return [6, 5, 4, 3, 2, 1].map((s) => notes.find((n) => n.string === s)?.fret ?? 'x').join('-');
}
