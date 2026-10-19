import type { ChordDegree, ChordKind } from './chords';
import { STANDARD_TUNING, chromaOf, openStringMidi, type Position, type Tuning } from './fretboard';
import {
  CAGED_ORDER,
  cagedShape,
  type CagedQuality,
  type CagedShapeName,
  type Degree,
} from './shapes';

/**
 * Movable chord voicings for the chord drills (D8 chord tones, D36 naming):
 * the CAGED shapes of major, minor and 7 chords (shapes.ts), plus the common
 * maj7, m7, m7♭5, sus2 and sus4 voicings, each named after its CAGED family.
 * Placed at the nut they are the open chords (C x32010, Am7 x02010, Gmaj7
 * 320002, Dsus4 xx0233 …); moved up the neck, the E and A shapes are the
 * barre chords. Offsets are frets from the root on `rootString`, in standard
 * tuning. Every voicing has its root as its lowest note.
 */

export interface TemplateNote {
  readonly string: number;
  readonly offset: number;
  readonly degree: ChordDegree;
}

export interface VoicingTemplate {
  readonly shape: CagedShapeName;
  readonly kind: ChordKind;
  readonly rootString: number;
  /** Low string first. */
  readonly notes: readonly TemplateNote[];
}

const CAGED_KIND: Partial<Record<ChordKind, CagedQuality>> = {
  major: 'major',
  minor: 'minor',
  '7': 'dominant7',
};

const SHAPE_DEGREE: Record<Degree, ChordDegree> = {
  R: '1',
  '3': '3',
  b3: 'b3',
  '5': '5',
  b7: 'b7',
};

/** A CAGED shape from theory, as offsets from its root. */
function fromCaged(shape: CagedShapeName, kind: ChordKind, quality: CagedQuality): VoicingTemplate {
  const s = cagedShape(shape, 'C', { quality, minFret: 6 });
  return {
    shape,
    kind,
    rootString: s.rootString,
    notes: s.notes.map((n) => ({
      string: n.string,
      offset: n.fret - s.rootFret,
      degree: SHAPE_DEGREE[n.degree],
    })),
  };
}

type Row = readonly (readonly [string: number, offset: number, degree: ChordDegree])[];

function template(
  shape: CagedShapeName,
  kind: ChordKind,
  rootString: number,
  rows: Row,
): VoicingTemplate {
  return {
    shape,
    kind,
    rootString,
    notes: rows.map(([string, offset, degree]) => ({ string, offset, degree })),
  };
}

/**
 * The open maj7, m7, m7♭5 and sus chords each shape is named after, and
 * their barre forms. The CAGED families with no common voicing of a kind are
 * left out.
 */
