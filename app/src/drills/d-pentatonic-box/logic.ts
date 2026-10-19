import { ENGINE_CONFIG } from '../../engine/config';
import { parsePentaItemId, pentaItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  NATURAL_PCS,
  STANDARD_TUNING,
  boxShape,
  cagedShape,
  chromaOf,
  chromaToPc,
  inRange,
  midiAt,
  nextBox,
  noteAt,
  openStringMidi,
  pentatonicBox,
  pentatonicScale,
  previousBox,
  relativeBoxNumber,
  samePosition,
  stringCount,
  type AccidentalPref,
  type BoxNumber,
  type CagedShapeName,
  type ChromaticDegree,
  type FretRange,
  type PentatonicQuality,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

/**
 * The pentatonic-box drill (C7, research/03 "overlay a box on its shape;
 * find the relative minor or major"), the pure half. It tests C7's cards:
 *
 * - `penta-box:1@minor` (overlay): the CAGED chord a box wraps is drawn on
 *   the neck, roots as squares, and the learner taps the rest of the box
 *   around it. Minor box 1 wraps the E shape of the minor chord.
 * - `penta-relative:1@minor`: the whole box is drawn, its own roots as
 *   squares, and the learner taps every root of the relative major in it.
 *
 * Box N is the same number for both qualities of the same root (minor box 1
 * and major box 1 both wrap the E shape); the same fingering read from the
 * relative key is `relativeBoxNumber` (A minor box 1 = C major box 5). The
 * UI always labels a box by its own root and quality.
 *
 * Each tap is marked at once, and the round answers at the last note, at
 * the first wrong tap, or on "Done" (as D9's shapes). The root and neck
 * position vary per prompt (rule 12). Confusions (rule 6): an overlay tap
 * in the neighbouring box is logged against that box's card, and a note of
 * the other quality's scale against the other quality's box; a relative tap
 * on the box's own root is logged against the relative card with the same
 * fingering. Every concept is the card's own ID, so pairing puts the two
 * cards side by side.
 *
 * Boxes are standard tuning. In another tuning each note keeps its pitch
 * and moves along its string, as D9's shapes do.
 */

export const DPB_ID = 'pentatonic-box';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): the roots a prompt
 * may use. `naturals` (0) roots on natural notes only; `all` (1) on any of
 * the 12 pitch classes, so the box lands at every position.
 */
export type DpbScope = 'naturals' | 'all';

export const DPB_SCOPES: readonly DpbScope[] = ['naturals', 'all'];
export const DPB_SCOPE = { minLevel: 0, maxLevel: DPB_SCOPES.length - 1 };

/** Boxes sit within frets 0–15, the whole neck the iPad shows. */
export const DPB_REGION: FretRange = { from: 0, to: 15 };

/** The frets iPad portrait shows at once: a 12-fret neck (design §7), 13 cells. */
export const DPB_REGULAR_SPAN = 12;

export type DpbMode = 'overlay' | 'relative';

export interface BoxNote extends Position {
  /** Spelled per the accidental preference. */
  pc: string;
  /** From the box's own root: 1 b3 4 5 b7 (minor) or 1 2 3 5 6 (major). */
  degree: ChromaticDegree;
}

