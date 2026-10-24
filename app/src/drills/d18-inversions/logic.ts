import { ENGINE_CONFIG } from '../../engine/config';
import {
  inversionItemId,
  parseInversionItemId,
  type StringSetLow,
} from '../../engine/items/inversion';
import type { Item } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import {
  CAGED_ORDER,
  NATURAL_PCS,
  STANDARD_TUNING,
  cagedShape,
  chordToneOf,
  chromaOf,
  chromaToPc,
  inRange,
  isPracticalSpelling,
  midiAt,
  noteAt,
  openStringMidi,
  samePosition,
  spellChord,
  stringCount,
  triadCores,
  triadVoicings,
  type AccidentalPref,
  type CagedShapeName,
  type ChordDegree,
  type Degree,
  type FretRange,
  type Inversion,
  type Position,
  type ShapeNote,
  type TriadQuality,
  type TriadVoicing,
  type Tuning,
} from '../../theory';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D18_SCOPES, type D18Scope } from './meta';

export { D18_ID, D18_SCOPE, D18_SCOPES, d18CanTest, d18ConceptOf, type D18Scope } from './meta';

/**
 * D18 "Triad inversions on a string set" (design §6), the pure half of the
 * drill. It tests I1's cards both ways (research/02 rule 1):
 *
 * - `inversion:1@s3/major`: the root is drawn as a square on its string of
 *   the set, and the learner taps the other two notes of the inversion. Each
 *   tap is marked at once; the round answers at the last note, at the first
 *   wrong tap, or on "Done" (as D9).
 * - `inversion-name:1@s3/major`: a close triad is drawn on the set with no
 *   labels, and the learner names its inversion (root position, 1st or 2nd):
 *   which chord tone is in the bass.
 *
 * Each card is one shape; the root and neck position vary per prompt (rule
 * 12). Confusions are keyed by card, as in the pentatonic drill: building C
 * with E♭ for E is logged against the minor card of the same inversion and
 * set (rule 6: major vs minor), and naming the wrong inversion against that
 * inversion's name card.
 *
 * Once answered, the panel names the CAGED shape the triad sits in
 * (research/03 on I1: "show that triads are the cores of the CAGED shapes").
 */

/** The neck the iPad shows: every inversion fits at every root within it. */
export const D18_REGION: FretRange = { from: 0, to: 15 };

/** The frets iPad portrait shows at once: a 12-fret neck (design §7), 13 cells. */
export const D18_REGULAR_SPAN = 12;

export type D18Mode = 'build' | 'name';

