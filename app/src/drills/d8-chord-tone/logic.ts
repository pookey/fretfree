import { ENGINE_CONFIG } from '../../engine/config';
import { parseChordToneItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  NATURAL_PCS,
  chordFormula,
  chordToneOf,
  chromaOf,
  chromaToPc,
  isPracticalSpelling,
  midiAt,
  nameChord,
  noteAt,
  samePosition,
  spellChord,
  stringCount,
  type AccidentalPref,
  type CagedShapeName,
  type ChordDegree,
  type ChordKind,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import type { ChordVoicing } from '../../components/chord-diagram/model';
import type { SizeClass } from '../../shell/size-class';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { isD8Kind, placements, templatesFor, type VoicingTemplate } from './voicings';

/**
 * D8 "Find the chord tone in a shape" (design §6), the pure half of the
 * drill. It tests C5's chord-tone cards in both directions (rule 12):
 *
 * - `chord-tone:b3@m7`: a m7 shape is drawn and the learner taps its ♭3;
 * - `chord-tone-name:b3@m7`: one note of the shape is ringed, and the
 *   learner names it: root, ♭3, 3, 5, ♭7 or 7.
 *
 * The shape (an open chord, a barre chord or a CAGED shape), its root and its
 * neck position vary per prompt, so a card meets its degree in many keys and
 * voicings. The answer buttons always offer both 3rds, and both 7ths for a
 * seventh chord, so the 3/♭3 and ♭7/7 confusions are asked every time; the
 * confusion matrix keys a degree by its interval from the root (`M3`, `m3`,
 * `m7`, `M7`), so the interval seed pairs interleave them (rule 6).
 */

export const D8_ID = 'chord-tone';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): `naturals` (0)
 * roots shapes on natural notes at their lowest position, which brings in
 * the open chords; `all-roots` (1) on any of the 12 pitch classes; `anywhere`
 * (2) at either octave of the neck as well.
 */
export type D8Scope = 'naturals' | 'all-roots' | 'anywhere';

export const D8_SCOPES: readonly D8Scope[] = ['naturals', 'all-roots', 'anywhere'];
export const D8_SCOPE = { minLevel: 0, maxLevel: D8_SCOPES.length - 1 };

/** The neck the iPad shows: every shape fits at every root within it. */
export const D8_REGION: FretRange = { from: 0, to: 15 };

/** The answer buttons, in this order: the root, both 3rds, the 5th, both 7ths. */
const DEGREE_ORDER: readonly ChordDegree[] = ['1', 'b3', '3', '5', 'b7', '7'];

/** The degree each one is confused with. */
const TWIN: Partial<Record<ChordDegree, ChordDegree>> = { '3': 'b3', b3: '3', '7': 'b7', b7: '7' };

/** Intervals from the root, as the confusion matrix keys them (engine/confusions.ts). */
const INTERVAL: Partial<Record<ChordDegree, string>> = {
  '1': 'P1',
  b3: 'm3',
  '3': 'M3',
  '5': 'P5',
  b7: 'm7',
  '7': 'M7',
};

export interface ToneNote extends Position {
  readonly degree: ChordDegree;
  /** The note as the chord spells it: the ♭3 of A minor is C, not B♯. */
  readonly name: string;
}

export type D8Voicing = 'open' | 'barre' | 'shape';