const OTHERS: readonly VoicingTemplate[] = [
  // Emaj7 021100, Amaj7 x02120, Cmaj7 x32000, Dmaj7 xx0222, Gmaj7 320002.
  template('E', 'maj7', 6, [
    [6, 0, '1'],
    [5, 2, '5'],
    [4, 1, '7'],
    [3, 1, '3'],
    [2, 0, '5'],
    [1, 0, '1'],
  ]),
  template('A', 'maj7', 5, [
    [5, 0, '1'],
    [4, 2, '5'],
    [3, 1, '7'],
    [2, 2, '3'],
    [1, 0, '5'],
  ]),
  template('C', 'maj7', 5, [
    [5, 0, '1'],
    [4, -1, '3'],
    [3, -3, '5'],
    [2, -3, '7'],
    [1, -3, '3'],
  ]),
  template('D', 'maj7', 4, [
    [4, 0, '1'],
    [3, 2, '5'],
    [2, 2, '7'],
    [1, 2, '3'],
  ]),
  template('G', 'maj7', 6, [
    [6, 0, '1'],
    [5, -1, '3'],
    [4, -3, '5'],
    [3, -3, '1'],
    [2, -3, '3'],
    [1, -1, '7'],
  ]),
  // Em7 020000, Am7 x02010, Dm7 xx0211: the m7 barre chords and the open D.
  template('E', 'm7', 6, [
    [6, 0, '1'],
    [5, 2, '5'],
    [4, 0, 'b7'],
    [3, 0, 'b3'],
    [2, 0, '5'],
    [1, 0, '1'],
  ]),
  template('A', 'm7', 5, [
    [5, 0, '1'],
    [4, 2, '5'],
    [3, 0, 'b7'],
    [2, 1, 'b3'],
    [1, 0, '5'],
  ]),
  template('D', 'm7', 4, [
    [4, 0, '1'],
    [3, 2, '5'],
    [2, 1, 'b7'],
    [1, 1, 'b3'],
  ]),
  // Am7♭5 x0101x, Dm7♭5 xx0111, and the E-shape form (Bm7♭5 7x776x).
  template('E', 'm7b5', 6, [
    [6, 0, '1'],
    [4, 0, 'b7'],
    [3, 0, 'b3'],
    [2, -1, 'b5'],
  ]),
  template('A', 'm7b5', 5, [
    [5, 0, '1'],
    [4, 1, 'b5'],
    [3, 0, 'b7'],
    [2, 1, 'b3'],
  ]),
  template('D', 'm7b5', 4, [
    [4, 0, '1'],
    [3, 1, 'b5'],
    [2, 1, 'b7'],
    [1, 1, 'b3'],
  ]),
  // Esus4 022200, Asus4 x02230, Dsus4 xx0233.
  template('E', 'sus4', 6, [
    [6, 0, '1'],
    [5, 2, '5'],
    [4, 2, '1'],
    [3, 2, '4'],
    [2, 0, '5'],
    [1, 0, '1'],
  ]),
  template('A', 'sus4', 5, [
    [5, 0, '1'],
    [4, 2, '5'],
    [3, 2, '1'],
    [2, 3, '4'],
    [1, 0, '5'],
  ]),
  template('D', 'sus4', 4, [
    [4, 0, '1'],
    [3, 2, '5'],
    [2, 3, '1'],
    [1, 3, '4'],
  ]),
  // Asus2 x02200, Dsus2 xx0230.
  template('A', 'sus2', 5, [
    [5, 0, '1'],
    [4, 2, '5'],
    [3, 2, '1'],
    [2, 0, '2'],
    [1, 0, '5'],
  ]),
  template('D', 'sus2', 4, [
    [4, 0, '1'],
    [3, 2, '5'],
    [2, 3, '1'],
    [1, 0, '2'],
  ]),
];

/** The chord kinds with movable voicings here. */
export const VOICED_KINDS: readonly ChordKind[] = [
  'major',
  'minor',
  '7',
  'maj7',
  'm7',
  'm7b5',
  'sus2',
  'sus4',
];

/** Every shape of a kind, in CAGED order; none for a kind with no voicings. */
export function templatesFor(kind: ChordKind): VoicingTemplate[] {
  const quality = CAGED_KIND[kind];
  if (quality) return CAGED_ORDER.map((shape) => fromCaged(shape, kind, quality));
  return CAGED_ORDER.flatMap((shape) => OTHERS.filter((t) => t.kind === kind && t.shape === shape));
}

export interface PlacedNote extends Position {
  readonly degree: ChordDegree;
}

/** Frets to add on a string so a standard-tuning note keeps its pitch in `tuning`. */
function retuneFret(string: number, fret: number, tuning: Tuning): number {
  return fret + openStringMidi(string, STANDARD_TUNING) - openStringMidi(string, tuning);
}

/**
 * Every placement of the template at `root` whose notes all lie in frets
 * 0–`maxFret`, lowest first. In another tuning each note keeps its pitch and
 * moves along its string (drop D adds two frets on string 6).
 */
export function placements(
  t: VoicingTemplate,
  root: string,
  tuning: Tuning,
  maxFret: number,
): PlacedNote[][] {
  const open = openStringMidi(t.rootString, STANDARD_TUNING) % 12;
  const base = (((chromaOf(root) - open) % 12) + 12) % 12;
  const out: PlacedNote[][] = [];
  for (let rootFret = base; rootFret <= maxFret + 12; rootFret += 12) {
    const notes = t.notes.map((n) => ({
      string: n.string,
      fret: retuneFret(n.string, rootFret + n.offset, tuning),
      degree: n.degree,
    }));
    if (notes.every((n) => n.fret >= 0 && n.fret <= maxFret)) out.push(notes);
  }
  return out;
}
