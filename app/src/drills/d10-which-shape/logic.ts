import { ENGINE_CONFIG } from '../../engine/config';
import { parseCagedItemId, type GuideLevel, type Item } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import {
  CAGED_ORDER,
  NATURAL_PCS,
  STANDARD_TUNING,
  cagedShape,
  chromaOf,
  chromaToPc,
  inRange,
  midiAt,
  nextCagedShape,
  noteAt,
  openStringMidi,
  previousCagedShape,
  shapeSpan,
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
import { chordKeySpelling } from '../../theory/key-spelling';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D10_LEVELS, type D10Level } from './meta';

export { D10_ID, D10_LEVELS, D10_SCOPE, d10CanTest, d10ConceptOf, type D10Level } from './meta';

/**
 * D10 "Which shape, and which comes next?" (design §6), the pure half of the
 * drill. It tests C6's whole-shape cards (`caged:A-shape@major`) by choice,
 * the naming direction of D9's build (research/02 rule 1). Three questions:
 *
 * - `name`: the shape is drawn at a root; which CAGED shape is it?
 * - `next`: the shape before it in the chain is drawn and named; which shape
 *   comes next up the neck?
 * - `previous`: the shape after it is drawn and named; which comes before,
 *   down the neck?
 *
 * Every question's answer is the card's shape, so a chain question recalls
 * the shape from its neighbour. That grades the answer shape's card by the
 * template grain (design §3.1) without the learner seeing that shape, so
 * naming questions outweigh chain ones (`engine/config/whichShape.ts`); a
 * chain item kind of its own is a later engine change. The root, the neck position and the question
 * vary per prompt (rule 12). Triad cores are left to D9: a core alone doesn't
 * name its shape (the C and D cores on strings 3–1 are the same grip).
 *
 * Naming the C shape where the A shape was drawn (or any wrong name) is
 * logged as that confusion, keyed `caged:<shape>` like D9 and the seed pair
 * (rule 6). Templates are standard tuning; in another tuning each note keeps
 * its pitch and moves along its string, as in D9.
 */

export type D10Ask = 'name' | 'next' | 'previous';

export const D10_ASKS: readonly D10Ask[] = ['name', 'next', 'previous'];

/** Shapes sit within frets 0–15, the whole neck the iPad shows. */
export const D10_REGION: FretRange = { from: 0, to: 15 };

/** The frets iPad portrait shows at once: a 12-fret neck (design §7), 13 cells. */
export const D10_REGULAR_SPAN = 12;

/** The string each shape's root square sits on, in every quality. */
const ROOT_STRING: Record<CagedShapeName, number> = { C: 5, A: 5, G: 6, E: 6, D: 4 };

/** The shape sharing each shape's root string: the one it is confused with. */
const PARTNER: Partial<Record<CagedShapeName, CagedShapeName>> = {
  C: 'A',
  A: 'C',
  G: 'E',
  E: 'G',
};

/** One shape at one root and neck position. */
export interface D10Placement {
  shape: CagedShapeName;
  rootString: number;
  /** The notes in the drill's tuning, low to high pitch. */
  notes: ShapeNote[];
  /** The standard-tuning fret span, which orders the chain. */
  span: FretRange;
}

export interface D10Prompt {
  itemId: string;
  ask: D10Ask;
  /** The answer: the card's shape. */
  shape: CagedShapeName;
  quality: CagedQuality;
  /** The root, spelled from the chord's key (`chordKeySpelling`): B♭, never A♯. */
  root: string;
  /** The chord symbol, e.g. `C`, `Cm`, `C7`. */
  chord: string;
  /** The shape drawn on the neck: the answer when naming, its neighbour otherwise. */
  shown: D10Placement;
  /** The answer shape at this root, beside `shown` (the same placement when naming). */
  answer: D10Placement;
  /** The shapes to choose from, in CAGED order. */
  choices: CagedShapeName[];
  level: number;
  /** Frets that are live; the neck dims the rest (design §7). */
  activeRange: FretRange;
  tuning: Tuning;
  /** How notes are named: the chord's key spelling (`chordKeySpelling`), not just the setting. */
  accidentalPref: AccidentalPref;
}

export type D10Answer = CagedShapeName;

export function d10LevelFor(level: number): D10Level {
  const i = Math.max(0, Math.min(D10_LEVELS.length - 1, Math.round(level)));
  return D10_LEVELS[i] as D10Level;
}

