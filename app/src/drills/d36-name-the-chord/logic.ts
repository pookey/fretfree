import { ENGINE_CONFIG } from '../../engine/config';
import { parseChordNameItemId, type Item } from '../../engine/model';
import {
  NATURAL_PCS,
  chordKindInfo,
  chordToneOf,
  chromaOf,
  chromaToPc,
  isChordVoicing,
  isPracticalSpelling,
  midiAt,
  midiToFretNote,
  nameChord,
  noteAt,
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
import { placements, templatesFor } from '../../theory/voicings';
import type { SizeClass } from '../../shell/size-class';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D36_QUALITIES, D36_SCOPES, d36CanTest, d36Concept, type D36Scope } from './meta';

export {
  D36_ID,
  D36_QUALITIES,
  D36_SCOPE,
  D36_SCOPES,
  d36CanTest,
  d36Concept,
  d36ConceptOf,
  type D36Scope,
} from './meta';

/**
 * D36 "What chord is this?" (design §6), the pure half of the drill. A
 * voicing is drawn on the neck or as a chord diagram, and the learner names
 * it: the root, then the quality.
 *
 * One card per quality in one shape family (`chord-name:A-shape@m7`). The
 * root and the neck position vary per prompt, as do the neck and the chart
 * view, so a card meets its shape in many keys and positions (rule 12). The
 * quality buttons always offer all eight qualities, so major meets minor and
 * 7 meets maj7 every time; the confusion matrix keys a quality as D7 does
 * (`triad:maj`, `chord:7` …), so the seed pairs interleave them (rule 6).
 */

/** The neck the iPad shows: every voicing fits at every root within it. */
export const D36_REGION: FretRange = { from: 0, to: 15 };

export interface ChordNote extends Position {
  readonly degree: ChordDegree;
  /** The note as the chord spells it: the ♭3 of A minor is C, not B♯. */
  readonly name: string;
}

export type D36Voicing = 'open' | 'barre' | 'shape';

/** The index-finger barre of a barre chord: across `fret`, strings `from` (1) to `to`. */
export interface D36Barre {
  fret: number;
  from: number;
  to: number;
}

/** Where the voicing is drawn: on the neck, or as a chord diagram. */
export type D36Display = 'neck' | 'diagram';

export interface D36Prompt {
  itemId: string;
  kind: ChordKind;
  shape: CagedShapeName;
  /** The root, spelled per the accidental preference where the chord allows. */
  root: string;
  /** The chord symbol, e.g. `Am7`. */
  chord: string;
  voicing: D36Voicing;
  /** The barre, for a barre chord. */
  barre: D36Barre | null;
  display: D36Display;
  /** Every note of the voicing, low to high in pitch. The root is the lowest. */
  notes: ChordNote[];
  /** The frets the voicing spans. */
  span: FretRange;
  /** The root buttons: the 12 pitch classes, spelled per the accidental preference. */
  roots: string[];
  scope: D36Scope;
  tuning: Tuning;
  accidentalPref: AccidentalPref;
}

/** The root (any spelling: A♯ and B♭ are the same answer) and the quality. */
export interface D36Answer {
  root: string;
  kind: ChordKind;
}

export function d36ScopeFor(level: number): D36Scope {
  const i = Math.max(0, Math.min(D36_SCOPES.length - 1, Math.round(level)));
  return D36_SCOPES[i] as D36Scope;
}

