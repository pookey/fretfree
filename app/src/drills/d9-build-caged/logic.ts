import { ENGINE_CONFIG } from '../../engine/config';
import { parseCagedItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  NATURAL_PCS,
  STANDARD_TUNING,
  cagedShape,
  chromaOf,
  chromaToPc,
  inRange,
  midiAt,
  noteAt,
  openStringMidi,
  samePosition,
  stringCount,
  triadCore,
  type AccidentalPref,
  type CagedQuality,
  type CagedShape,
  type CagedShapeName,
  type Degree,
  type FretRange,
  type Position,
  type ShapeNote,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D9_SCOPES, type D9Scope } from './meta';

export { D9_ID, D9_SCOPE, D9_SCOPES, d9CanTest, d9ConceptOf, type D9Scope } from './meta';

/**
 * D9 "Build the CAGED shape at a root" (design §6), the pure half of the
 * drill. It tests C6's cards:
 *
 * - `caged-core:A-shape@major`: tap the A shape's triad core (research/03:
 *   triads first, they are the cores of the shapes);
 * - `caged:A-shape@major`: tap the whole A shape.
 *
 * The root is drawn on the shape's root string (the square) and the learner
 * taps the rest of the template around it. Each card is one template; the
 * root and neck position vary per prompt (research/02 rule 12). Each tap is
 * marked at once, and the round answers at the last note, at the first wrong
 * tap, or on "Done" (as D4's every-octave rounds). A wrong tap that lands in
 * the shape sharing the root string (C ↔ A on string 5, G ↔ E on string 6)
 * is logged as that confusion (rule 6), keyed `caged:<shape>` like the seed
 * pair.
 *
 * Templates are standard tuning. In another tuning each note keeps its pitch
 * and moves along its string, so drop D adds two frets on string 6.
 */

/**
 * Shapes sit within frets 0–15, the whole neck the iPad shows, so every shape
 * fits at every root (the D shape of C at frets 10–13 closes the C chain).
 * iPad portrait and compact screens show a window that follows the root.
 */
export const D9_REGION: FretRange = { from: 0, to: 15 };

/** The frets iPad portrait shows at once: a 12-fret neck (design §7), 13 cells. */
export const D9_REGULAR_SPAN = 12;

/** The shape sharing each shape's root string: the one it is confused with. */
const PARTNER: Partial<Record<CagedShapeName, CagedShapeName>> = {
  C: 'A',
  A: 'C',
  G: 'E',
  E: 'G',
};