export interface D18Prompt {
  itemId: string;
  mode: D18Mode;
  quality: TriadQuality;
  inversion: Inversion;
  lowString: StringSetLow;
  /** The set's strings, low to high pitch: [3, 2, 1]. */
  strings: number[];
  /** The root, spelled per the accidental preference where the triad allows. */
  root: string;
  /** The chord symbol: `C` or `Cm`. */
  chord: string;
  /** The triad's three notes, low to high. */
  notes: ShapeNote[];
  /** The root among them: the square a build round starts from. */
  anchor: ShapeNote;
  /** Build: the notes to tap (the two that aren't the root). Name: none. */
  targets: ShapeNote[];
  /**
   * Build: the other quality's 3rd at the same root (E♭ for C's E), the tap
   * that makes it the confusable triad. Null when it would fall off the neck.
   */
  partner: Position | null;
  /** The CAGED shapes this triad sits in at this position (none in another tuning). */
  cores: CagedShapeName[];
  scope: D18Scope;
  /** Frets that accept taps; the neck dims the rest (design §7). */
  activeRange: FretRange;
  /**
   * The furthest a note of any inversion lies from its root, in frets, in
   * this tuning. Build windows cover this either side of the root, so they
   * never show which way the shape lies.
   */
  reach: number;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

export type D18Answer =
  | { readonly kind: 'taps'; readonly taps: readonly Position[] }
  | { readonly kind: 'inversion'; readonly inversion: Inversion };

export const D18_INVERSIONS: readonly Inversion[] = [0, 1, 2];

export function d18ScopeFor(level: number): D18Scope {
  const i = Math.max(0, Math.min(D18_SCOPES.length - 1, Math.round(level)));
  return D18_SCOPES[i] as D18Scope;
}

/** Display form: `F#` → `F♯`, `b3` → `♭3`, `Bbm` → `B♭m`. */
export function d18Display(s: string): string {
  return s
    .replace(/^b(?=\d)/, '♭')
    .replace('#', '♯')
    .replace(/(?<=[A-G])b/, '♭');
}

/** "Root position", "1st inversion", "2nd inversion". */
export function d18InversionName(inversion: Inversion): string {
  return ['Root position', '1st inversion', '2nd inversion'][inversion] as string;
}

/** The chord tone in the bass of each inversion. */
const BASS: readonly ['R', '3', '5'] = ['R', '3', '5'];

/** "the root", "the 3rd", "the 5th". */
function bassName(inversion: Inversion): string {
  return ['the root', 'the 3rd', 'the 5th'][inversion] as string;
}

/** The formula degrees of the triad, low string first: "3 5 R", "♭3 5 R". */
export function d18Formula(quality: TriadQuality, inversion: Inversion): string {
  const degrees = quality === 'major' ? ['R', '3', '5'] : ['R', '♭3', '5'];
  return [0, 1, 2].map((i) => degrees[(i + inversion) % 3]).join(' ');
}

/** "strings 3–1". */
export function d18StringSpan(lowString: number): string {
  return `strings ${lowString}–${lowString - 2}`;
}

/** The root's spelling: the preferred accidental, unless the triad would need a double one. */
export function d18SpellRoot(chroma: number, quality: TriadQuality, pref: AccidentalPref): string {
  const preferred = chromaToPc(chroma, pref);
  if (isPracticalSpelling(spellChord(preferred, quality))) return preferred;
  return chromaToPc(chroma, pref === 'sharp' ? 'flat' : 'sharp');
}

/**
 * Every close voicing of the inversion for `root` on the set, inside the
 * region, within a 4-fret stretch. Drop D's root position on strings 6–4
 * needs 5 (string 6 is a fifth below string 5), so a set with none at 4
 * allows 5.
 */
export function d18Voicings(
  root: string,
  quality: TriadQuality,
  lowString: StringSetLow,
  inversion: Inversion,
  tuning: Tuning,
): TriadVoicing[] {
  const within = (maxStretch: number) =>
    triadVoicings(root, quality, lowString, inversion, {
      tuning,
      maxFret: D18_REGION.to,
      maxStretch,
    }).filter((v) => v.notes.every((n) => inRange(n.fret, D18_REGION)));
  const close = within(4);
  return close.length > 0 ? close : within(5);
}

const reaches = new Map<string, number>();

/** The furthest a note of any inversion lies from its root, in `tuning`. */
export function d18Reach(tuning: Tuning): number {
  const cached = reaches.get(tuning.id);
  if (cached !== undefined) return cached;
  let reach = 0;
  for (const quality of ['major', 'minor'] as const) {
    for (const low of [3, 4, 5, 6] as const) {
      for (const inv of D18_INVERSIONS) {
        for (let chroma = 0; chroma < 12; chroma++) {
          for (const v of d18Voicings(chromaToPc(chroma), quality, low, inv, tuning)) {
            const root = v.notes.find((n) => n.degree === 'R') as ShapeNote;
            for (const n of v.notes) reach = Math.max(reach, Math.abs(n.fret - root.fret));
          }
        }
      }
    }
  }
  reaches.set(tuning.id, reach);
  return reach;
}

function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

/** True when the set's strings are tuned as in standard tuning, so CAGED templates apply. */
function standardOn(strings: readonly number[], tuning: Tuning): boolean {
  return strings.every((s) => openStringMidi(s, tuning) === openStringMidi(s, STANDARD_TUNING));
}

/**
 * The CAGED shapes whose triad core on this set is this voicing, at the same
 * frets: C major root position on strings 3–1 is the A shape's core, and
 * G–C–E at frets 12–13 sits in both the C and D shapes.
 */
export function d18CoreShapes(voicing: TriadVoicing, lowString: number): CagedShapeName[] {
  return CAGED_ORDER.filter((shape) =>
    // The shape's lowest position, and the one an octave up.
    [0, 12].some((minFret) => {
      let placed;
      try {
        placed = cagedShape(shape, voicing.root, { quality: voicing.quality, minFret });
      } catch {
        return false; // past the last fret
      }
      return triadCores(placed).some(
        (core) =>
          core.lowString === lowString &&
          core.notes.every((n, i) => samePosition(n, voicing.notes[i] as ShapeNote)),
      );
    }),
  );
}

/**
 * The voicings whose prompt fits iPad portrait's neck at frets 0–12, with the
 * nut and string names (M6-14), or all of them when none does. A name round
 * needs the triad there; a build round the root's reach either side, so the
 * window still never shows which way the shape lies. The octave above is the
 * same shape, and iPad landscape shows it only where the low one won't fit.
 */
export function d18PortraitFirst(
  voicings: readonly TriadVoicing[],
  mode: D18Mode,
  reach: number,
): readonly TriadVoicing[] {
  const fits = voicings.filter((v) => {
    const top =
      mode === 'build'
        ? (v.notes.find((n) => n.degree === 'R') as ShapeNote).fret + reach
        : Math.max(...v.notes.map((n) => n.fret));
    return top <= D18_REGULAR_SPAN;
  });
  return fits.length > 0 ? fits : voicings;
}

export function d18MakePrompt(item: Item, ctx: DrillContext): D18Prompt {
  const ref = parseInversionItemId(item.id);
  const { tuning, accidentalPref } = ctx;
  if (!ref || stringCount(tuning) !== 6) throw new Error(`D18 cannot test item ${item.id}`);
  const { quality, inversion, lowString } = ref;
  const scope = d18ScopeFor(ctx.scopeLevel);
  const roots = (scope === 'naturals' ? NATURAL_PCS.map(chromaOf) : [...Array(12).keys()])
    .map((chroma) => d18SpellRoot(chroma, quality, accidentalPref))
    .filter((pc) => d18Voicings(pc, quality, lowString, inversion, tuning).length > 0);
  const mode: D18Mode = ref.kind === 'inversion' ? 'build' : 'name';
  const reach = d18Reach(tuning);
  const root = pick(roots, ctx.rng);
  const voicing =
    root &&
    pick(
      d18PortraitFirst(d18Voicings(root, quality, lowString, inversion, tuning), mode, reach),
      ctx.rng,
    );
  if (!root || !voicing) throw new Error(`D18 cannot place item ${item.id}`);

  const notes = [...voicing.notes];
  const anchor = notes.find((n) => n.degree === 'R') as ShapeNote;
  const third = notes.find((n) => n.degree === '3' || n.degree === 'b3') as ShapeNote;
  const partnerFret = third.fret + (quality === 'major' ? -1 : 1);
  const strings = [lowString, lowString - 1, lowString - 2];
  return {
    itemId: item.id,
    mode,
    quality,
    inversion,
    lowString,
    strings,
    root,
    chord: `${root}${quality === 'minor' ? 'm' : ''}`,
    notes,
    anchor,
    targets: mode === 'build' ? notes.filter((n) => n !== anchor) : [],
    partner:
      mode === 'build' && inRange(partnerFret, D18_REGION)
        ? { string: third.string, fret: partnerFret }
        : null,
    cores: standardOn(strings, tuning) ? d18CoreShapes(voicing, lowString) : [],
    scope,
    activeRange: D18_REGION,
    reach,
    tuning,
    accidentalPref,
  };
}

// --- Build rounds ------------------------------------------------------------

export function d18IsLive(prompt: D18Prompt, pos: Position): boolean {
  return inRange(pos.fret, prompt.activeRange);
}

export function d18TargetAt(prompt: D18Prompt, pos: Position): ShapeNote | undefined {
  return prompt.targets.find((t) => samePosition(t, pos));
}

/** The taps of an answer; none for a named inversion. */
export function d18Taps(answer: D18Answer): readonly Position[] {
  return answer.kind === 'taps' ? answer.taps : [];
}

/** The targets among the taps, in tap order. */
export function d18Found(prompt: D18Prompt, taps: readonly Position[]): ShapeNote[] {
  return taps.flatMap((p) => d18TargetAt(prompt, p) ?? []);
}

/** The targets not tapped. */
export function d18Missed(prompt: D18Prompt, taps: readonly Position[]): ShapeNote[] {
  return prompt.targets.filter((t) => !taps.some((p) => samePosition(p, t)));
}

/** Taps that are not a target (the given root is never an answer). */
export function d18WrongTaps(prompt: D18Prompt, taps: readonly Position[]): Position[] {
  return taps.filter((p) => !d18TargetAt(prompt, p) && !samePosition(p, prompt.anchor));
}

/** "C in 1st inversion on strings 3–1": the feedback bar's answer. */
export function d18Subject(prompt: D18Prompt): string {
  const chord = d18Display(prompt.chord);
  const where = d18StringSpan(prompt.lowString);
  return prompt.inversion === 0
    ? `${chord} in root position on ${where}`
    : `${chord} in ${d18InversionName(prompt.inversion).toLowerCase()} on ${where}`;
}

function other(prompt: D18Prompt): TriadQuality {
  return prompt.quality === 'major' ? 'minor' : 'major';
}

export function d18Check(prompt: D18Prompt, answer: D18Answer): DrillCheck {
  if (prompt.mode === 'name') {
    const expected = d18InversionName(prompt.inversion);
    if (answer.kind !== 'inversion') return { correct: false, expected };
    if (answer.inversion === prompt.inversion) return { correct: true, expected };
    return {
      correct: false,
      expected,
      confusedWith: inversionItemId(
        'inversion-name',
        answer.inversion,
        prompt.lowString,
        prompt.quality,
      ),
      concept: prompt.itemId,
    };
  }
  const expected = d18Subject(prompt);
  const taps = d18Taps(answer);
  const wrong = d18WrongTaps(prompt, taps)[0];
  if (wrong) {
    return prompt.partner && samePosition(wrong, prompt.partner)
      ? {
          correct: false,
          expected,
          confusedWith: inversionItemId(
            'inversion',
            prompt.inversion,
            prompt.lowString,
            other(prompt),
          ),
          concept: prompt.itemId,
        }
      : { correct: false, expected };
  }
  return { correct: d18Missed(prompt, taps).length === 0, expected };
}

export function d18DescribeAnswer(answer: D18Answer): string {
  if (answer.kind === 'inversion') return d18InversionName(answer.inversion);
  return answer.taps.map((p) => `s${p.string}f${p.fret}`).join(' ') || 'none';
}

/** A build round grades its completion time per note, so the usual speed targets apply (design §3.2). */
export function d18GradedResponseMs(
  prompt: D18Prompt,
  _answer: D18Answer,
  elapsedMs: number,
): number {
  return prompt.mode === 'build' ? elapsedMs / Math.max(1, prompt.targets.length) : elapsedMs;
}

const byPitch = (tuning: Tuning) => (a: Position, b: Position) =>
  midiAt(a, tuning) - midiAt(b, tuning);

function names(prompt: D18Prompt, positions: readonly Position[]): string[] {
  const sorted = [...positions].sort(byPitch(prompt.tuning));
  return sorted.map((p) => noteAt(p, prompt.tuning, prompt.accidentalPref).name);
}

/** The triad, low to high (sound, sight and name together); a wrong tap adds the tapped note. */
export function d18Sounds(prompt: D18Prompt, fb: DrillFeedback<D18Answer>): DrillSounds {
  const expected = names(prompt, prompt.notes);
  const wrong = d18WrongTaps(prompt, d18Taps(fb.answer));
  return wrong.length > 0 ? { expected, given: names(prompt, wrong) } : { expected };
}

export function d18FeedbackPositions(
  prompt: D18Prompt,
  fb: DrillFeedback<D18Answer>,
): { expected: Position[]; given: Position[] } {
  if (prompt.mode === 'name') return { expected: prompt.notes, given: [] };
  return { expected: prompt.targets, given: d18WrongTaps(prompt, d18Taps(fb.answer)) };
}

/** The chord tone on a degree, spelled as the triad spells it: the ♭3 of Cm is E♭. */
export function d18Tone(root: string, quality: TriadQuality, degree: Degree): string {
  const chordDegree: ChordDegree = degree === 'R' ? '1' : degree;
  return d18Display(chordToneOf(root, quality, chordDegree) ?? root);
}

/** "the 3rd, E, is in the bass". */
function bassLine(prompt: D18Prompt): string {
  const degree = BASS[prompt.inversion] as Degree;
  const minor3 = degree === '3' && prompt.quality === 'minor';
  const tone = d18Tone(prompt.root, prompt.quality, minor3 ? 'b3' : degree);
  return `${bassName(prompt.inversion)}, ${tone}, is in the bass`;
}

function where(pos: Position): string {
  return `string ${pos.string}, fret ${pos.fret}`;
}

/** One line of feedback: the triad's degrees and its bass, or what went wrong. */
export function d18Explain(prompt: D18Prompt, fb: DrillFeedback<D18Answer>): string {
  const formula = `${d18Formula(prompt.quality, prompt.inversion)} from string ${prompt.lowString}`;
  if (prompt.mode === 'name') {
    const name = d18InversionName(prompt.inversion);
    const it = `${name}: ${bassLine(prompt)} (${formula}).`;
    if (fb.result.correct) return `That's ${it}`;
    if (fb.answer.kind !== 'inversion') return `It's ${it}`;
    const picked = fb.answer.inversion;
    return `${d18InversionName(picked)} has ${bassName(picked)} in the bass. This is ${it}`;
  }
  const shape = `${d18Subject(prompt)}: ${formula}.`;
  if (fb.result.correct) return `That's ${shape}`;
  const taps = d18Taps(fb.answer);
  const wrong = d18WrongTaps(prompt, taps)[0];
  const missed = d18Missed(prompt, taps).length;
  const left = missed > 0 ? ` ${missed} still to find, ringed on the neck.` : '';
  if (!wrong) return `It's ${shape}${left}`;
  const tapped = `You tapped ${where(wrong)}.`;
  if (fb.result.confusedWith) {
    const own = prompt.quality === 'major' ? '3' : 'b3';
    const theirs = prompt.quality === 'major' ? 'b3' : '3';
    const chord = d18Display(`${prompt.root}${other(prompt) === 'minor' ? 'm' : ''}`);
    return (
      `${tapped} That's ${d18Tone(prompt.root, other(prompt), theirs)}, ` +
      `the ${d18Display(theirs)} of ${chord}; ${d18Display(prompt.chord)} has ` +
      `${d18Tone(prompt.root, prompt.quality, own)}. It's ${shape}`
    );
  }
  return `${tapped} It's ${shape}`;
}

/** Feedback and found notes are drawn by degree, in shape as well as colour. */
export function d18DegreeStyle(degree: Degree): 'root' | 'third' | 'fifth' {
  if (degree === 'R') return 'root';
  if (degree === '5') return 'fifth';
  return 'third';
}

/** Keys for the inversion buttons: R for root position, then 1 and 2. */
export function d18KeyToInversion(key: string): Inversion | null {
  if (key === 'r' || key === 'R' || key === '0') return 0;
  if (key === '1') return 1;
  if (key === '2') return 2;
  return null;
}

// --- Windows ---------------------------------------------------------------

/** The frets the prompt must show: the root's reach either side (build), or the triad (name). */
function needed(prompt: D18Prompt): FretRange {
  if (prompt.mode === 'build') {
    return { from: prompt.anchor.fret - prompt.reach, to: prompt.anchor.fret + prompt.reach };
  }
  const frets = prompt.notes.map((n) => n.fret);
  return { from: Math.min(...frets), to: Math.max(...frets) };
}

/**
 * The neck shown: the whole region on iPad landscape; iPad portrait's
 * 12-fret neck slid just far enough to hold what's needed; compact screens a
 * window centred on it. A build window follows the root alone, so it never
 * hints at which way the inversion lies.
 */
export function d18Window(
  prompt: D18Prompt,
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
    ENGINE_CONFIG.triadInversions.compactWindowFrets,
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
