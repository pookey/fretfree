import { allStrings, chromaOf, midiAt, type FretRange, type Position } from './fretboard';
import { chordFormula, spellChord, type ChordDegree, type ChordKind } from './chords';
import { pentatonicBox, boxForShape, type PentatonicQuality } from './pentatonic';
import type { CagedShapeName } from './shapes';

/**
 * Arpeggio shapes and chord-scale relationships (topic I2), standard tuning.
 *
 * A CAGED arpeggio is every chord tone inside the frets of one CAGED position:
 * the frets of the pentatonic box that wraps the shape, so boxes, shapes and
 * arpeggios share one map (research/03 I2: "chord tones inside any box").
 * Chords with a minor third use the minor box; everything else the major box.
 * The window is a fret rectangle, so a few kinds (aug, dim7) can hold a
 * unison pair across the G–B strings; both are kept.
 */

export interface ArpeggioNote extends Position {
  /** Pitch class as the chord spells it. */
  readonly pc: string;
  readonly degree: ChordDegree;
}

export interface Arpeggio {
  readonly root: string;
  readonly kind: ChordKind;
  readonly shape: CagedShapeName;
  readonly span: FretRange;
  /** Ascending in pitch. */
  readonly notes: readonly ArpeggioNote[];
}

function byPitch(a: Position, b: Position): number {
  return midiAt(a) - midiAt(b) || b.string - a.string;
}

/** Major or minor, by the chord's third: m7b5 and dim use the minor box, sus the major one. */
export function arpeggioBoxQuality(kind: ChordKind): PentatonicQuality {
  return chordFormula(kind).includes('b3') ? 'minor' : 'major';
}

/** The chord-tone label of a position, or `null` if it isn't a chord tone. */
function chordToneAt(root: string, kind: ChordKind, pos: Position): ArpeggioNote | null {
  const c = midiAt(pos) % 12;
  const tones = spellChord(root, kind);
  const i = tones.findIndex((n) => chromaOf(n) === c);
  if (i < 0) return null;
  return {
    string: pos.string,
    fret: pos.fret,
    pc: tones[i] as string,
    degree: chordFormula(kind)[i] as ChordDegree,
  };
}

/** Every chord tone in a fret window, ascending in pitch. */
export function arpeggioInWindow(root: string, kind: ChordKind, window: FretRange): ArpeggioNote[] {
  const out: ArpeggioNote[] = [];
  for (const string of allStrings()) {
    for (let fret = window.from; fret <= window.to; fret++) {
      const note = chordToneAt(root, kind, { string, fret });
      if (note) out.push(note);
    }
  }
  return out.sort(byPitch);
}

/**
 * The arpeggio of a chord in one CAGED position: A major in the E shape is
 * frets 4–7 (R 3 5 R 3 5 R from string 6).
 */
export function cagedArpeggio(
  shape: CagedShapeName,
  root: string,
  kind: ChordKind,
  opts: { minFret?: number } = {},
): Arpeggio {
  const box = pentatonicBox(root, arpeggioBoxQuality(kind), boxForShape(shape), opts);
  return {
    root: box.root,
    kind,
    shape,
    span: box.span,
    notes: arpeggioInWindow(box.root, kind, box.span),
  };
}

/**
 * The chord tones among a set of positions, e.g. the A7 tones inside an A
 * minor box. Order is kept.
 */
export function chordTonesIn(
  positions: readonly Position[],
  root: string,
  kind: ChordKind,
): ArpeggioNote[] {
  return positions.flatMap((p) => {
    const note = chordToneAt(root, kind, p);
    return note ? [note] : [];
  });
}

const GUIDE_DEGREES: readonly ChordDegree[] = ['3', 'b3', '7', 'b7', 'bb7'];

/** The chord's guide tones: its 3rd and 7th (just the 3rd for a triad; none for sus). */
export function guideTones(kind: ChordKind): ChordDegree[] {
  return chordFormula(kind).filter((d) => GUIDE_DEGREES.includes(d));
}

/** Target notes for soloing over the chord: the guide-tone positions among `positions`. */
export function targetNotes(
  positions: readonly Position[],
  root: string,
  kind: ChordKind,
): ArpeggioNote[] {
  const guides = guideTones(kind);
  return chordTonesIn(positions, root, kind).filter((n) => guides.includes(n.degree));
}

export interface ChordScaleFit {
  /** Chord degrees whose pitch is in the scale. */
  readonly inside: readonly ChordDegree[];
  /** Chord degrees the scale lacks: A7 over A minor pentatonic is missing the 3. */
  readonly outside: readonly ChordDegree[];
}

/** How a chord sits in a scale (any spelling of the scale notes). */
export function chordScaleFit(
  root: string,
  kind: ChordKind,
  scale: readonly string[],
): ChordScaleFit {
  const chromas = new Set(scale.map(chromaOf));
  const tones = spellChord(root, kind);
  const formula = chordFormula(kind);
  const inside: ChordDegree[] = [];
  const outside: ChordDegree[] = [];
  tones.forEach((t, i) =>
    (chromas.has(chromaOf(t)) ? inside : outside).push(formula[i] as ChordDegree),
  );
  return { inside, outside };
}