export interface DpbPrompt {
  itemId: string;
  mode: DpbMode;
  box: BoxNumber;
  quality: PentatonicQuality;
  /** The box's root, spelled per the accidental preference. */
  root: string;
  /** The chord the box wraps: `Am`, `A`. */
  chord: string;
  /** The CAGED shape the box wraps. */
  shape: CagedShapeName;
  /** Every note of the box, low to high. */
  boxNotes: BoxNote[];
  /** What is drawn before an answer: the chord shape (overlay) or the whole box (relative). */
  given: BoxNote[];
  /** The notes to tap: the rest of the box, or the relative root's notes in it. */
  targets: BoxNote[];
  /** The relative scale: the same notes and frets read from the other root. */
  relative: { root: string; quality: PentatonicQuality; box: BoxNumber };
  /**
   * The boxes either side, placed next to this one (overlay only, else
   * empty): their notes this box lacks, so a tap there is that confusion.
   */
  neighbours: { box: BoxNumber; notes: Position[] }[];
  /** The frets the box spans. */
  span: FretRange;
  scope: DpbScope;
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The taps, in order. */
export type DpbAnswer = readonly Position[];

export function dpbScopeFor(level: number): DpbScope {
  const i = Math.max(0, Math.min(DPB_SCOPES.length - 1, Math.round(level)));
  return DPB_SCOPES[i] as DpbScope;
}

export function dpbCanTest(item: Item): boolean {
  return parsePentaItemId(item.id) !== null;
}

/** Display form: `F#` → `F♯`, `b3` → `♭3`, the root degree `1` → `R`. */
export function dpbDisplay(s: string): string {
  if (s === '1') return 'R';
  return s
    .replace(/^b(?=\d)/, '♭')
    .replace('#', '♯')
    .replace(/(?<=[A-G])b/, '♭');
}

export function dpbChordSymbol(root: string, quality: PentatonicQuality): string {
  return `${root}${quality === 'minor' ? 'm' : ''}`;
}

const otherQuality = (q: PentatonicQuality): PentatonicQuality =>
  q === 'minor' ? 'major' : 'minor';

/** Frets to add on each string so a standard-tuning note keeps its pitch in `tuning`. */
function retune<T extends Position>(notes: readonly T[], tuning: Tuning): T[] {
  return notes.map((n) => ({
    ...n,
    fret: n.fret + openStringMidi(n.string, STANDARD_TUNING) - openStringMidi(n.string, tuning),
  }));
}

const byPitch = (tuning: Tuning) => (a: Position, b: Position) =>
  midiAt(a, tuning) - midiAt(b, tuning);

const has = (notes: readonly Position[], p: Position) => notes.some((n) => samePosition(n, p));

interface Placement {
  /** The box's notes in the drill's tuning, with degrees. */
  notes: { string: number; fret: number; degree: ChromaticDegree }[];
  /** The chord shape it wraps, in the drill's tuning. */
  shape: Position[];
  /** The box's lowest fret in standard tuning, to place its neighbours. */
  from: number;
}

/**
 * The chord shape inside a box: the octave of the shape whose notes all lie
 * in it, or null. (`boxChordShape` places the shape from the box's lowest
 * fret, which misses shapes reaching below the box's first string, and
 * `boxAroundShape` throws for open shapes, so the drill checks containment
 * itself.)
 */
function shapeInBox(
  box: ReturnType<typeof pentatonicBox>,
  quality: PentatonicQuality,
): Position[] | null {
  const lowest = cagedShape(box.shape, box.root, { quality });
  for (let by = 0; lowest.rootFret + by <= box.span.to; by += 12) {
    const notes = lowest.notes.map((n) => ({ string: n.string, fret: n.fret + by }));
    if (notes.every((n) => has(box.notes, n))) return notes;
  }
  return null;
}

/** Every position of the box for `root` that holds its chord shape and fits in `region`. */
export function dpbPlacements(
  box: BoxNumber,
  quality: PentatonicQuality,
  root: string,
  tuning: Tuning,
  region: FretRange = DPB_REGION,
): Placement[] {
  const out: Placement[] = [];
  for (let minFret = 0; minFret <= region.to;) {
    let placed;
    try {
      placed = pentatonicBox(root, quality, box, { minFret });
    } catch {
      break; // No room above `minFret`.
    }
    minFret = placed.span.from + 1;
    const shape = shapeInBox(placed, quality);
    const notes = retune(placed.notes, tuning).map(({ string, fret, degree }) => ({
      string,
      fret,
      degree,
    }));
    if (!shape || !notes.every((n) => inRange(n.fret, region))) continue;
    out.push({ notes, shape: retune(shape, tuning), from: placed.span.from });
  }
  return out;
}

function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

/** The boxes either side of a placed box, as positions this box lacks. */
function neighboursOf(
  root: string,
  quality: PentatonicQuality,
  box: BoxNumber,
  placement: Placement,
  tuning: Tuning,
): DpbPrompt['neighbours'] {
  const own = placement.notes;
  const near = (b: BoxNumber, minFret: number) => {
    let placed;
    try {
      placed = pentatonicBox(root, quality, b, { minFret });
    } catch {
      return []; // No room for it at the top of the neck.
    }
    const notes = retune(placed.notes, tuning)
      .filter((n) => n.fret >= 0 && !has(own, n))
      .map((n) => ({ string: n.string, fret: n.fret }));
    return [{ box: b, notes }];
  };
  // The box below starts up to three frets lower; the one above starts higher.
  return [
    ...near(previousBox(box), Math.max(0, placement.from - 3)),
    ...near(nextBox(box), placement.from + 1),
  ];
}

export function dpbMakePrompt(item: Item, ctx: DrillContext): DpbPrompt {
  const ref = parsePentaItemId(item.id);
  const { tuning, accidentalPref } = ctx;
  if (!ref || stringCount(tuning) !== 6) throw new Error(`Pentatonic box cannot test ${item.id}`);
  const { box, quality } = ref;
  const scope = dpbScopeFor(ctx.scopeLevel);
  const roots = (scope === 'naturals' ? NATURAL_PCS.map(chromaOf) : [...Array(12).keys()])
    .map((chroma) => chromaToPc(chroma, accidentalPref))
    .filter((pc) => dpbPlacements(box, quality, pc, tuning).length > 0);
  const root = pick(roots, ctx.rng);
  const placement = root && pick(dpbPlacements(box, quality, root, tuning), ctx.rng);
  if (!root || !placement) throw new Error(`Pentatonic box cannot place ${item.id}`);

  const boxNotes: BoxNote[] = placement.notes
    .map((n) => ({ ...n, pc: noteAt(n, tuning, accidentalPref).pc }))
    .sort(byPitch(tuning));
  const mode: DpbMode = ref.kind === 'penta-box' ? 'overlay' : 'relative';
  const relChroma = (chromaOf(root) + (quality === 'minor' ? 3 : 9)) % 12;
  const inShape = (n: Position) => has(placement.shape, n);
  const frets = boxNotes.map((n) => n.fret);
  return {
    itemId: item.id,
    mode,
    box,
    quality,
    root,
    chord: dpbChordSymbol(root, quality),
    shape: boxShape(box),
    boxNotes,
    given: mode === 'overlay' ? boxNotes.filter(inShape) : boxNotes,
    targets:
      mode === 'overlay'
        ? boxNotes.filter((n) => !inShape(n))
        : boxNotes.filter((n) => chromaOf(n.pc) === relChroma),
    relative: {
      root: chromaToPc(relChroma, accidentalPref),
      quality: otherQuality(quality),
      box: relativeBoxNumber(box, quality),
    },
    neighbours: mode === 'overlay' ? neighboursOf(root, quality, box, placement, tuning) : [],
    span: { from: Math.min(...frets), to: Math.max(...frets) },
    scope,
    activeRange: DPB_REGION,
    tuning,
    accidentalPref,
  };
}

export function dpbIsLive(prompt: DpbPrompt, pos: Position): boolean {
  return inRange(pos.fret, prompt.activeRange);
}

/** Taps that are neither answers nor mistakes: an overlay's given chord notes. */
export function dpbIgnores(prompt: DpbPrompt, pos: Position): boolean {
  return prompt.mode === 'overlay' && has(prompt.given, pos);
}

export function dpbTargetAt(prompt: DpbPrompt, pos: Position): BoxNote | undefined {
  return prompt.targets.find((t) => samePosition(t, pos));
}

/** The targets among the taps, in tap order. */
export function dpbFound(prompt: DpbPrompt, taps: DpbAnswer): BoxNote[] {
  return taps.flatMap((p) => dpbTargetAt(prompt, p) ?? []);
}

/** The targets not tapped. */
export function dpbMissed(prompt: DpbPrompt, taps: DpbAnswer): BoxNote[] {
  return prompt.targets.filter((t) => !has(taps, t));
}

/** Taps that are not a target (an overlay's given notes are never an answer). */
export function dpbWrongTaps(prompt: DpbPrompt, taps: DpbAnswer): Position[] {
  return taps.filter((p) => !dpbTargetAt(prompt, p) && !dpbIgnores(prompt, p));
}

/** "Am pentatonic box 1", "C, the relative major of Am": the feedback bar's answer. */
export function dpbSubject(prompt: DpbPrompt): string {
  const chord = dpbDisplay(prompt.chord);
  if (prompt.mode === 'overlay') return `${chord} pentatonic box ${prompt.box}`;
  return `${dpbDisplay(prompt.relative.root)}, the relative ${prompt.relative.quality} of ${chord}`;
}

const chromaAt = (prompt: DpbPrompt, p: Position) => midiAt(p, prompt.tuning) % 12;

/** The box a wrong overlay tap belongs to, if it is a neighbour's note. */
export function dpbNeighbourAt(prompt: DpbPrompt, pos: Position): BoxNumber | undefined {
  return prompt.neighbours.find((n) => has(n.notes, pos))?.box;
}

/** True if the tap is a note of the other quality's pentatonic and not of this one. */
export function dpbInOtherQuality(prompt: DpbPrompt, pos: Position): boolean {
  const chroma = chromaAt(prompt, pos);
  const inScale = (q: PentatonicQuality) =>
    pentatonicScale(prompt.root, q).some((pc) => chromaOf(pc) === chroma);
  return !inScale(prompt.quality) && inScale(otherQuality(prompt.quality));
}

/** The card a wrong tap was confused with, keyed by item ID (the drill's concept). */
export function dpbConfusedWith(prompt: DpbPrompt, pos: Position): string | undefined {
  const { box, quality } = prompt;
  if (prompt.mode === 'relative') {
    if (chromaAt(prompt, pos) !== chromaOf(prompt.root) || !has(prompt.boxNotes, pos)) return;
    return pentaItemId('penta-relative', prompt.relative.box, prompt.relative.quality);
  }
  const neighbour = dpbNeighbourAt(prompt, pos);
  if (neighbour) return pentaItemId('penta-box', neighbour, quality);
  if (dpbInOtherQuality(prompt, pos)) return pentaItemId('penta-box', box, otherQuality(quality));
  return undefined;
}

export function dpbCheck(prompt: DpbPrompt, taps: DpbAnswer): DrillCheck {
  const expected = dpbSubject(prompt);
  const wrong = dpbWrongTaps(prompt, taps)[0];
  if (wrong) {
    const confusedWith = dpbConfusedWith(prompt, wrong);
    return confusedWith
      ? { correct: false, expected, confusedWith, concept: prompt.itemId }
      : { correct: false, expected };
  }
  return { correct: dpbMissed(prompt, taps).length === 0, expected };
}

export function dpbDescribeAnswer(taps: DpbAnswer): string {
  return taps.map((p) => `s${p.string}f${p.fret}`).join(' ') || 'none';
}

/** Completion time per note, so a whole box meets the usual speed targets (design §3.2). */
export function dpbGradedResponseMs(
  prompt: DpbPrompt,
  _taps: DpbAnswer,
  elapsedMs: number,
): number {
  return elapsedMs / Math.max(1, prompt.targets.length);
}

function names(prompt: DpbPrompt, positions: readonly Position[]): string[] {
  return positions.map((p) => noteAt(p, prompt.tuning, prompt.accidentalPref).name);
}

/**
 * The box played up from its lowest note (overlay), or up from the relative
 * root's lowest note to its highest, so the learner hears the box from the
 * other root (research/03 C7: "not hearing the root"). A wrong tap adds the
 * tapped note (design §7).
 */
export function dpbSounds(prompt: DpbPrompt, fb: DrillFeedback<DpbAnswer>): DrillSounds {
  let run: BoxNote[] = prompt.boxNotes;
  if (prompt.mode === 'relative') {
    const first = prompt.boxNotes.indexOf(prompt.targets[0] as BoxNote);
    const last = prompt.boxNotes.indexOf(prompt.targets[prompt.targets.length - 1] as BoxNote);
    run = prompt.boxNotes.slice(first, last + 1);
  }
  const expected = names(prompt, run);
  const wrong = dpbWrongTaps(prompt, fb.answer);
  return wrong.length > 0 ? { expected, given: names(prompt, wrong) } : { expected };
}

export function dpbFeedbackPositions(
  prompt: DpbPrompt,
  fb: DrillFeedback<DpbAnswer>,
): { expected: Position[]; given: Position[] } {
  return { expected: prompt.targets, given: dpbWrongTaps(prompt, fb.answer) };
}

/** The item's own ID: confusions pair one card with another (see the header). */
export function dpbConceptOf(item: Item): string | null {
  return dpbCanTest(item) ? item.id : null;
}

/** The degrees, low string first: "R ♭3 4 5 ♭7 R …". */
export function dpbDegreeLine(notes: readonly BoxNote[]): string {
  return notes.map((n) => dpbDisplay(n.degree)).join(' ');
}

function where(pos: Position): string {
  return `string ${pos.string}, fret ${pos.fret}`;
}

/** The interval from a root to its relative root, named for the feedback line. */
function relativeStep(prompt: DpbPrompt): string {
  return prompt.quality === 'minor' ? 'a minor 3rd up' : 'a minor 3rd down';
}

/** One line of feedback: what the box is, or what went wrong. */
export function dpbExplain(prompt: DpbPrompt, fb: DrillFeedback<DpbAnswer>): string {
  const chord = dpbDisplay(prompt.chord);
  const rel = `${dpbDisplay(prompt.relative.root)} ${prompt.relative.quality}`;
  const missed = dpbMissed(prompt, fb.answer).length;
  const left = missed > 0 ? ` ${missed} still to find, ringed on the neck.` : '';
  const wrong = dpbWrongTaps(prompt, fb.answer)[0];

  if (prompt.mode === 'overlay') {
    const what = `Box ${prompt.box} wraps the ${prompt.shape} shape of ${chord}.`;
    if (fb.result.correct) return `That's ${dpbSubject(prompt)}. ${what}`;
    if (!wrong) return `${what}${left}`;
    const tapped = `You tapped ${where(wrong)}`;
    const neighbour = dpbNeighbourAt(prompt, wrong);
    if (neighbour) return `${tapped}, in box ${neighbour}. ${what}`;
    if (dpbInOtherQuality(prompt, wrong)) {
      const other = otherQuality(prompt.quality);
      return `${tapped}: that note is in ${dpbDisplay(prompt.root)} ${other} pentatonic. ${what}`;
    }
    return `${tapped}, outside the box. ${what}`;
  }

  const rootName = dpbDisplay(prompt.relative.root);
  const what =
    `${rootName} is ${relativeStep(prompt)} from ${dpbDisplay(prompt.root)}: ` +
    `this box is also ${rel} box ${prompt.relative.box}.`;
  if (fb.result.correct) return `That's it. ${what}`;
  if (!wrong) return `${what}${left}`;
  const tapped = `You tapped ${where(wrong)}`;
  if (fb.result.confusedWith) return `${tapped}, the box's own root. ${what}`;
  if (!has(prompt.boxNotes, wrong)) return `${tapped}, outside the box. ${what}`;
  return `${tapped}. ${what}`;
}

/**
 * The found-note count shows its total only while guides are up (rule 9):
 * the total says how many notes are left to place.
 */
export function dpbShowsCount(guideLevel: GuideLevel, guided: boolean): boolean {
  return guided || guideLevel >= ENGINE_CONFIG.pentatonicBox.countGuideLevel;
}

/** Whether the prompt names the shape or the relative key (rule 9: hints fade). */
export function dpbShowsHint(guideLevel: GuideLevel, guided: boolean): boolean {
  return guided || guideLevel >= ENGINE_CONFIG.pentatonicBox.hintGuideLevel;
}

// --- Windows ---------------------------------------------------------------

/** The compact window: the box with room either side, clamped to the active range. */
export function dpbWindow(prompt: DpbPrompt, compactFrets: number): FretRange {
  const span = prompt.span.to - prompt.span.from + 1;
  const size = Math.max(ENGINE_CONFIG.pentatonicBox.compactWindowFrets, compactFrets, span + 2);
  const bounds = prompt.activeRange;
  const width = Math.min(size, bounds.to - bounds.from + 1);
  const centre = (prompt.span.from + prompt.span.to) / 2;
  const start = Math.max(
    bounds.from,
    Math.min(Math.round(centre - (width - 1) / 2), bounds.to - width + 1),
  );
  return { from: start, to: start + width - 1 };
}

/** iPad portrait's 12-fret neck: frets 0–12, slid up just far enough to hold the box. */
export function dpbRegularWindow(prompt: DpbPrompt): FretRange {
  const bounds = prompt.activeRange;
  const top = Math.min(bounds.to, Math.max(bounds.from + DPB_REGULAR_SPAN, prompt.span.to + 1));
  return { from: top - DPB_REGULAR_SPAN, to: top };
}