export interface D8Prompt {
  itemId: string;
  /** `tap`: find the degree in the shape. `name`: name the ringed note. */
  mode: 'tap' | 'name';
  /** The degree to tap, or the ringed note's degree. */
  degree: ChordDegree;
  kind: ChordKind;
  /** The root, spelled per the accidental preference where the chord allows. */
  root: string;
  /** The chord symbol, e.g. `Am7`. */
  chord: string;
  shape: CagedShapeName;
  voicing: D8Voicing;
  /** Every note of the shape, low to high in pitch. */
  notes: ToneNote[];
  /** Name mode: the ringed note. */
  ringed: ToneNote | null;
  /** Name mode: the degrees to choose from. */
  choices: ChordDegree[];
  /** The frets the shape spans. */
  span: FretRange;
  scope: D8Scope;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** A tap on the neck (tap mode) or a degree (name mode). */
export type D8Answer = Position | ChordDegree;

export function d8ScopeFor(level: number): D8Scope {
  const i = Math.max(0, Math.min(D8_SCOPES.length - 1, Math.round(level)));
  return D8_SCOPES[i] as D8Scope;
}

export function d8CanTest(item: Item): boolean {
  const ref = parseChordToneItemId(item.id);
  return ref !== null && isD8Kind(ref.chord) && ref.degree in INTERVAL;
}

/** Button and marker label: `R`, `♭3`, `3`, `5`, `♭7`, `7`. */
export function d8DegreeLabel(degree: ChordDegree): string {
  return degree === '1' ? 'R' : degree.replace(/^b/, '♭');
}

/** In a sentence: "the root", "the ♭3rd", "the 5th". */
export function d8DegreeName(degree: ChordDegree): string {
  if (degree === '1') return 'root';
  const n = degree.replace(/^b/, '');
  const ordinal = n === '3' ? '3rd' : `${n}th`;
  return degree.startsWith('b') ? `♭${ordinal}` : ordinal;
}

/** For screen readers, which may not voice ♭: "flat 3rd". */
export function d8DegreeSpoken(degree: ChordDegree): string {
  return d8DegreeName(degree).replace('♭', 'flat ');
}

/** Display form of a note or chord: `F#m7` → `F♯m7`, `Bb` → `B♭`. */
export function d8Display(s: string): string {
  return s.replace(/#/g, '♯').replace(/(?<=^[A-G])b/, '♭');
}

/** The degrees offered in name mode: the chord's own, plus each one's confusable twin. */
export function d8Choices(kind: ChordKind): ChordDegree[] {
  const formula = chordFormula(kind);
  const offered = new Set(formula.flatMap((d) => [d, ...(TWIN[d] ? [TWIN[d]] : [])]));
  return DEGREE_ORDER.filter((d) => offered.has(d));
}

const KEYS = ['1', '2', '3', '4', '5', '6'];

export function d8KeyFor(index: number): string | undefined {
  return KEYS[index];
}

/** Hardware-keyboard answers (design §7): the number row picks a button by position. */
export function d8KeyToAnswer(key: string, choices: readonly ChordDegree[]): ChordDegree | null {
  const i = KEYS.indexOf(key);
  return i < 0 ? null : (choices[i] ?? null);
}

/** The root's spelling: the preferred accidental, unless the chord would need a double one. */
export function d8SpellRoot(chroma: number, kind: ChordKind, pref: AccidentalPref): string {
  const preferred = chromaToPc(chroma, pref);
  if (isPracticalSpelling(spellChord(preferred, kind))) return preferred;
  return chromaToPc(chroma, pref === 'sharp' ? 'flat' : 'sharp');
}

function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

/** Open if a string rings open; an E or A shape up the neck is a barre chord. */
function voicingOf(shape: CagedShapeName, notes: readonly Position[]): D8Voicing {
  if (notes.some((n) => n.fret === 0)) return 'open';
  return shape === 'E' || shape === 'A' ? 'barre' : 'shape';
}

export function d8MakePrompt(item: Item, ctx: DrillContext): D8Prompt {
  const ref = parseChordToneItemId(item.id);
  const { tuning, accidentalPref } = ctx;
  if (!ref || !d8CanTest(item) || stringCount(tuning) !== 6) {
    throw new Error(`D8 cannot test item ${item.id}`);
  }
  const scope = d8ScopeFor(ctx.scopeLevel);
  const kind = ref.chord;
  const t = pick(templatesFor(kind), ctx.rng) as VoicingTemplate;
  const chromas = scope === 'naturals' ? NATURAL_PCS.map(chromaOf) : [...Array(12).keys()];
  const roots = chromas
    .map((c) => d8SpellRoot(c, kind, accidentalPref))
    .filter((r) => placements(t, r, tuning, D8_REGION.to).length > 0);
  const root = pick(roots, ctx.rng);
  const options = root ? placements(t, root, tuning, D8_REGION.to) : [];
  const placed = scope === 'anywhere' ? pick(options, ctx.rng) : options[0];
  if (!root || !placed) throw new Error(`D8 cannot place item ${item.id}`);

  const notes: ToneNote[] = placed
    .map((n) => ({ ...n, name: chordToneOf(root, kind, n.degree) as string }))
    .sort((a, b) => midiAt(a, tuning) - midiAt(b, tuning));
  const mode = ref.kind === 'chord-tone' ? 'tap' : 'name';
  const ringed =
    mode === 'name'
      ? (pick(
          notes.filter((n) => n.degree === ref.degree),
          ctx.rng,
        ) ?? null)
      : null;
  const frets = notes.map((n) => n.fret);
  return {
    itemId: item.id,
    mode,
    degree: ref.degree,
    kind,
    root,
    chord: nameChord(root, kind),
    shape: t.shape,
    voicing: voicingOf(t.shape, notes),
    notes,
    ringed,
    choices: mode === 'name' ? d8Choices(kind) : [],
    span: { from: Math.min(...frets), to: Math.max(...frets) },
    scope,
    tuning,
    accidentalPref,
  };
}

/** The shape's note at a cell, if any. */
export function d8NoteAt(prompt: D8Prompt, pos: Position): ToneNote | undefined {
  return prompt.notes.find((n) => samePosition(n, pos));
}

/** The notes of the asked (or ringed) degree. */
export function d8Targets(prompt: D8Prompt): ToneNote[] {
  return prompt.notes.filter((n) => n.degree === prompt.degree);
}

/** "the ♭3rd of Am7, C": the feedback bar's answer. */
export function d8Expected(prompt: D8Prompt): string {
  const name = (d8Targets(prompt)[0] as ToneNote).name;
  return `the ${d8DegreeName(prompt.degree)} of ${d8Display(prompt.chord)}, ${d8Display(name)}`;
}

/** The degree the learner gave: the tapped note's (null off the shape), or the button's. */
export function d8GivenDegree(prompt: D8Prompt, answer: D8Answer): ChordDegree | null {
  if (typeof answer === 'string') return answer;
  return d8NoteAt(prompt, answer)?.degree ?? null;
}

export function d8Check(prompt: D8Prompt, answer: D8Answer): DrillCheck {
  const expected = d8Expected(prompt);
  const given = d8GivenDegree(prompt, answer);
  if (given === prompt.degree) return { correct: true, expected };
  const concept = INTERVAL[prompt.degree];
  const confusedWith = given ? INTERVAL[given] : undefined;
  return confusedWith && concept
    ? { correct: false, expected, confusedWith, concept }
    : { correct: false, expected };
}

export function d8DescribeAnswer(answer: D8Answer): string {
  return typeof answer === 'string' ? answer : `s${answer.string}f${answer.fret}`;
}

export function d8ConceptOf(item: Item): string | null {
  const ref = parseChordToneItemId(item.id);
  return ref ? (INTERVAL[ref.degree] ?? null) : null;
}

/** The note sounded for the answer: the ringed note, or the nearest note of the asked degree. */
function answerNote(prompt: D8Prompt, near?: Position): ToneNote {
  if (prompt.ringed) return prompt.ringed;
  const targets = d8Targets(prompt);
  if (!near) return targets[0] as ToneNote;
  const exact = targets.find((t) => samePosition(t, near));
  if (exact) return exact;
  const d = (t: Position) => Math.abs(t.string - near.string) + Math.abs(t.fret - near.fret);
  return [...targets].sort((a, b) => d(a) - d(b))[0] as ToneNote;
}

/**
 * The chord low to high, then the answer's note on its own (sound, sight and
 * name together, design §7); a wrong tap adds the tapped note.
 */
export function d8Sounds(prompt: D8Prompt, fb: DrillFeedback<D8Answer>): DrillSounds {
  const pitch = (p: Position) => noteAt(p, prompt.tuning, prompt.accidentalPref).name;
  const tap = typeof fb.answer === 'string' ? undefined : fb.answer;
  const expected = [...prompt.notes.map(pitch), pitch(answerNote(prompt, tap))];
  return !fb.result.correct && tap ? { expected, given: [pitch(tap)] } : { expected };
}

export function d8FeedbackPositions(
  prompt: D8Prompt,
  fb: DrillFeedback<D8Answer>,
): { expected: Position[]; given: Position[] } {
  const tap = typeof fb.answer === 'string' ? null : fb.answer;
  return {
    expected: prompt.ringed ? [prompt.ringed] : d8Targets(prompt),
    given: tap && !fb.result.correct ? [tap] : [],
  };
}

/** "Open chord, A shape", "E-shape barre at fret 5", "C shape, frets 8–10". */
export function d8VoicingLine(prompt: D8Prompt): string {
  const { from, to } = prompt.span;
  if (prompt.voicing === 'open') return `Open chord, ${prompt.shape} shape`;
  if (prompt.voicing === 'barre') return `${prompt.shape}-shape barre at fret ${from}`;
  return `${prompt.shape} shape, frets ${from}–${to}`;
}

/** The shape's degrees, low string first: "R 5 ♭7 ♭3 5". */
export function d8DegreeLine(notes: readonly ToneNote[]): string {
  return [...notes]
    .sort((a, b) => b.string - a.string)
    .map((n) => d8DegreeLabel(n.degree))
    .join(' ');
}

function where(pos: Position): string {
  return `string ${pos.string}, fret ${pos.fret}`;
}

/** One line of feedback: where the degree is, and what the learner gave instead. */
export function d8Explain(prompt: D8Prompt, fb: DrillFeedback<D8Answer>): string {
  const chord = d8Display(prompt.chord);
  const shape = `${chord} here is ${d8DegreeLine(prompt.notes)} from the low string.`;
  if (fb.result.correct) return `Yes: ${shape}`;
  const given = d8GivenDegree(prompt, fb.answer);
  const asked = d8DegreeName(prompt.degree);
  let what: string;
  if (typeof fb.answer !== 'string') {
    const note = d8NoteAt(prompt, fb.answer);
    what = note
      ? `You tapped the ${d8DegreeName(note.degree)}, ${d8Display(note.name)}.`
      : `${where(fb.answer)} isn't in the shape.`;
  } else {
    const name = (prompt.ringed as ToneNote).name;
    what = `The ringed note is ${d8Display(name)}, the ${asked}, not the ${d8DegreeName(given as ChordDegree)}.`;
  }
  return `${what} ${shape}`;
}

/** Notes drawn by degree, in shape as well as colour (the Fretboard's chord-tone markers). */
export function d8DegreeStyle(degree: ChordDegree): 'root' | 'third' | 'fifth' | 'seventh' {
  if (degree === '1') return 'root';
  if (degree === '5') return 'fifth';
  if (degree === 'b7' || degree === '7') return 'seventh';
  return 'third';
}

/**
 * Root squares are a guide (design §3.5, levels 2–3). They never show when
 * the root is the answer, in either direction: with the other roots squared,
 * an unsquared ringed root could be read off the octave pattern, or taken for
 * "not the root".
 */
export function d8ShowsRoots(prompt: D8Prompt, guideLevel: GuideLevel, guided: boolean): boolean {
  if (prompt.degree === '1') return false;
  return guided || guideLevel >= ENGINE_CONFIG.chordTone.rootGuideLevel;
}

/**
 * The shape as a chord diagram for the context panel (design §7 "the current
 * chord diagram"). Before an answer it draws what the neck draws: plain dots,
 * with roots squared only where the neck squares them (`roots`). Once the
 * degree is no longer asked for (`reveal`), each dot takes its degree's
 * marker and label. A barre chord gets its barre at the shape's lowest fret.
 */
export function d8DiagramVoicing(prompt: D8Prompt, reveal: boolean): ChordVoicing {
  const notes = prompt.notes.map((n) => ({
    string: n.string,
    fret: n.fret,
    style: reveal
      ? d8DegreeStyle(n.degree)
      : n.degree === '1'
        ? ('root' as const)
        : ('tone' as const),
    label: d8DegreeLabel(n.degree),
  }));
  if (prompt.voicing !== 'barre') return { notes };
  const under = prompt.notes.filter((n) => n.fret === prompt.span.from).map((n) => n.string);
  if (under.length < 2 || prompt.span.from === 0) return { notes };
  return {
    notes,
    barres: [
      { fret: prompt.span.from, from: Math.min(...under), to: Math.max(...under), finger: 1 },
    ],
  };
}

// --- Windows ---------------------------------------------------------------

/**
 * The frets on screen: the whole neck on iPad landscape; a 12-fret neck on
 * iPad portrait, slid up when the shape sits above fret 12; on compact a
 * window round the shape, at least `compactFrets` wide.
 */
export function d8Window(prompt: D8Prompt, sizeClass: SizeClass, compactFrets: number): FretRange {
  const { from, to } = prompt.span;
  if (sizeClass === 'regular-wide') return D8_REGION;
  if (sizeClass === 'regular') {
    return to > D8_REGION.to - 3
      ? { from: D8_REGION.to - 12, to: D8_REGION.to }
      : { from: 0, to: 12 };
  }
  const width = Math.max(compactFrets, ENGINE_CONFIG.chordTone.compactWindowFrets, to - from + 1);
  const start = Math.max(
    D8_REGION.from,
    Math.min(from - Math.floor((width - (to - from + 1)) / 2), D8_REGION.to - width + 1),
  );
  return { from: start, to: start + width - 1 };
}