/** Display form: `F#` → `F♯`, `b3` → `♭3`. */
export function d10Display(s: string): string {
  return s
    .replace(/^b(?=\d)/, '♭')
    .replace('#', '♯')
    .replace(/(?<=[A-G])b/, '♭');
}

export function d10ChordSymbol(root: string, quality: CagedQuality): string {
  return `${root}${quality === 'minor' ? 'm' : quality === 'dominant7' ? '7' : ''}`;
}

const byPitch = (tuning: Tuning) => (a: Position, b: Position) =>
  midiAt(a, tuning) - midiAt(b, tuning);

/** Frets to add on each string so a standard-tuning note keeps its pitch in `tuning`. */
function retune(notes: readonly ShapeNote[], tuning: Tuning): ShapeNote[] {
  return notes.map((n) => ({
    ...n,
    fret: n.fret + openStringMidi(n.string, STANDARD_TUNING) - openStringMidi(n.string, tuning),
  }));
}

/** Every position of the shape for `root` whose notes all fit in `region`, low to high. */
export function d10Placements(
  shape: CagedShapeName,
  quality: CagedQuality,
  root: string,
  tuning: Tuning,
  region: FretRange = D10_REGION,
): D10Placement[] {
  const lowest = cagedShape(shape, root, { quality });
  const out: D10Placement[] = [];
  for (let by = 0; shapeSpan(lowest).from + by <= region.to; by += 12) {
    const standard = lowest.notes.map((n) => ({ ...n, fret: n.fret + by }));
    const notes = retune(standard, tuning).sort(byPitch(tuning));
    if (!notes.every((n) => inRange(n.fret, region))) continue;
    out.push({ shape, rootString: lowest.rootString, notes, span: shapeSpan({ notes: standard }) });
  }
  return out;
}

/** The placement among `options` that comes next after `from` up (1) or down (-1) the neck. */
export function d10Beside(
  from: D10Placement,
  options: readonly D10Placement[],
  dir: 1 | -1,
): D10Placement | undefined {
  return options
    .filter((o) => dir * (o.span.from - from.span.from) > 0)
    .sort((a, b) => dir * (a.span.from - b.span.from))[0];
}

interface Option {
  shown: D10Placement;
  answer: D10Placement;
}

/** Every way to ask `ask` about `shape` at `root`. */
function optionsFor(
  ask: D10Ask,
  shape: CagedShapeName,
  quality: CagedQuality,
  root: string,
  tuning: Tuning,
): Option[] {
  const answers = d10Placements(shape, quality, root, tuning);
  if (ask === 'name') return answers.map((p) => ({ shown: p, answer: p }));
  // "Next": the shape before it is shown, and the answer lies up the neck from it.
  const dir = ask === 'next' ? 1 : -1;
  const neighbour = ask === 'next' ? previousCagedShape(shape) : nextCagedShape(shape);
  return d10Placements(neighbour, quality, root, tuning).flatMap((shown) => {
    const answer = d10Beside(shown, answers, dir);
    return answer ? [{ shown, answer }] : [];
  });
}

function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

/** One of `asks`, drawn by the configured weights. */
export function d10PickAsk(asks: readonly D10Ask[], rng: () => number): D10Ask | undefined {
  const weights = ENGINE_CONFIG.whichShape.askWeights;
  const total = asks.reduce((sum, a) => sum + weights[a], 0);
  let r = rng() * total;
  for (const a of asks) {
    r -= weights[a];
    if (r < 0) return a;
  }
  return asks[asks.length - 1];
}

/** The shape a learner most likely gives instead of the answer. */
function likeliestMixUp(
  ask: D10Ask,
  shape: CagedShapeName,
  shown: CagedShapeName,
): CagedShapeName | undefined {
  if (ask === 'name') return PARTNER[shape];
  // The shown shape's neighbour the other way: C for "after the A shape".
  return ask === 'next' ? previousCagedShape(shown) : nextCagedShape(shown);
}