export interface D9Prompt {
  itemId: string;
  part: 'core' | 'shape';
  shape: CagedShapeName;
  quality: CagedQuality;
  /** The root, spelled per the accidental preference. */
  root: string;
  /** The chord symbol, e.g. `C`, `Cm`, `C7`. */
  chord: string;
  /** The given root on the shape's root string (the square). Never a target. */
  anchor: ShapeNote;
  /** The notes to tap. */
  targets: ShapeNote[];
  /** Strings the targets are on, low to high pitch (e.g. [3, 2, 1] for a core). */
  strings: number[];
  /** Every note of the whole shape, anchor included, low to high: feedback and sound. */
  shapeNotes: ShapeNote[];
  /**
   * The confusable shape on the same root string, at the same root (null for
   * D): its notes that the asked shape lacks.
   */
  partner: { shape: CagedShapeName; notes: Position[] } | null;
  scope: D9Scope;
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  /**
   * The furthest any CAGED shape reaches from its root, in frets, in this
   * tuning (3 in standard, 5 in drop D). Windows cover this either side of
   * the root, so they never show which way the asked shape faces.
   */
  reach: number;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The taps, in order. */
export type D9Answer = readonly Position[];

export function d9ScopeFor(level: number): D9Scope {
  const i = Math.max(0, Math.min(D9_SCOPES.length - 1, Math.round(level)));
  return D9_SCOPES[i] as D9Scope;
}

/** Display form: `F#` → `F♯`, `b3` → `♭3`. */
export function d9Display(s: string): string {
  return s
    .replace(/^b(?=\d)/, '♭')
    .replace('#', '♯')
    .replace(/(?<=[A-G])b/, '♭');
}

export function d9ChordSymbol(root: string, quality: CagedQuality): string {
  return `${root}${quality === 'minor' ? 'm' : quality === 'dominant7' ? '7' : ''}`;
}

/** Frets to add on each string so a standard-tuning note keeps its pitch in `tuning`. */
function retune<T extends Position>(notes: readonly T[], tuning: Tuning): T[] {
  return notes.map((n) => ({
    ...n,
    fret: n.fret + openStringMidi(n.string, STANDARD_TUNING) - openStringMidi(n.string, tuning),
  }));
}

/** The shape moved along the neck so its root sits at `rootFret` (standard tuning). */
function shiftShape(s: CagedShape, rootFret: number): CagedShape {
  const by = rootFret - s.rootFret;
  return { ...s, rootFret, notes: s.notes.map((n) => ({ ...n, fret: n.fret + by })) };
}

const byPitch = (tuning: Tuning) => (a: Position, b: Position) =>
  midiAt(a, tuning) - midiAt(b, tuning);

interface Placement {
  shape: CagedShape;
  /** The shape's notes in the drill's tuning. */
  notes: ShapeNote[];
}

/** Every position of the shape for `root` whose notes all fit in `region`. */
export function d9Placements(
  shape: CagedShapeName,
  quality: CagedQuality,
  root: string,
  tuning: Tuning,
  region: FretRange = D9_REGION,
): Placement[] {
  const lowest = cagedShape(shape, root, { quality });
  const out: Placement[] = [];
  for (let k = 0; lowest.rootFret + 12 * k <= region.to + 3; k++) {
    const s = shiftShape(lowest, lowest.rootFret + 12 * k);
    const notes = retune(s.notes, tuning);
    if (notes.every((n) => inRange(n.fret, region))) out.push({ shape: s, notes });
  }
  return out;
}

function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

/** The partner shape's notes at the same root that are not in the asked shape (the root is shared). */
const SHAPE_NAMES: readonly CagedShapeName[] = ['C', 'A', 'G', 'E', 'D'];
const QUALITIES: readonly CagedQuality[] = ['major', 'minor', 'dominant7'];

/** The furthest a note of any shape lies from its root square, in `tuning`. */
export function d9Reach(tuning: Tuning): number {
  let reach = 0;
  for (const shape of SHAPE_NAMES) {
    for (const quality of QUALITIES) {
      const s = cagedShape(shape, 'C', { quality, minFret: 6 });
      const notes = retune(s.notes, tuning);
      const anchor = notes.find((n) => n.string === s.rootString) as ShapeNote;
      for (const n of notes) reach = Math.max(reach, Math.abs(n.fret - anchor.fret));
    }
  }
  return reach;
}

function partnerOf(
  placed: CagedShape,
  own: readonly Position[],
  tuning: Tuning,
): D9Prompt['partner'] {
  const other = PARTNER[placed.shape];
  if (!other) return null;
  const lowest = cagedShape(other, placed.root, { quality: placed.quality });
  const notes = retune(shiftShape(lowest, placed.rootFret).notes, tuning).filter(
    (n) => n.fret >= 0 && !own.some((o) => samePosition(o, n)),
  );
  return { shape: other, notes: notes.map((n) => ({ string: n.string, fret: n.fret })) };
}

export function d9MakePrompt(item: Item, ctx: DrillContext): D9Prompt {
  const ref = parseCagedItemId(item.id);
  const { tuning, accidentalPref } = ctx;
  if (!ref || stringCount(tuning) !== 6) throw new Error(`D9 cannot test item ${item.id}`);
  const scope = d9ScopeFor(ctx.scopeLevel);
  const roots = (scope === 'naturals' ? NATURAL_PCS.map(chromaOf) : [...Array(12).keys()])
    .map((chroma) => chromaToPc(chroma, accidentalPref))
    .filter((pc) => d9Placements(ref.shape, ref.quality, pc, tuning).length > 0);
  const root = pick(roots, ctx.rng);
  const placement = root && pick(d9Placements(ref.shape, ref.quality, root, tuning), ctx.rng);
  if (!root || !placement) throw new Error(`D9 cannot place item ${item.id}`);

  const placed = placement.shape;
  const tuned = (ns: readonly ShapeNote[]) => retune(ns, tuning).sort(byPitch(tuning));
  const shapeNotes = tuned(placed.notes);
  const anchor = shapeNotes.find((n) => n.string === placed.rootString) as ShapeNote;
  const part = ref.kind === 'caged-core' ? 'core' : 'shape';
  const targets =
    part === 'core'
      ? tuned(triadCore(placed).notes)
      : shapeNotes.filter((n) => !samePosition(n, anchor));
  return {
    itemId: item.id,
    part,
    shape: ref.shape,
    quality: ref.quality,
    root,
    chord: d9ChordSymbol(root, ref.quality),
    anchor,
    targets,
    strings: targets.map((t) => t.string),
    shapeNotes,
    partner: partnerOf(placed, shapeNotes, tuning),
    scope,
    activeRange: D9_REGION,
    reach: d9Reach(tuning),
    tuning,
    accidentalPref,
  };
}

export function d9IsLive(prompt: D9Prompt, pos: Position): boolean {
  return inRange(pos.fret, prompt.activeRange);
}

export function d9TargetAt(prompt: D9Prompt, pos: Position): ShapeNote | undefined {
  return prompt.targets.find((t) => samePosition(t, pos));
}

/** The targets among the taps, in tap order. */
export function d9Found(prompt: D9Prompt, taps: D9Answer): ShapeNote[] {
  return taps.flatMap((p) => d9TargetAt(prompt, p) ?? []);
}

/** The targets not tapped. */
export function d9Missed(prompt: D9Prompt, taps: D9Answer): ShapeNote[] {
  return prompt.targets.filter((t) => !taps.some((p) => samePosition(p, t)));
}

/** Taps that are not a target (the given root is never an answer). */
export function d9WrongTaps(prompt: D9Prompt, taps: D9Answer): Position[] {
  return taps.filter((p) => !d9TargetAt(prompt, p) && !samePosition(p, prompt.anchor));
}

/** True if the tap belongs to the shape that shares the root string. */
export function d9InPartner(prompt: D9Prompt, pos: Position): boolean {
  return prompt.partner?.notes.some((n) => samePosition(n, pos)) ?? false;
}

/** "the A shape of C", "the A-shape triad of Cm": the feedback bar's answer. */
export function d9Subject(prompt: D9Prompt): string {
  const chord = d9Display(prompt.chord);
  return prompt.part === 'core'
    ? `the ${prompt.shape}-shape triad of ${chord}`
    : `the ${prompt.shape} shape of ${chord}`;
}

export function d9Check(prompt: D9Prompt, taps: D9Answer): DrillCheck {
  const expected = d9Subject(prompt);
  const wrong = d9WrongTaps(prompt, taps)[0];
  if (wrong) {
    return prompt.partner && d9InPartner(prompt, wrong)
      ? {
          correct: false,
          expected,
          confusedWith: `caged:${prompt.partner.shape}`,
          concept: `caged:${prompt.shape}`,
        }
      : { correct: false, expected };
  }
  return { correct: d9Missed(prompt, taps).length === 0, expected };
}

export function d9DescribeAnswer(taps: D9Answer): string {
  return taps.map((p) => `s${p.string}f${p.fret}`).join(' ') || 'none';
}

/** Completion time per note, so a whole shape meets the usual speed targets (design §3.2). */
export function d9GradedResponseMs(prompt: D9Prompt, _taps: D9Answer, elapsedMs: number): number {
  return elapsedMs / Math.max(1, prompt.targets.length);
}

function names(prompt: D9Prompt, positions: readonly Position[]): string[] {
  const sorted = [...positions].sort(byPitch(prompt.tuning));
  return [...new Set(sorted.map((p) => noteAt(p, prompt.tuning, prompt.accidentalPref).name))];
}

/**
 * The chord, low to high: the root and the notes built (sound, sight and name
 * together); a wrong tap adds the tapped note (design §7).
 */
export function d9Sounds(prompt: D9Prompt, fb: DrillFeedback<D9Answer>): DrillSounds {
  const expected = names(prompt, [prompt.anchor, ...prompt.targets]);
  const wrong = d9WrongTaps(prompt, fb.answer);
  return wrong.length > 0 ? { expected, given: names(prompt, wrong) } : { expected };
}

export function d9FeedbackPositions(
  prompt: D9Prompt,
  fb: DrillFeedback<D9Answer>,
): { expected: Position[]; given: Position[] } {
  return { expected: prompt.targets, given: d9WrongTaps(prompt, fb.answer) };
}

/** "strings 3–1". */
export function d9StringSpan(strings: readonly number[]): string {
  const lo = Math.max(...strings);
  const hi = Math.min(...strings);
  return lo === hi ? `string ${lo}` : `strings ${lo}–${hi}`;
}

/** The degrees, low string first: "R 5 R 3 5". */
export function d9DegreeLine(notes: readonly ShapeNote[]): string {
  return [...notes]
    .sort((a, b) => b.string - a.string)
    .map((n) => d9Display(n.degree))
    .join(' ');
}

function where(pos: Position): string {
  return `string ${pos.string}, fret ${pos.fret}`;
}

/** Why the partner differs: the shapes share the root string but face opposite ways. */
function partnerWhy(prompt: D9Prompt): string {
  const other = prompt.partner?.shape;
  if (!other) return '';
  const below = (s: CagedShapeName) => s === 'C' || s === 'G';
  const toward = (s: CagedShapeName) => (below(s) ? 'back toward the nut' : 'up from the root');
  return (
    `That note is in the ${other} shape. Both root on string ${prompt.anchor.string}: ` +
    `the ${prompt.shape} shape reaches ${toward(prompt.shape)}, the ${other} shape ${toward(other)}.`
  );
}

/** One line of feedback: the shape's degrees, or what went wrong. */
export function d9Explain(prompt: D9Prompt, fb: DrillFeedback<D9Answer>): string {
  const notes = prompt.part === 'core' ? prompt.targets : prompt.shapeNotes;
  const shape = `${d9Subject(prompt)}: ${d9DegreeLine(notes)} from ${d9StringSpan(notes.map((n) => n.string))}.`;
  if (fb.result.correct) return `That's ${shape}`;
  const wrong = d9WrongTaps(prompt, fb.answer)[0];
  const missed = d9Missed(prompt, fb.answer).length;
  const left = missed > 0 ? ` ${missed} still to find, ringed on the neck.` : '';
  if (!wrong) return `It's ${shape}${left}`;
  const tapped = `You tapped ${where(wrong)}.`;
  const why = fb.result.confusedWith ? ` ${partnerWhy(prompt)}` : '';
  return `${tapped}${why} It's ${shape}`;
}

/** Feedback and found notes are drawn by degree, in shape as well as colour. */
export function d9DegreeStyle(degree: Degree): 'root' | 'third' | 'fifth' | 'seventh' {
  if (degree === 'R') return 'root';
  if (degree === '5') return 'fifth';
  if (degree === 'b7') return 'seventh';
  return 'third';
}

/**
 * The found-note count shows its total only while guides are up (rule 9):
 * the total says how many notes the shape has.
 */
export function d9ShowsCount(guideLevel: GuideLevel, guided: boolean): boolean {
  return guided || guideLevel >= ENGINE_CONFIG.buildCaged.countGuideLevel;
}

// --- Windows ---------------------------------------------------------------

/**
 * The compact window: centred on the root and wide enough for any shape
 * either side of it (in standard tuning C and G reach 3 frets below, A, E and
 * D up to 3 above), so the window never shows which way the shape faces.
 */
export function d9Window(prompt: D9Prompt, compactFrets: number): FretRange {
  const size = Math.max(
    ENGINE_CONFIG.buildCaged.compactWindowFrets,
    compactFrets,
    2 * prompt.reach + 1,
  );
  const bounds = prompt.activeRange;
  const width = Math.min(size, bounds.to - bounds.from + 1);
  const start = Math.max(
    bounds.from,
    Math.min(prompt.anchor.fret - Math.floor(width / 2), bounds.to - width + 1),
  );
  return { from: start, to: start + width - 1 };
}

/**
 * iPad portrait's 12-fret neck: frets 0–12, slid up just far enough that
 * every shape at this root fits (the D shape of C shows frets 1–13). It
 * follows the root alone, so it doesn't hint at the shape's direction.
 */
export function d9RegularWindow(prompt: D9Prompt): FretRange {
  const bounds = prompt.activeRange;
  const top = Math.min(
    bounds.to,
    Math.max(bounds.from + D9_REGULAR_SPAN, prompt.anchor.fret + prompt.reach),
  );
  return { from: top - D9_REGULAR_SPAN, to: top };
}
