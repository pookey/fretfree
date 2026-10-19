import { parseChordTonesItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  allStrings,
  chordDegreeSemitones,
  chordFormula,
  chromaOf,
  degreeInChord,
  inRange,
  midiAt,
  midiToFretNote,
  nameChord,
  noteAt,
  positionsOfPitchClass,
  samePosition,
  spellChord,
  type AccidentalPref,
  type CagedShapeName,
  type ChordDegree,
  type ChordKind,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { placements, templatesFor, type PlacedNote } from '../../theory/voicings';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { d8DegreeLabel, d8DegreeName, d8Display } from '../d8-chord-tone/logic';
import { isD8Kind } from '../d8-chord-tone/voicings';
import { d4RegionWindow, d4RoundOrder } from '../d4-octave-finder/logic';

/**
 * D37 "Chord tones across the neck" (design §6), the pure half of the drill.
 * It tests C5's chord-tones cards: `chord-tones:C` taps every note of C
 * major, and `chord-tones:3@C` every 3rd of it.
 *
 * It is a multi-target drill built the way D4's every-octave round is
 * (design §7): each tap is marked at once, the round answers at the last
 * target, at the first wrong tap, or on "Done", and it is graded on
 * completion time per target (`d37GradedResponseMs`). The region is a CAGED
 * shape's span at the narrow scope (chord tones inside a box, research/03
 * I2), then frets 0–12. Compact screens run a wide region region by region.
 *
 * The answer is the list of taps in order.
 */

export const D37_ID = 'chord-tones-neck';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5):
 *
 * - `shape` (0): the frets one CAGED shape of the chord spans, picked per
 *   prompt, so the box moves round the neck (rule 12);
 * - `neck` (1): frets 0–12, every string.
 */
export type D37Scope = 'shape' | 'neck';

export const D37_SCOPES: readonly D37Scope[] = ['shape', 'neck'];
export const D37_SCOPE = { minLevel: 0, maxLevel: D37_SCOPES.length - 1 };

/** Frets 0–12, as for D4: above 12 the neck repeats (dimmed, not hidden). */
export const D37_NECK: FretRange = { from: 0, to: 12 };

/**
 * A box may reach fret 15, the top of the iPad's neck, so every CAGED shape
 * of a chord can come up (C major's D shape spans frets 10–13).
 */
export const D37_SHAPE_FRETS: FretRange = { from: 0, to: 15 };

export interface D37Tone {
  readonly degree: ChordDegree;
  /** The note as the chord spells it: the ♭3 of A minor is C, not B♯. */
  readonly name: string;
}

export interface D37Target extends Position {
  readonly degree: ChordDegree;
}

/** The CAGED shape a `shape`-scope region is the span of. */
export interface D37Shape {
  readonly name: CagedShapeName;
  readonly notes: readonly PlacedNote[];
}