/** The shapes to choose from, in CAGED order. */
export function d10Choices(
  ask: D10Ask,
  shape: CagedShapeName,
  shown: CagedShapeName,
  count: number,
  rng: () => number,
): CagedShapeName[] {
  // All five keep every button in its place, so the row is learnt by
  // position. A chain question's named shape stays in it on purpose: a
  // deliberate distractor that picks out a learner who misreads the question.
  if (count >= CAGED_ORDER.length) return [...CAGED_ORDER];
  const chosen = new Set<CagedShapeName>([shape]);
  const mixUp = likeliestMixUp(ask, shape, shown);
  if (mixUp) chosen.add(mixUp);
  // The shape named in a chain question is never its answer: leave it out.
  const rest = CAGED_ORDER.filter((s) => !chosen.has(s) && (ask === 'name' || s !== shown));
  while (chosen.size < count && rest.length > 0) {
    const i = Math.min(rest.length - 1, Math.floor(rng() * rest.length));
    chosen.add(rest.splice(i, 1)[0] as CagedShapeName);
  }
  return CAGED_ORDER.filter((s) => chosen.has(s));
}

export function d10MakePrompt(item: Item, ctx: DrillContext): D10Prompt {
  const ref = parseCagedItemId(item.id);
  const { tuning, accidentalPref, rng } = ctx;
  if (ref?.kind !== 'caged' || stringCount(tuning) !== 6) {
    throw new Error(`D10 cannot test item ${item.id}`);
  }
  const level = d10LevelFor(ctx.scopeLevel);
  const roots = (
    level.roots === 'naturals' ? NATURAL_PCS.map(chromaOf) : [...Array(12).keys()]
  ).map((chroma) => {
    const spelling = chordKeySpelling(chroma, ref.quality, accidentalPref);
    return { root: chromaToPc(chroma, spelling), spelling };
  });
  const byAsk = D10_ASKS.map((ask) => ({
    ask,
    roots: roots
      .map((r) => ({ ...r, options: optionsFor(ask, ref.shape, ref.quality, r.root, tuning) }))
      .filter((r) => r.options.length > 0),
  })).filter((a) => a.roots.length > 0);
  const ask = d10PickAsk(
    byAsk.map((a) => a.ask),
    rng,
  );
  const at = pick(byAsk.find((a) => a.ask === ask)?.roots ?? [], rng);
  const option = at && pick(at.options, rng);
  if (!ask || !at || !option) throw new Error(`D10 cannot place item ${item.id}`);

  return {
    itemId: item.id,
    ask,
    shape: ref.shape,
    quality: ref.quality,
    root: at.root,
    chord: d10ChordSymbol(at.root, ref.quality),
    shown: option.shown,
    answer: option.answer,
    choices: d10Choices(ask, ref.shape, option.shown.shape, level.choices, rng),
    level: D10_LEVELS.indexOf(level),
    activeRange: D10_REGION,
    tuning,
    accidentalPref: at.spelling,
  };
}

/** The feedback bar's answer: "the A shape of C", "the G shape, after the A shape". */
export function d10Subject(prompt: D10Prompt): string {
  const shape = `the ${prompt.shape} shape`;
  if (prompt.ask === 'next') return `${shape}, after the ${prompt.shown.shape} shape`;
  if (prompt.ask === 'previous') return `${shape}, before the ${prompt.shown.shape} shape`;
  return `${shape} of ${d10Display(prompt.chord)}`;
}

export function d10Check(prompt: D10Prompt, answer: D10Answer): DrillCheck {
  const expected = d10Subject(prompt);
  if (answer === prompt.shape) return { correct: true, expected };
  // A wrong name is a shape mix-up; a wrong neighbour is a slip along the chain.
  return prompt.ask === 'name'
    ? {
        correct: false,
        expected,
        confusedWith: `caged:${answer}`,
        concept: `caged:${prompt.shape}`,
      }
    : { correct: false, expected };
}

export function d10DescribeAnswer(answer: D10Answer): string {
  return answer;
}

/** The answer shape, low to high (sound, sight and name together, design §7). */
export function d10Sounds(prompt: D10Prompt, _fb: DrillFeedback<D10Answer>): DrillSounds {
  const names = prompt.answer.notes.map(
    (n) => noteAt(n, prompt.tuning, prompt.accidentalPref).name,
  );
  return { expected: [...new Set(names)] };
}

export function d10FeedbackPositions(
  prompt: D10Prompt,
  _fb: DrillFeedback<D10Answer>,
): { expected: Position[]; given: Position[] } {
  return {
    expected: prompt.answer.notes.map((n) => ({ string: n.string, fret: n.fret })),
    given: [],
  };
}

/** Hardware keyboard (design §7): the shape's letter picks it. */
export function d10KeyToAnswer(
  key: string,
  choices: readonly CagedShapeName[],
): CagedShapeName | null {
  const shape = key.toUpperCase();
  return choices.find((c) => c === shape) ?? null;
}

