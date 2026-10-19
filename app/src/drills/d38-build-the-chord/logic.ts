import { ENGINE_CONFIG } from '../../engine/config';
import { parseBuildChordItemId, type GuideLevel, type Item } from '../../engine/model';
import {
  CONFUSABLE_CHORD_KINDS,
  NATURAL_PCS,
  chordDegreeSemitones,
  chordDifference,
  chordFormula,
  chordToneOf,
  chromaOf,
  chromaToPc,
  inRange,
  isPracticalSpelling,
  midiAt,
  nameChord,
  noteAt,
  samePosition,
  spellChord,
  stringCount,
  type AccidentalPref,
  type ChordDegree,
  type ChordKind,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';

/**
 * D38 "Build the chord" (design §6), the pure half of the drill: the reverse
 * of D36. It tests C5's build cards (`build-chord:m7@s5`): the chord symbol
 * and its root on the neck are given ("Am7, root on string 5, fret 0"), and
 * the learner taps one note per string above the root to make a voicing.
 *
 * Any voicing counts if it has the chord's tones (a four-note chord may drop
 * its 5th), no other notes, and is playable: its fretted notes span at most
 * `maxSpan` frets and need at most `maxFingers` fingers (engine/config/
 * buildChord.ts). The root stays the lowest note, so the strings below it
 * are muted. A string left untapped is muted too. Feedback names every
 * note's degree and the tones that are missing, and shows one voicing that
 * works, the closest to the learner's. A voicing that is exactly the
 * confusable chord (A7 for Amaj7) is logged as that confusion, keyed as D7
 * and D36 key it (rule 6).
 *
 * The voicing is found from pitches, not templates, so it works in any
 * tuning with the root's string.
 */

export const D38_ID = 'build-the-chord';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): `naturals` (0)
 * roots on natural notes at their lowest fret, which brings in the open
 * chords; `all-roots` (1) on any of the 12 pitch classes; `anywhere` (2) at
 * either octave of the neck as well.
 */
export type D38Scope = 'naturals' | 'all-roots' | 'anywhere';

export const D38_SCOPES: readonly D38Scope[] = ['naturals', 'all-roots', 'anywhere'];
export const D38_SCOPE = { minLevel: 0, maxLevel: D38_SCOPES.length - 1 };

/** The neck the iPad shows. Voicings stay within it. */
export const D38_REGION: FretRange = { from: 0, to: 15 };

/** The frets iPad portrait shows at once: a 12-fret neck (design §7), 13 cells. */
export const D38_REGULAR_SPAN = 12;

/** Every interval from the root, by semitones, for notes the chord doesn't have. */
const CHROMATIC: readonly string[] = [
  '1',
  'b2',
  '2',
  'b3',
  '3',
  '4',
  'b5',
  '5',
  '#5',
  '6',
  'b7',
  '7',
];

/** A note of the learner's voicing, named by its place in the chord. */
export interface VoicedNote extends Position {
  /** A formula degree (`b3`), or the interval from the root of a note the chord lacks (`b2`). */
  readonly degree: string;
  readonly inChord: boolean;
  /** As the chord spells it where it's a chord tone (the ♭3 of A is C); else per the preference. */
  readonly name: string;
}

export interface ChordTone {
  readonly degree: ChordDegree;
  readonly name: string;
  /** False if a voicing may leave it out (the 5th of a seventh chord). */
  readonly required: boolean;
}