/** Display form of a note or chord: `F#m7b5` → `F♯m7♭5`, `Bb` → `B♭`. */
export function d36Display(s: string): string {
  return s
    .replace(/#/g, '♯')
    .replace(/(?<=^[A-G])b/, '♭')
    .replace(/7b5$/, '7♭5');
}

/** A quality button's text: `major`, `minor`, `7`, `maj7`, `m7`, `m7♭5`, `sus2`, `sus4`. */
export function d36QualityLabel(kind: ChordKind): string {
  if (kind === 'major' || kind === 'minor') return kind;
  return chordKindInfo(kind).suffix.replace('b5', '♭5');
}

/** For screen readers and prose: "dominant seventh", "suspended fourth". */
export function d36QualityName(kind: ChordKind): string {
  return chordKindInfo(kind).name;
}

/** The chord in words, symbol first: "Am7 (A minor seventh)". */
export function d36ChordName(root: string, kind: ChordKind): string {
  const symbol = d36Display(nameChord(root, kind));
  return `${symbol} (${d36Display(root)} ${d36QualityName(kind)})`;
}

/** The root's spelling: the preferred accidental, unless the chord would need a double one. */
export function d36SpellRoot(chroma: number, kind: ChordKind, pref: AccidentalPref): string {
  const preferred = chromaToPc(chroma, pref);
  if (isPracticalSpelling(spellChord(preferred, kind))) return preferred;
  return chromaToPc(chroma, pref === 'sharp' ? 'flat' : 'sharp');
}

function pick<T>(xs: readonly T[], rng: () => number): T | undefined {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

/**
 * An E or A shape up the neck whose top string sits at the root's fret is a
 * barre chord: the index finger lies across that fret, from the root string
 * to string 1. Grips that leave string 1 out (the m7♭5s) are fingered
 * note by note.
 */
function barreOf(shape: CagedShapeName, notes: readonly ChordNote[]): D36Barre | null {
  const root = notes[0];
  if ((shape !== 'E' && shape !== 'A') || !root || root.fret === 0) return null;
  const top = notes.find((n) => n.string === 1);
  return top?.fret === root.fret ? { fret: root.fret, from: 1, to: root.string } : null;
}

/** Open if a string rings open, a barre chord if barred, otherwise a moved shape. */
function voicingOf(notes: readonly Position[], barre: D36Barre | null): D36Voicing {
  if (notes.some((n) => n.fret === 0)) return 'open';
  return barre ? 'barre' : 'shape';
}

export function d36MakePrompt(item: Item, ctx: DrillContext): D36Prompt {
  const ref = parseChordNameItemId(item.id);
  const { tuning, accidentalPref, rng } = ctx;
  const t = ref && templatesFor(ref.chord).find((x) => x.shape === ref.shape);
  if (!ref || !t || !d36CanTest(item) || stringCount(tuning) !== 6) {
    throw new Error(`D36 cannot test item ${item.id}`);
  }
  const scope = d36ScopeFor(ctx.scopeLevel);
  const kind = ref.chord;
  const chromas = scope === 'naturals' ? NATURAL_PCS.map(chromaOf) : [...Array(12).keys()];
  const roots = chromas
    .map((c) => d36SpellRoot(c, kind, accidentalPref))
    .filter((r) => placements(t, r, tuning, D36_REGION.to).length > 0);
  const root = pick(roots, rng);
  const options = root ? placements(t, root, tuning, D36_REGION.to) : [];
  const placed = scope === 'anywhere' ? pick(options, rng) : options[0];
  if (!root || !placed) throw new Error(`D36 cannot place item ${item.id}`);
  const display: D36Display = rng() < ENGINE_CONFIG.nameChord.diagramShare ? 'diagram' : 'neck';

  const notes: ChordNote[] = placed
    .map((n) => ({ ...n, name: chordToneOf(root, kind, n.degree) as string }))
    .sort((a, b) => midiAt(a, tuning) - midiAt(b, tuning));
  const frets = notes.map((n) => n.fret);
  const barre = barreOf(t.shape, notes);
  const voicing = voicingOf(notes, barre);
  return {
    itemId: item.id,
    kind,
    shape: t.shape,
    root,
    chord: nameChord(root, kind),
    voicing,
    barre: voicing === 'barre' ? barre : null,
    display,
    notes,
    span: { from: Math.min(...frets), to: Math.max(...frets) },
    roots: Array.from({ length: 12 }, (_, c) => chromaToPc(c, accidentalPref)),
    scope,
    tuning,
    accidentalPref,
  };
}

// --- Grading ---------------------------------------------------------------

/** The root and the quality the voicing was drawn as. */
export function d36Exact(prompt: D36Prompt, answer: D36Answer): boolean {
  return chromaOf(answer.root) === chromaOf(prompt.root) && answer.kind === prompt.kind;
}

/**
 * Another name for exactly these notes: Asus2 (A B E) is Esus4 (E A B). The
 * voicing is named from its lowest note, but the other name isn't wrong.
 */
export function d36SameNotes(prompt: D36Prompt, answer: D36Answer): boolean {
  return (
    !d36Exact(prompt, answer) &&
    isChordVoicing(
      answer.root,
      answer.kind,
      prompt.notes.map((n) => n.name),
    )
  );
}

export function d36Check(prompt: D36Prompt, answer: D36Answer): DrillCheck {
  const expected = d36ChordName(prompt.root, prompt.kind);
  const concept = d36Concept(prompt.kind);
  if (d36Exact(prompt, answer) || d36SameNotes(prompt, answer)) {
    return { correct: true, expected, concept };
  }
  // The right quality on the wrong root is a misread root, not a confused quality.
  if (answer.kind === prompt.kind) return { correct: false, expected, concept };
  return { correct: false, expected, concept, confusedWith: d36Concept(answer.kind) };
}

export function d36DescribeAnswer(answer: D36Answer): string {
  return nameChord(answer.root, answer.kind);
}

/** Two choices make one answer: grade the time per choice (design §3.2). */
export function d36GradedResponseMs(_p: D36Prompt, _a: D36Answer, elapsedMs: number): number {
  return elapsedMs / ENGINE_CONFIG.nameChord.answerParts;
}

/** The named chord as a close voicing from its root, from the octave below middle C. */
function closeVoicing(answer: D36Answer, pref: AccidentalPref): string[] {
  let midi = 48 + chromaOf(answer.root);
  return spellChord(answer.root, answer.kind).map((pc, i) => {
    if (i > 0) midi += (((chromaOf(pc) - midi) % 12) + 12) % 12 || 12;
    return midiToFretNote(midi, pref).name;
  });
}

/**
 * The voicing low to high (sound, sight and name together, design §7). A
 * wrong answer adds the chord the learner named, so its quality is heard
 * against the right one.
 */
export function d36Sounds(prompt: D36Prompt, fb: DrillFeedback<D36Answer>): DrillSounds {
  const expected = prompt.notes.map((n) => noteAt(n, prompt.tuning, prompt.accidentalPref).name);
  if (fb.result.correct) return { expected };
  return { expected, given: closeVoicing(fb.answer, prompt.accidentalPref) };
}

// --- Feedback --------------------------------------------------------------

/** Dot label: `R`, `♭3`, `3`, `5`, `♭5`, `♭7`, `7`, `2`, `4`. */
export function d36DegreeLabel(degree: ChordDegree): string {
  return degree === '1' ? 'R' : degree.replace(/^b/, '♭');
}

/** Notes drawn by degree, in shape as well as colour; a sus chord's 2nd or 4th is a plain tone. */
export function d36DegreeStyle(
  degree: ChordDegree,
): 'root' | 'third' | 'fifth' | 'seventh' | 'tone' {
  if (degree === '1') return 'root';
  if (degree === '3' || degree === 'b3') return 'third';
  if (degree === '5' || degree === 'b5') return 'fifth';
  if (degree === '7' || degree === 'b7') return 'seventh';
  return 'tone';
}

/** The notes that decide each quality, once the root is known. */
const DECIDING: Readonly<Record<string, readonly ChordDegree[]>> = {
  major: ['3'],
  minor: ['b3'],
  '7': ['3', 'b7'],
  maj7: ['3', '7'],
  m7: ['b3', 'b7'],
  m7b5: ['b3', 'b5', 'b7'],
  sus2: ['2'],
  sus4: ['4'],
};

const INTERVAL_WORDS: Partial<Record<ChordDegree, string>> = {
  '2': 'major 2nd',
  '3': 'major 3rd',
  b3: 'minor 3rd',
  '4': 'perfect 4th',
  b5: 'diminished 5th',
  '7': 'major 7th',
  b7: 'minor 7th',
};

/** The chord tone a degree stands for: `b3` → `3rd`. */
function ordinal(degree: ChordDegree): string {
  const n = degree.replace(/^b/, '');
  return n === '3' ? '3rd' : n === '2' ? '2nd' : `${n}th`;
}

/**
 * Which notes decided the quality: "The 3rd is C, a minor 3rd above A." A
 * seventh chord adds its 7th (and a m7♭5 its 5th); a sus chord has no 3rd.
 */
export function d36Deciding(prompt: D36Prompt): string {
  const root = d36Display(prompt.root);
  const tone = (d: ChordDegree) => d36Display(chordToneOf(prompt.root, prompt.kind, d) as string);
  const [first, ...rest] = DECIDING[prompt.kind] ?? [];
  if (!first) return '';
  const firstWords = `${tone(first)}, a ${INTERVAL_WORDS[first]} above ${root}`;
  if (first === '2' || first === '4') return `There's no 3rd: ${firstWords}, takes its place.`;
  const more = rest.map((d) => `; the ${ordinal(d)} is ${tone(d)}, a ${INTERVAL_WORDS[d]}`);
  return `The 3rd is ${firstWords}${more.join('')}.`;
}

function where(pos: Position): string {
  return pos.fret === 0 ? `string ${pos.string}, open` : `string ${pos.string}, fret ${pos.fret}`;
}

/** "The root is A, the lowest note (string 5, open)." */
export function d36RootLine(prompt: D36Prompt): string {
  const lowest = prompt.notes[0] as ChordNote;
  return `The root is ${d36Display(prompt.root)}, the lowest note (${where(lowest)}).`;
}

/** "Open chord, A shape", "E-shape barre at fret 5", "C shape, frets 8–10". */
export function d36VoicingLine(prompt: D36Prompt): string {
  const { from, to } = prompt.span;
  if (prompt.voicing === 'open') return `Open chord, ${prompt.shape} shape`;
  if (prompt.barre) return `${prompt.shape}-shape barre at fret ${prompt.barre.fret}`;
  return `${prompt.shape} shape, frets ${from}–${to}`;
}

/** The feedback line: what the chord is, what the learner said, and which notes decide it. */
export function d36Explain(prompt: D36Prompt, fb: DrillFeedback<D36Answer>): string {
  const chord = d36Display(prompt.chord);
  const given = d36Display(nameChord(fb.answer.root, fb.answer.kind));
  const shape = `${d36VoicingLine(prompt)}.`;
  if (fb.result.correct && d36SameNotes(prompt, fb.answer)) {
    return `Yes: ${given} has the same notes. Named from its lowest note, it's ${chord}. ${shape}`;
  }
  if (fb.result.correct) return `Yes: ${chord}. ${d36Deciding(prompt)} ${shape}`;
  const rootWrong = chromaOf(fb.answer.root) !== chromaOf(prompt.root);
  const parts = [`It's ${chord}, not ${given}.`];
  if (rootWrong) parts.push(d36RootLine(prompt));
  parts.push(d36Deciding(prompt), shape);
  return parts.join(' ');
}

// --- Input -----------------------------------------------------------------

const QUALITY_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export function d36QualityKeyFor(index: number): string | undefined {
  return QUALITY_KEYS[index];
}

/** Hardware keyboard (design §7): the number row picks a quality by position. */
export function d36KeyToQuality(key: string): ChordKind | null {
  const i = QUALITY_KEYS.indexOf(key);
  return i < 0 ? null : (D36_QUALITIES[i] ?? null);
}

/** A–G pick a natural root. */
export function d36KeyToRoot(key: string): string | null {
  const letter = key.toUpperCase();
  return key.length === 1 && NATURAL_PCS.includes(letter) ? letter : null;
}

/** `#` raises the chosen root a half step, spelled per the accidental preference. */
export function d36Sharpen(root: string, pref: AccidentalPref): string {
  return chromaToPc(chromaOf(root) + 1, pref);
}

// --- Windows ---------------------------------------------------------------

/**
 * The frets on screen: the whole neck on iPad landscape; a 12-fret neck on
 * iPad portrait, slid up when the voicing sits above fret 12; on compact a
 * window round the voicing, at least `compactFrets` wide.
 */
export function d36Window(
  prompt: D36Prompt,
  sizeClass: SizeClass,
  compactFrets: number,
): FretRange {
  const { from, to } = prompt.span;
  if (sizeClass === 'regular-wide') return D36_REGION;
  if (sizeClass === 'regular') {
    return to > D36_REGION.to - 3
      ? { from: D36_REGION.to - 12, to: D36_REGION.to }
      : { from: 0, to: 12 };
  }
  const width = Math.max(compactFrets, ENGINE_CONFIG.nameChord.compactWindowFrets, to - from + 1);
  const start = Math.max(
    D36_REGION.from,
    Math.min(from - Math.floor((width - (to - from + 1)) / 2), D36_REGION.to - width + 1),
  );
  return { from: start, to: start + width - 1 };
}