/** Degrees show on the neck while guides are up (rule 9); below, roots and plain dots. */
export function d10ShowsDegrees(guideLevel: GuideLevel, guided: boolean): boolean {
  return guided || guideLevel >= ENGINE_CONFIG.whichShape.degreeGuideLevel;
}

/** Notes are drawn by degree, in shape as well as colour. */
export function d10DegreeStyle(degree: Degree): 'root' | 'third' | 'fifth' | 'seventh' {
  if (degree === 'R') return 'root';
  if (degree === '5') return 'fifth';
  if (degree === 'b7') return 'seventh';
  return 'third';
}

/** The degrees, low string first: "R 5 R 3 5". */
export function d10DegreeLine(notes: readonly ShapeNote[]): string {
  return [...notes]
    .sort((a, b) => b.string - a.string)
    .map((n) => d10Display(n.degree))
    .join(' ');
}

/** "strings 5–1". */
export function d10StringSpan(notes: readonly Position[]): string {
  const strings = notes.map((n) => n.string);
  return `strings ${Math.max(...strings)}–${Math.min(...strings)}`;
}

/** "frets 5–8", in the drill's tuning. */
function fretSpan(p: D10Placement): string {
  const frets = p.notes.map((n) => n.fret);
  const lo = Math.min(...frets);
  const hi = Math.max(...frets);
  return lo === hi ? `fret ${lo}` : `frets ${lo}–${hi}`;
}

/** Which way a shape reaches from its root: why shapes on one root string differ. */
function reach(shape: CagedShapeName): string {
  return shape === 'C' || shape === 'G' ? 'back toward the nut' : 'up from the root';
}

/** One line of feedback: the shape and its degrees, or its place in the chain. */
export function d10Explain(prompt: D10Prompt, fb: DrillFeedback<D10Answer>): string {
  const picked = fb.answer;
  const wrong = fb.result.correct ? '' : `You picked the ${picked} shape. `;
  if (prompt.ask === 'name') {
    const notes = prompt.answer.notes;
    const shape = `the ${prompt.shape} shape of ${d10Display(prompt.chord)}: ${d10DegreeLine(notes)} on ${d10StringSpan(notes)}.`;
    if (fb.result.correct) return `That's ${shape}`;
    const pickedString = ROOT_STRING[picked];
    const why =
      pickedString === prompt.answer.rootString
        ? `Both root on string ${pickedString}: the ${prompt.shape} shape reaches ${reach(prompt.shape)}, the ${picked} shape ${reach(picked)}.`
        : `The ${picked} shape roots on string ${pickedString}; this one roots on string ${prompt.answer.rootString}.`;
    return `${wrong}${why} This is ${shape}`;
  }
  const chain =
    prompt.ask === 'next'
      ? `Up the neck the chain runs C A G E D, then round again: after the ${prompt.shown.shape} shape comes the ${prompt.shape} shape`
      : `Down the neck the chain runs D E G A C, then round again: before the ${prompt.shown.shape} shape comes the ${prompt.shape} shape`;
  return `${wrong}${chain}, at ${fretSpan(prompt.answer)}.`;
}

// --- Windows ---------------------------------------------------------------

/**
 * The visible neck: the whole neck on iPad landscape; iPad portrait's 12-fret
 * neck and compact screens' window are centred on the shape and, for a chain
 * question, its neighbour (the question already says which way it lies).
 */
export function d10Window(
  prompt: D10Prompt,
  sizeClass: SizeClass,
  compactFrets: number,
): FretRange {
  const bounds = prompt.activeRange;
  if (sizeClass === 'regular-wide') return bounds;
  const frets = [...prompt.shown.notes, ...prompt.answer.notes].map((n) => n.fret);
  const lo = Math.min(...frets);
  const hi = Math.max(...frets);
  const size =
    sizeClass === 'regular'
      ? D10_REGULAR_SPAN + 1
      : Math.max(ENGINE_CONFIG.whichShape.compactWindowFrets, compactFrets, hi - lo + 1);
  const width = Math.min(size, bounds.to - bounds.from + 1);
  const start = Math.max(
    bounds.from,
    Math.min(lo - Math.floor((width - (hi - lo + 1)) / 2), bounds.to - width + 1),
  );
  return { from: start, to: start + width - 1 };
}