export interface D38Prompt {
  itemId: string;
  kind: ChordKind;
  /** The root, spelled per the accidental preference where the chord allows. */
  root: string;
  /** The chord symbol, e.g. `Am7`. */
  chord: string;
  /** The given root (the square), the voicing's lowest note. */
  anchor: Position;
  /** The strings to build on, low to high in pitch: [4, 3, 2, 1] above a root on string 5. */
  strings: number[];
  /** The chord's tones, root first. */
  tones: ChordTone[];
  /** One voicing that works (the anchor excluded): the worked example's notes. */
  example: Position[];
  scope: D38Scope;
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  maxSpan: number;
  maxFingers: number;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The notes tapped above the root, at most one per string. */
export type D38Answer = readonly Position[];

export function d38ScopeFor(level: number): D38Scope {
  const i = Math.max(0, Math.min(D38_SCOPES.length - 1, Math.round(level)));
  return D38_SCOPES[i] as D38Scope;
}

export function d38CanTest(item: Item): boolean {
  const ref = parseBuildChordItemId(item.id);
  return ref !== null && ref.string >= 2;
}

/** Marker label: `R`, `♭3`, `♯5`. */
export function d38DegreeLabel(degree: string): string {
  return degree === '1' ? 'R' : degree.replace(/^b/, '♭').replace(/^#/, '♯');
}

/** In a sentence: "the root", "the ♭3rd", "the 5th", "the 9th". */
export function d38DegreeName(degree: string): string {
  if (degree === '1') return 'the root';
  const n = degree.replace(/^[b#]/, '');
  const ordinal = n === '2' ? '2nd' : n === '3' ? '3rd' : `${n}th`;
  return `the ${d38DegreeLabel(degree.replace(n, ''))}${ordinal}`;
}

/** For screen readers, which may not voice ♭ and ♯: "flat 3rd". */
export function d38DegreeSpoken(degree: string): string {
  if (degree === '1') return 'root';
  return d38DegreeName(degree).replace(/^the /, '').replace('♭', 'flat ').replace('♯', 'sharp ');
}

/** Display form of a note or chord: `F#m7b5` → `F♯m7♭5`, `Bb` → `B♭`. */
export function d38Display(s: string): string {
  return s
    .replace(/#/g, '♯')
    .replace(/(?<=^[A-G])b/, '♭')
    .replace(/b(?=\d)/g, '♭');
}

/** The root's spelling: the preferred accidental, unless the chord would need a double one. */
export function d38SpellRoot(chroma: number, kind: ChordKind, pref: AccidentalPref): string {
  const preferred = chromaToPc(chroma, pref);
  if (isPracticalSpelling(spellChord(preferred, kind))) return preferred;
  return chromaToPc(chroma, pref === 'sharp' ? 'flat' : 'sharp');
}

/** The chord's tones, with the ones a voicing must have. */
export function d38Tones(root: string, kind: ChordKind): ChordTone[] {
  const optional = ENGINE_CONFIG.buildChord.optionalDegrees[kind] ?? [];
  return chordFormula(kind).map((degree) => ({
    degree,
    name: chordToneOf(root, kind, degree) as string,
    required: !optional.includes(degree),
  }));
}

// --- Voicings --------------------------------------------------------------

/** What a voicing is checked against: a chord on a root position. */
interface Target {
  kind: ChordKind;
  root: string;
  anchor: Position;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The interval from the root, in semitones (0–11). */
function semitones(t: Target, pos: Position): number {
  return (((midiAt(pos, t.tuning) - midiAt(t.anchor, t.tuning)) % 12) + 12) % 12;
}

/** A note's degree in the chord, or its interval from the root if the chord lacks it. */
function voiced(t: Target, pos: Position): VoicedNote {
  const semis = semitones(t, pos);
  const degree = chordFormula(t.kind).find((d) => chordDegreeSemitones(d) % 12 === semis);
  if (degree) {
    return { ...pos, degree, inChord: true, name: chordToneOf(t.root, t.kind, degree) as string };
  }
  return {
    ...pos,
    degree: CHROMATIC[semis] as string,
    inChord: false,
    name: noteAt(pos, t.tuning, t.accidentalPref).pc,
  };
}

/** The taps that count: on a string above the root, the last tap on each string. */
export function d38Placed(prompt: Pick<D38Prompt, 'strings'>, taps: D38Answer): Position[] {
  const last = new Map<number, Position>();
  for (const p of taps) if (prompt.strings.includes(p.string)) last.set(p.string, p);
  return [...last.values()].sort((a, b) => b.string - a.string);
}

/** Frets the voicing spans with its fretted notes, both ends counted (0 if all open). */
export function d38Span(notes: readonly Position[]): number {
  const frets = notes.filter((n) => n.fret > 0).map((n) => n.fret);
  return frets.length === 0 ? 0 : Math.max(...frets) - Math.min(...frets) + 1;
}

/**
 * Fingers the voicing needs: one per fretted note, except that the notes on
 * the lowest fretted fret share a barre unless an open string rings between
 * them. A muted string under the barre doesn't break it, though a real barre
 * would sound it (the player damps it): accepting more voicings is the safe
 * side.
 */
export function d38Fingers(notes: readonly Position[]): number {
  const fretted = notes.filter((n) => n.fret > 0);
  if (fretted.length === 0) return 0;
  const low = Math.min(...fretted.map((n) => n.fret));
  const barred = fretted.filter((n) => n.fret === low).map((n) => n.string);
  const [hi, lo] = [Math.max(...barred), Math.min(...barred)];
  const broken = notes.some((n) => n.fret === 0 && n.string < hi && n.string > lo);
  return broken ? fretted.length : fretted.length - barred.length + 1;
}

export interface D38Verdict {
  /** The voicing, the root included, low string first, each note named by degree. */
  notes: VoicedNote[];
  /** Tones the voicing must have but doesn't. */
  missing: ChordTone[];
  /** Notes the chord doesn't have. */
  extras: VoicedNote[];
  /** Placed notes pitched below the root (an open string under a fretted root). */
  belowRoot: VoicedNote[];
  span: number;
  fingers: number;
  tooWide: boolean;
  tooManyFingers: boolean;
  correct: boolean;
}

function verdictFor(t: Target, placed: readonly Position[]): D38Verdict {
  const notes = [t.anchor, ...placed].map((p) => voiced(t, p));
  const have = new Set(notes.filter((n) => n.inChord).map((n) => n.degree));
  const missing = d38Tones(t.root, t.kind).filter(
    (tone) => tone.required && !have.has(tone.degree),
  );
  const extras = notes.filter((n) => !n.inChord);
  const root = midiAt(t.anchor, t.tuning);
  const belowRoot = notes.filter((n) => midiAt(n, t.tuning) < root);
  const span = d38Span(notes);
  const fingers = d38Fingers(notes);
  const { maxSpan, maxFingers } = ENGINE_CONFIG.buildChord;
  const tooWide = span > maxSpan;
  const tooManyFingers = fingers > maxFingers;
  return {
    notes,
    missing,
    extras,
    belowRoot,
    span,
    fingers,
    tooWide,
    tooManyFingers,
    correct:
      missing.length === 0 &&
      extras.length === 0 &&
      belowRoot.length === 0 &&
      !tooWide &&
      !tooManyFingers,
  };
}

/** The learner's voicing, checked against the chord asked (or another kind on the same root). */
export function d38Verdict(prompt: D38Prompt, taps: D38Answer, kind = prompt.kind): D38Verdict {
  return verdictFor({ ...prompt, kind }, d38Placed(prompt, taps));
}

/**
 * Every valid voicing of the chord on the root, as the notes above it, in
 * search order. The frets searched reach `maxSpan - 1` either side of the
 * root, plus the open strings, within `region`.
 */
export function d38Voicings(
  t: Target,
  strings: readonly number[],
  region: FretRange = D38_REGION,
  limit = Number.POSITIVE_INFINITY,
): Position[][] {
  const { maxSpan, maxFingers } = ENGINE_CONFIG.buildChord;
  const lo = Math.max(region.from, t.anchor.fret - (maxSpan - 1));
  const hi = Math.min(region.to, t.anchor.fret + (maxSpan - 1));
  const frets = [...new Set([0, ...Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)])].filter(
    (f) => inRange(f, region),
  );
  // By semitones from the root, so the search never spells a note.
  const optional = ENGINE_CONFIG.buildChord.optionalDegrees[t.kind] ?? [];
  const formula = chordFormula(t.kind);
  const tones = new Set(formula.map((d) => chordDegreeSemitones(d) % 12));
  const required = formula
    .filter((d) => !optional.includes(d))
    .map((d) => chordDegreeSemitones(d) % 12);
  // Only chord tones can be in a valid voicing.
  const options = strings.map((string) =>
    frets
      .map((fret) => ({ string, fret, semis: semitones(t, { string, fret }) }))
      // Root position: nothing below the root (an open string under a fretted one).
      .filter((p) => tones.has(p.semis) && midiAt(p, t.tuning) >= midiAt(t.anchor, t.tuning)),
  );
  const out: Position[][] = [];
  const chosen: (Position & { semis: number })[] = [];
  const walk = (i: number) => {
    if (out.length >= limit) return;
    if (d38Span([t.anchor, ...chosen]) > maxSpan) return;
    if (i === options.length) {
      const have = new Set([0, ...chosen.map((p) => p.semis)]);
      if (
        chosen.length > 0 &&
        required.every((r) => have.has(r)) &&
        d38Fingers([t.anchor, ...chosen]) <= maxFingers
      ) {
        out.push(chosen.map(({ string, fret }) => ({ string, fret })));
      }
      return;
    }
    for (const p of options[i] as (Position & { semis: number })[]) {
      chosen.push(p);
      walk(i + 1);
      chosen.pop();
    }
    walk(i + 1);
  };
  walk(0);
  return out;
}

/**
 * Lower is better: no open string far from the hand, then strings ringing in
 * a row from the root, then more notes, then notes close to the root, then
 * fewer fingers. An open string is close while the root is near the nut, and
 * as far as the root's fret beyond it, so the example up the neck is a
 * barre-style voicing, not one filled out with stray open strings (which a
 * 12-fret window round a high root wouldn't show).
 */
function cost(anchor: Position, strings: readonly number[], v: readonly Position[]): number[] {
  const on = new Set(v.map((p) => p.string));
  const run = strings.findIndex((s) => !on.has(s));
  const gaps = run < 0 ? 0 : strings.slice(run).filter((s) => on.has(s)).length;
  const nearNut = anchor.fret < ENGINE_CONFIG.buildChord.maxSpan;
  const farOpen = nearNut ? 0 : v.filter((p) => p.fret === 0).length;
  const away = (p: Position) => (p.fret === 0 && nearNut ? 0 : Math.abs(p.fret - anchor.fret));
  const reach = v.reduce((sum, p) => sum + away(p), 0);
  return [farOpen, gaps, -v.length, reach, d38Fingers([anchor, ...v]), d38Span([anchor, ...v])];
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
  return 0;
}

/** The best voicing in `vs`, preferring the most notes in common with `taps`. */
function best(
  anchor: Position,
  strings: readonly number[],
  vs: readonly Position[][],
  taps: readonly Position[] = [],
): Position[] | undefined {
  const score = (v: readonly Position[]) => [
    -v.filter((p) => taps.some((t) => samePosition(t, p))).length,
    ...cost(anchor, strings, v),
  ];
  let top: { v: Position[]; s: number[] } | undefined;
  for (const v of vs) {
    const s = score(v);
    if (!top || compare(s, top.s) < 0) top = { v, s };
  }
  return top?.v;
}

/** One voicing that works, as close to the learner's taps as the chord allows. */
export function d38Example(prompt: D38Prompt, taps: D38Answer = []): Position[] {
  const placed = d38Placed(prompt, taps);
  if (taps.length > 0 && d38Verdict(prompt, taps).correct) return placed;
  const vs = d38Voicings(prompt, prompt.strings, prompt.activeRange);
  return best(prompt.anchor, prompt.strings, vs, placed) ?? prompt.example;
}

// --- Prompts ---------------------------------------------------------------

function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

/** The strings above a root string, low to high in pitch. */
function stringsAbove(string: number): number[] {
  return Array.from({ length: string - 1 }, (_, i) => string - 1 - i);
}

export function d38MakePrompt(item: Item, ctx: DrillContext): D38Prompt {
  const ref = parseBuildChordItemId(item.id);
  const { tuning, accidentalPref } = ctx;
  if (!ref || !d38CanTest(item) || ref.string > stringCount(tuning)) {
    throw new Error(`D38 cannot test item ${item.id}`);
  }
  const scope = d38ScopeFor(ctx.scopeLevel);
  const kind = ref.chord;
  const strings = stringsAbove(ref.string);
  const chromas = scope === 'naturals' ? NATURAL_PCS.map(chromaOf) : [...Array(12).keys()];
  const open = midiAt({ string: ref.string, fret: 0 }, tuning);

  // Each root's frets on its string where a voicing fits: the lowest, or any if `anywhere`.
  const options = chromas.flatMap((chroma) => {
    const root = d38SpellRoot(chroma, kind, accidentalPref);
    const frets: number[] = [];
    for (let fret = (((chroma - open) % 12) + 12) % 12; fret <= D38_REGION.to; fret += 12) {
      const anchor = { string: ref.string, fret };
      const t = { kind, root, anchor, tuning, accidentalPref };
      if (d38Voicings(t, strings, D38_REGION, 1).length > 0) frets.push(fret);
    }
    const usable = scope === 'anywhere' ? frets : frets.slice(0, 1);
    return usable.map((fret) => ({ root, anchor: { string: ref.string, fret } }));
  });
  const chosen = pick(options, ctx.rng);
  if (!chosen) throw new Error(`D38 cannot place item ${item.id}`);
  return d38PromptAt(item.id, kind, chosen.root, chosen.anchor, scope, tuning, accidentalPref);
}

/** The prompt for a chord on a given root position, with its best voicing as the example. */
export function d38PromptAt(
  itemId: string,
  kind: ChordKind,
  root: string,
  anchor: Position,
  scope: D38Scope,
  tuning: Tuning,
  accidentalPref: AccidentalPref,
): D38Prompt {
  const strings = stringsAbove(anchor.string);
  const t = { kind, root, anchor, tuning, accidentalPref };
  const example = best(anchor, strings, d38Voicings(t, strings));
  if (!example)
    throw new Error(`No voicing of ${nameChord(root, kind)} from s${anchor.string}f${anchor.fret}`);
  const { maxSpan, maxFingers } = ENGINE_CONFIG.buildChord;
  return {
    itemId,
    kind,
    root,
    chord: nameChord(root, kind),
    anchor,
    strings,
    tones: d38Tones(root, kind),
    example,
    scope,
    activeRange: D38_REGION,
    maxSpan,
    maxFingers,
    tuning,
    accidentalPref,
  };
}

/** True if a tap there places a note: a string above the root, within the active frets. */
export function d38IsLive(prompt: D38Prompt, pos: Position): boolean {
  return prompt.strings.includes(pos.string) && inRange(pos.fret, prompt.activeRange);
}

/**
 * The taps after one more: a note on a string replaces that string's note,
 * and tapping a note again mutes its string. Taps that place nothing are
 * ignored.
 */
export function d38Tap(prompt: D38Prompt, taps: D38Answer, pos: Position): Position[] {
  const placed = d38Placed(prompt, taps);
  if (!d38IsLive(prompt, pos)) return placed;
  const rest = placed.filter((p) => p.string !== pos.string);
  if (placed.some((p) => samePosition(p, pos))) return rest;
  return [...rest, { string: pos.string, fret: pos.fret }].sort((a, b) => b.string - a.string);
}

// --- Grading ---------------------------------------------------------------

/** The confusion-matrix key of a quality: D7's and D36's, so the seed pairs apply. */
export function d38Concept(kind: ChordKind): string {
  if (kind === 'major') return 'triad:maj';
  if (kind === 'minor') return 'triad:min';
  return `chord:${kind}`;
}

export function d38ConceptOf(item: Item): string | null {
  const ref = parseBuildChordItemId(item.id);
  return ref ? d38Concept(ref.chord) : null;
}

/** The kinds confused with this one (engine/confusions' chord pairs). */
function partners(kind: ChordKind): ChordKind[] {
  return CONFUSABLE_CHORD_KINDS.flatMap(([a, b]) => (a === kind ? [b] : b === kind ? [a] : []));
}

/** The confusable chord the voicing builds instead, on the same root, if any. */
export function d38BuiltInstead(prompt: D38Prompt, taps: D38Answer): ChordKind | null {
  if (d38Verdict(prompt, taps).correct) return null;
  return partners(prompt.kind).find((k) => d38Verdict(prompt, taps, k).correct) ?? null;
}

/** "Am7 (A C E G)": the feedback bar's answer. */
export function d38Expected(prompt: D38Prompt): string {
  return `${d38Display(prompt.chord)} (${prompt.tones.map((t) => d38Display(t.name)).join(' ')})`;
}

export function d38Check(prompt: D38Prompt, taps: D38Answer): DrillCheck {
  const expected = d38Expected(prompt);
  const concept = d38Concept(prompt.kind);
  if (d38Verdict(prompt, taps).correct) return { correct: true, expected, concept };
  const instead = d38BuiltInstead(prompt, taps);
  return instead
    ? { correct: false, expected, concept, confusedWith: d38Concept(instead) }
    : { correct: false, expected, concept };
}

export function d38DescribeAnswer(taps: D38Answer): string {
  return taps.map((p) => `s${p.string}f${p.fret}`).join(' ') || 'none';
}

/**
 * Time per note placed, so a five-string voicing meets the usual speed
 * targets (design §3.2), as D9 grades per note. Strings left muted count
 * for all but one, so a sparse voicing isn't graded as if each note took
 * the time of the whole build.
 */
export function d38GradedResponseMs(prompt: D38Prompt, taps: D38Answer, elapsedMs: number) {
  const placed = d38Placed(prompt, taps).length;
  return elapsedMs / Math.max(1, placed, prompt.strings.length - 1);
}

function pitches(prompt: D38Prompt, notes: readonly Position[]): string[] {
  return [prompt.anchor, ...notes].map((p) => noteAt(p, prompt.tuning, prompt.accidentalPref).name);
}

/**
 * The chord as built, low to high (sound, sight and name together, design
 * §7). A wrong voicing plays a voicing that works, then the learner's.
 */
export function d38Sounds(prompt: D38Prompt, fb: DrillFeedback<D38Answer>): DrillSounds {
  const placed = d38Placed(prompt, fb.answer);
  if (fb.result.correct) return { expected: pitches(prompt, placed) };
  return {
    expected: pitches(prompt, d38Example(prompt, fb.answer)),
    given: pitches(prompt, placed),
  };
}

export function d38FeedbackPositions(
  prompt: D38Prompt,
  fb: DrillFeedback<D38Answer>,
): { expected: Position[]; given: Position[] } {
  const v = d38Verdict(prompt, fb.answer);
  const given = [...v.extras, ...v.belowRoot.filter((n) => n.inChord)].map(({ string, fret }) => ({
    string,
    fret,
  }));
  return { expected: [prompt.anchor, ...d38Example(prompt, fb.answer)], given };
}

// --- Text ------------------------------------------------------------------

/** The voicing as chord charts write it, low string first: "x 0 2 0 1 0". */
export function d38Tab(prompt: D38Prompt, notes: readonly Position[]): string {
  const count = stringCount(prompt.tuning);
  const all = [prompt.anchor, ...notes];
  return Array.from({ length: count }, (_, i) => count - i)
    .map((s) => all.find((p) => p.string === s)?.fret ?? 'x')
    .join(' ');
}

/** The degrees, low string first: "R 5 ♭7 ♭3 5". */
export function d38DegreeLine(notes: readonly VoicedNote[]): string {
  return notes.map((n) => d38DegreeLabel(n.degree)).join(' ');
}

/** "the ♭3rd (C)", "the ♭3rd (C) and the ♭7th (G)". */
function listTones(tones: readonly ChordTone[]): string {
  const parts = tones.map((t) => `${d38DegreeName(t.degree)} (${d38Display(t.name)})`);
  return parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** "That's A7: Amaj7 has the 7th (G♯) where A7 has the ♭7th (G)." */
function confusionLine(prompt: D38Prompt, instead: ChordKind): string {
  const other = d38Display(nameChord(prompt.root, instead));
  const asked = d38Display(prompt.chord);
  const diff = chordDifference(prompt.kind, instead);
  const [mine, theirs] = [diff.onlyA[0], diff.onlyB[0]];
  if (diff.onlyA.length !== 1 || diff.onlyB.length !== 1 || !mine || !theirs) {
    return `That's ${other}, not ${asked}.`;
  }
  const tone = (kind: ChordKind, d: ChordDegree) =>
    `${d38DegreeName(d)} (${d38Display(chordToneOf(prompt.root, kind, d) as string)})`;
  return `That's ${other}: ${asked} has ${tone(prompt.kind, mine)} where ${other} has ${tone(instead, theirs)}.`;
}

/**
 * The feedback lines: what the voicing is, by degree, and on a wrong answer
 * what went wrong and one voicing that works.
 */
export function d38Explain(prompt: D38Prompt, fb: DrillFeedback<D38Answer>): string[] {
  const v = d38Verdict(prompt, fb.answer);
  const placed = d38Placed(prompt, fb.answer);
  const chord = d38Display(prompt.chord);
  const built = `${d38DegreeLine(v.notes)} from string ${prompt.anchor.string} (${d38Tab(prompt, placed)})`;
  if (v.correct) return [`Yes: that's ${chord}, ${built}.`];
  const lines = [`You built ${built}.`];
  const instead = d38BuiltInstead(prompt, fb.answer);
  if (instead) lines.push(confusionLine(prompt, instead));
  else {
    if (v.missing.length > 0) lines.push(`Missing ${listTones(v.missing)}.`);
    for (const n of v.extras) {
      lines.push(
        `${d38Display(n.name)} on string ${n.string} is ${d38DegreeName(n.degree)}: not in ${chord}.`,
      );
    }
    for (const n of v.belowRoot) {
      const open = n.fret === 0 ? 'Open ' : '';
      lines.push(
        `${open}${d38Display(n.name)} on string ${n.string} is below the root: the root must be the lowest note.`,
      );
    }
    if (v.tooWide) lines.push(`It spans ${v.span} frets: keep it within ${prompt.maxSpan}.`);
    if (v.tooManyFingers) {
      lines.push(`It needs ${v.fingers} fingers: keep it to ${prompt.maxFingers}.`);
    }
  }
  lines.push(`One that works: ${d38Tab(prompt, d38Example(prompt, fb.answer))}.`);
  return lines;
}

/** Notes drawn by degree, in shape as well as colour (the Fretboard's chord-tone markers). */
export function d38DegreeStyle(degree: string): 'root' | 'third' | 'fifth' | 'seventh' {
  if (degree === '1') return 'root';
  if (degree === '5' || degree === 'b5') return 'fifth';
  if (degree === 'b7' || degree === '7') return 'seventh';
  return 'third';
}

/** The chord's formula (R ♭3 5 ♭7) shows from this guide level, or in a worked example. */
export function d38ShowsFormula(guideLevel: GuideLevel, guided: boolean): boolean {
  return guided || guideLevel >= ENGINE_CONFIG.buildChord.formulaGuideLevel;
}

/** Its notes (A C E G) from this one: below it, spelling the chord is part of the recall. */
export function d38ShowsNotes(guideLevel: GuideLevel, guided: boolean): boolean {
  return guided || guideLevel >= ENGINE_CONFIG.buildChord.noteGuideLevel;
}

// --- Windows ---------------------------------------------------------------

/** The furthest a valid voicing reaches from its root, in frets. */
function reach(prompt: D38Prompt): number {
  return prompt.maxSpan - 1;
}

/**
 * The compact window: centred on the root and wide enough for any voicing
 * either side of it, so it doesn't hint at where the chord tones are. It
 * widens to cover `shown`, notes the view must draw (a worked example's, or
 * feedback's), which are no hint by then.
 */
export function d38Window(
  prompt: D38Prompt,
  compactFrets: number,
  shown: readonly Position[] = [],
): FretRange {
  const size = Math.max(
    ENGINE_CONFIG.buildChord.compactWindowFrets,
    compactFrets,
    2 * reach(prompt) + 1,
  );
  const bounds = prompt.activeRange;
  const width = Math.min(size, bounds.to - bounds.from + 1);
  const start = Math.max(
    bounds.from,
    Math.min(prompt.anchor.fret - Math.floor(width / 2), bounds.to - width + 1),
  );
  const frets = shown.map((p) => p.fret);
  return {
    from: Math.min(start, ...frets),
    to: Math.max(start + width - 1, ...frets),
  };
}

/**
 * iPad portrait's 12-fret neck: frets 0–12, slid up just far enough for any
 * voicing. Like the compact window, it widens to cover `shown`.
 */
export function d38RegularWindow(prompt: D38Prompt, shown: readonly Position[] = []): FretRange {
  const bounds = prompt.activeRange;
  const top = Math.min(
    bounds.to,
    Math.max(bounds.from + D38_REGULAR_SPAN, prompt.anchor.fret + reach(prompt)),
  );
  const frets = shown.map((p) => p.fret);
  return { from: Math.min(top - D38_REGULAR_SPAN, ...frets), to: Math.max(top, ...frets) };
}