export interface D37Prompt {
  itemId: string;
  /** The chord's symbol, e.g. `Cm7`. */
  chord: string;
  root: string;
  kind: ChordKind;
  /** The asked degree, or `null` for every note of the chord. */
  degree: ChordDegree | null;
  /** The chord, spelled in formula order. */
  tones: readonly D37Tone[];
  /** Every cell to tap. */
  targets: readonly D37Target[];
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  scope: D37Scope;
  shape: D37Shape | null;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The taps, in order. */
export type D37Answer = readonly Position[];

export function d37ScopeFor(level: number): D37Scope {
  const i = Math.max(0, Math.min(D37_SCOPES.length - 1, Math.round(level)));
  return D37_SCOPES[i] as D37Scope;
}

function parse(item: Item) {
  const ref = parseChordTonesItemId(item.id);
  return ref && isD8Kind(ref.chord) ? ref : null;
}

/** The kinds with CAGED shapes to draw a region from (`theory/voicings`). */
export function d37CanTest(item: Item): boolean {
  return parse(item) !== null;
}

/** The degrees a prompt asks for. */
export function d37Asked(prompt: Pick<D37Prompt, 'kind' | 'degree'>): readonly ChordDegree[] {
  return prompt.degree === null ? chordFormula(prompt.kind) : [prompt.degree];
}

function tonesOf(root: string, kind: ChordKind): D37Tone[] {
  const names = spellChord(root, kind);
  return chordFormula(kind).map((degree, i) => ({ degree, name: names[i] as string }));
}

/** Every cell in the range that holds an asked tone, by fret, low string first. */
function targetsIn(tones: readonly D37Tone[], range: FretRange, tuning: Tuning): D37Target[] {
  return tones
    .flatMap((t) =>
      positionsOfPitchClass(t.name, { tuning, fretRange: range }).map((p) => ({
        ...p,
        degree: t.degree,
      })),
    )
    .sort((a, b) => a.fret - b.fret || b.string - a.string);
}

function span(notes: readonly Position[]): FretRange {
  const frets = notes.map((n) => n.fret);
  return { from: Math.min(...frets), to: Math.max(...frets) };
}

/** Every placement of every shape of the chord, in `D37_SHAPE_FRETS`. */
export function d37Shapes(root: string, kind: ChordKind, tuning: Tuning): D37Shape[] {
  return templatesFor(kind).flatMap((t) =>
    placements(t, root, tuning, D37_SHAPE_FRETS.to).map((notes) => ({ name: t.shape, notes })),
  );
}

export function d37MakePrompt(item: Item, ctx: DrillContext): D37Prompt {
  const ref = parse(item);
  if (!ref) throw new Error(`D37 cannot test item ${item.id}`);
  const { tuning, accidentalPref } = ctx;
  const { root, chord: kind, degree } = ref;
  const tones = tonesOf(root, kind);
  const asked = tones.filter((t) => d37Asked({ kind, degree }).includes(t.degree));
  const base = {
    itemId: item.id,
    chord: nameChord(root, kind),
    root,
    kind,
    degree,
    tones,
    tuning,
    accidentalPref,
  };
  const shapes = d37ShapeScope(ctx.scopeLevel)
    ? d37Shapes(root, kind, tuning).filter(
        (s) => targetsIn(asked, span(s.notes), tuning).length > 0,
      )
    : [];
  const shape = shapes[Math.floor(ctx.rng() * shapes.length)] ?? shapes[0];
  if (shape) {
    const activeRange = span(shape.notes);
    const targets = targetsIn(asked, activeRange, tuning);
    return { ...base, targets, activeRange, scope: 'shape', shape };
  }
  const targets = targetsIn(asked, D37_NECK, tuning);
  return { ...base, targets, activeRange: D37_NECK, scope: 'neck', shape: null };
}

function d37ShapeScope(level: number): boolean {
  return d37ScopeFor(level) === 'shape';
}

/** True if a tap on this cell is an answer (dimmed frets are inert). */
export function d37IsLive(prompt: D37Prompt, pos: Position): boolean {
  return inRange(pos.fret, prompt.activeRange) && allStrings(prompt.tuning).includes(pos.string);
}

export function d37TargetAt(prompt: D37Prompt, pos: Position): D37Target | undefined {
  return prompt.targets.find((t) => samePosition(t, pos));
}

/** The targets among the taps, in tap order. */
export function d37Found(prompt: D37Prompt, taps: D37Answer): D37Target[] {
  return taps.flatMap((p) => d37TargetAt(prompt, p) ?? []);
}

/** The targets not tapped. */
export function d37Missed(prompt: D37Prompt, taps: D37Answer): D37Target[] {
  return prompt.targets.filter((t) => !taps.some((p) => samePosition(p, t)));
}

/** Taps that are not a target. */
export function d37WrongTaps(prompt: D37Prompt, taps: D37Answer): Position[] {
  return taps.filter((p) => !d37TargetAt(prompt, p));
}

/** Semitones from the root to the note at a cell. */
function semitonesAt(prompt: D37Prompt, pos: Position): number {
  return (((midiAt(pos, prompt.tuning) - chromaOf(prompt.root)) % 12) + 12) % 12;
}

/** D7's concepts, so the seed pairs (`triad:maj`/`triad:min`, `chord:7`/`chord:maj7` …) apply. */
function chordConcept(kind: ChordKind): string {
  if (kind === 'major') return 'triad:maj';
  if (kind === 'minor') return 'triad:min';
  return `chord:${kind}`;
}

/** Intervals from the root, as the confusion matrix keys them (engine/confusions.ts). */
const INTERVAL: Partial<Record<ChordDegree, string>> = {
  '1': 'P1',
  b3: 'm3',
  '3': 'M3',
  '5': 'P5',
  b7: 'm7',
  '7': 'M7',
};

/** The interval key of a semitone count, for the twins a tap can confuse. */
const BY_SEMITONES: Readonly<Record<number, string>> = { 3: 'm3', 4: 'M3', 10: 'm7', 11: 'M7' };

/**
 * The chord a wrong note makes in place of its twin: ♭3 for 3 makes the
 * major chord minor, 7 for ♭7 makes 7 a maj7, ♭5 for 5 makes m7 a m7♭5.
 */
const SWAPPED: Partial<Record<ChordKind, Readonly<Record<number, ChordKind>>>> = {
  major: { 3: 'minor' },
  minor: { 4: 'major' },
  '7': { 11: 'maj7', 3: 'm7' },
  maj7: { 10: '7' },
  m7: { 6: 'm7b5', 4: '7' },
};

/** The concept a card is keyed by: the chord's kind, or a degree's interval. */
export function d37Concept(prompt: Pick<D37Prompt, 'kind' | 'degree'>): string {
  return prompt.degree === null
    ? chordConcept(prompt.kind)
    : (INTERVAL[prompt.degree] ?? prompt.degree);
}

/**
 * What a wrong tap confuses the card with, if it is the confusable twin:
 * the ♭3 in a 3rd card (`m3` for `M3`), or a note that turns the chord into
 * its pair (an E♭ in C major is C minor's). Any other note has no concept.
 */
export function d37ConfusedWith(prompt: D37Prompt, pos: Position): string | undefined {
  const semis = semitonesAt(prompt, pos);
  if (prompt.degree !== null) {
    const twin = BY_SEMITONES[semis];
    const asked = INTERVAL[prompt.degree];
    // Only the 3rd for the ♭3 (and back), and the ♭7 for the 7.
    return twin && asked && twin !== asked && twin[1] === asked[1] ? twin : undefined;
  }
  const kind = SWAPPED[prompt.kind]?.[semis];
  return kind ? chordConcept(kind) : undefined;
}

/** "C major", "Cm7": triads by name, sevenths by symbol. */
export function d37ChordName(prompt: Pick<D37Prompt, 'root' | 'kind' | 'chord'>): string {
  if (prompt.kind === 'major') return `${d8Display(prompt.root)} major`;
  if (prompt.kind === 'minor') return `${d8Display(prompt.root)} minor`;
  return d8Display(prompt.chord);
}

/** What the asked tones are: "every note of C major", "every 3rd of C major". */
export function d37Asking(prompt: D37Prompt): string {
  const chord = d37ChordName(prompt);
  if (prompt.degree === null) return `every note of ${chord}`;
  return `every ${d8DegreeName(prompt.degree)} of ${chord}`;
}

/** The answer, as the feedback bar shows it: "C major: C E G", "E, the 3rd of C major". */
export function d37Expected(prompt: D37Prompt): string {
  const chord = d37ChordName(prompt);
  if (prompt.degree === null) {
    return `${chord}: ${prompt.tones.map((t) => d8Display(t.name)).join(' ')}`;
  }
  const tone = prompt.tones.find((t) => t.degree === prompt.degree) as D37Tone;
  return `${d8Display(tone.name)}, the ${d8DegreeName(tone.degree)} of ${chord}`;
}

export function d37Check(prompt: D37Prompt, taps: D37Answer): DrillCheck {
  const expected = d37Expected(prompt);
  const concept = d37Concept(prompt);
  const wrong = d37WrongTaps(prompt, taps)[0];
  if (wrong) {
    const confusedWith = d37IsLive(prompt, wrong) ? d37ConfusedWith(prompt, wrong) : undefined;
    return confusedWith
      ? { correct: false, expected, concept, confusedWith }
      : { correct: false, expected, concept };
  }
  return { correct: d37Missed(prompt, taps).length === 0, expected, concept };
}

export function d37DescribeAnswer(taps: D37Answer): string {
  return taps.map((p) => `s${p.string}f${p.fret}`).join(' ') || 'none';
}

/** Completion time per target, so a whole-neck round meets the usual speed targets. */
export function d37GradedResponseMs(
  prompt: D37Prompt,
  _taps: D37Answer,
  elapsedMs: number,
): number {
  return elapsedMs / Math.max(1, prompt.targets.length);
}

export function d37ConceptOf(item: Item): string | null {
  const ref = parse(item);
  return ref ? d37Concept({ kind: ref.chord, degree: ref.degree }) : null;
}

/** The lowest root in frets 0–12, which the sounds build up from. */
function lowestRootMidi(prompt: D37Prompt): number {
  const roots = positionsOfPitchClass(prompt.root, {
    tuning: prompt.tuning,
    fretRange: D37_NECK,
  }).map((p) => midiAt(p, prompt.tuning));
  return Math.min(...roots);
}

/**
 * The chord, root position up from its lowest root on the neck (sound,
 * sight and name together); for a degree card, the root then that degree.
 * A wrong tap adds the tapped note (design §7).
 */
export function d37Sounds(prompt: D37Prompt, fb: DrillFeedback<D37Answer>): DrillSounds {
  const root = lowestRootMidi(prompt);
  const degrees: readonly ChordDegree[] =
    prompt.degree === null ? chordFormula(prompt.kind) : ['1', prompt.degree];
  const expected = degrees.map(
    (d) => midiToFretNote(root + chordDegreeSemitones(d), prompt.accidentalPref).name,
  );
  const wrong = d37WrongTaps(prompt, fb.answer);
  if (wrong.length === 0) return { expected };
  return {
    expected,
    given: wrong.map((p) => noteAt(p, prompt.tuning, prompt.accidentalPref).name),
  };
}

export function d37FeedbackPositions(
  prompt: D37Prompt,
  fb: DrillFeedback<D37Answer>,
): { expected: Position[]; given: Position[] } {
  return {
    expected: prompt.targets.map((t) => ({ string: t.string, fret: t.fret })),
    given: d37WrongTaps(prompt, fb.answer),
  };
}

function where(pos: Position): string {
  return `string ${pos.string}, fret ${pos.fret}`;
}

/** "frets 8–10, the E shape of C major", or "frets 0–12". */
export function d37RegionLine(prompt: D37Prompt): string {
  const frets = `frets ${prompt.activeRange.from}–${prompt.activeRange.to}`;
  if (!prompt.shape) return frets;
  return `${frets}, the ${prompt.shape.name} shape of ${d37ChordName(prompt)}`;
}

/** "C (R), E (3), G (5)": each asked tone with its degree. */
function toneLine(prompt: D37Prompt): string {
  return prompt.tones
    .filter((t) => d37Asked(prompt).includes(t.degree))
    .map((t) => `${d8Display(t.name)} (${d8DegreeLabel(t.degree)})`)
    .join(', ');
}

/** What a wrong tap was: "E♭ (string 3, fret 8): the ♭3rd, which makes C minor". */
function tapLine(prompt: D37Prompt, pos: Position): string {
  const note = noteAt(pos, prompt.tuning, prompt.accidentalPref).pc;
  const at = `${d8Display(note)} (${where(pos)})`;
  const swapped = prompt.degree === null ? SWAPPED[prompt.kind]?.[semitonesAt(prompt, pos)] : null;
  if (swapped) {
    const other = { root: prompt.root, kind: swapped, chord: nameChord(prompt.root, swapped) };
    const degree = degreeInChord(prompt.root, swapped, note) as ChordDegree;
    return `${at}: the ${d8DegreeName(degree)}, which makes ${d37ChordName(other)}`;
  }
  if (prompt.degree === null) return `${at}, which isn't in ${d37ChordName(prompt)}`;
  const asked = d8DegreeName(prompt.degree);
  const degree = degreeInChord(prompt.root, prompt.kind, note) ?? twinOf(prompt, pos);
  return degree
    ? `${at}: the ${d8DegreeName(degree)}, not the ${asked}`
    : `${at}, which isn't the ${asked}`;
}

/** The ♭3 for a 3rd card (and back), or the 7 for a ♭7 card: not in the chord, but its twin. */
function twinOf(prompt: D37Prompt, pos: Position): ChordDegree | null {
  const twin = d37ConfusedWith(prompt, pos);
  const byInterval: Readonly<Record<string, ChordDegree>> = {
    m3: 'b3',
    M3: '3',
    m7: 'b7',
    M7: '7',
  };
  return twin ? (byInterval[twin] ?? null) : null;
}

/** One line of feedback: what was tapped wrongly, what is left, and what the tones are. */
export function d37Explain(prompt: D37Prompt, fb: DrillFeedback<D37Answer>): string {
  const tones = `${toneLine(prompt)} in ${d37RegionLine(prompt)}.`;
  if (fb.result.correct) return `That's ${d37Asking(prompt)}: ${tones}`;
  const parts: string[] = [];
  const wrong = d37WrongTaps(prompt, fb.answer)[0];
  if (wrong) parts.push(`You tapped ${tapLine(prompt, wrong)}.`);
  const missed = d37Missed(prompt, fb.answer).length;
  if (missed > 0) {
    parts.push(`${missed} ${missed === 1 ? 'was' : 'were'} still to find, ringed on the neck.`);
  }
  parts.push(tones);
  return parts.join(' ');
}

/**
 * The guide level the neck is drawn at. Guides fade as usual (design §3.5),
 * but string names at level 2+ would name a fret-0 answer, so before an
 * answer the neck drops to inlays only (level 1) when an open string in the
 * region holds an asked tone, as D4 does. Guided reps show everything.
 */
export function d37NeckGuideLevel(
  prompt: D37Prompt,
  guideLevel: GuideLevel,
  opts: { guided: boolean; answered: boolean },
): GuideLevel {
  if (opts.guided) return 3;
  if (opts.answered || guideLevel < 2) return guideLevel;
  const openTarget = prompt.targets.some((t) => t.fret === 0);
  return openTarget ? 1 : guideLevel;
}

/** Root squares are a guide (levels 2–3) for a degree card; on a chord card the roots are answers. */
export function d37ShowsRoots(prompt: D37Prompt, guideLevel: GuideLevel, guided: boolean): boolean {
  if (prompt.degree === null || prompt.degree === '1') return false;
  return guided || guideLevel >= 2;
}

/** The roots in the region, drawn as squares when `d37ShowsRoots`. */
export function d37Roots(prompt: D37Prompt): Position[] {
  return positionsOfPitchClass(prompt.root, {
    tuning: prompt.tuning,
    fretRange: prompt.activeRange,
  });
}

/** The target count shows only while guides are up (rule 9), as in D4. */
export function d37ShowsCount(guideLevel: GuideLevel, guided: boolean): boolean {
  return guided || guideLevel >= 2;
}

// --- Compact layout -------------------------------------------------------

export interface D37Round {
  region: FretRange;
  targets: D37Target[];
}

/**
 * The rounds of a region-by-region round (design §7 iPhone): `neckRegions`
 * windows of the active range that hold a target, starting nearest the nut
 * (or the shape) and working up, as D4 starts nearest its dot. One region
 * covers the iPad, and any range that fits a compact window.
 */
export function d37Rounds(prompt: D37Prompt, regions: readonly FretRange[]): D37Round[] {
  const rounds = regions
    .map((region) => ({
      region,
      targets: prompt.targets.filter((t) => inRange(t.fret, region)),
    }))
    .filter((r) => r.targets.length > 0);
  if (rounds.length <= 1) return [{ region: prompt.activeRange, targets: [...prompt.targets] }];
  return d4RoundOrder(rounds, prompt.activeRange.from);
}

/** The frets on screen for a compact round: a full window, so a short region keeps its cell size. */
export function d37RegionWindow(region: FretRange, size: number): FretRange {
  return d4RegionWindow(region, D37_SHAPE_FRETS, size);
}

/** The iPad-portrait neck: frets 0–12, or 3–15 for a box above fret 12. */
export function d37RegularWindow(prompt: D37Prompt): FretRange {
  return prompt.activeRange.to > 12 ? { from: 3, to: 15 } : { from: 0, to: 12 };
}

/**
 * The round to show once answered on compact (the fix D4's review asked
 * for): the first that holds a wrong tap or a missed target, so the
 * feedback is on screen. The learner steps through the rest.
 */
export function d37FeedbackRound(
  prompt: D37Prompt,
  rounds: readonly { region: FretRange }[],
  taps: D37Answer,
): number {
  const marked = [...d37WrongTaps(prompt, taps), ...d37Missed(prompt, taps)];
  const i = rounds.findIndex((r) => marked.some((p) => inRange(p.fret, r.region)));
  return Math.max(0, i);
}

/** How many wrong taps and missed targets lie outside a region. */
export function d37MarkedOutside(prompt: D37Prompt, region: FretRange, taps: D37Answer): number {
  return [...d37WrongTaps(prompt, taps), ...d37Missed(prompt, taps)].filter(
    (p) => !inRange(p.fret, region),
  ).length;
}
