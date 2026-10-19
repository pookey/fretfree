import {
  CAGED_ORDER,
  STANDARD_TUNING,
  cagedShape,
  chromaOf,
  openStringMidi,
  type CagedQuality,
  type CagedShapeName,
  type ChordDegree,
  type ChordKind,
  type Degree,
  type Position,
  type Tuning,
} from '../../theory';

/**
 * The chord shapes D8 draws: the CAGED shapes of major, minor and 7 chords
 * (theory/shapes.ts), plus the common maj7 and m7 voicings, each named after
 * its CAGED family. Placed at the nut they are the open chords (C x32010,
 * Am7 x02010, Gmaj7 320002 …); moved up the neck, the E and A shapes are the
 * barre chords. Offsets are frets from the root on `rootString`, in standard
 * tuning.
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

/** The chord kinds D8 has shapes for. */
export type D8Kind = 'major' | 'minor' | '7' | 'maj7' | 'm7';

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

/** The open maj7 and m7 chords each shape is named after, and their barre forms. */
const SEVENTHS: readonly VoicingTemplate[] = [
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
];

export const D8_KINDS: readonly D8Kind[] = ['major', 'minor', '7', 'maj7', 'm7'];

export function isD8Kind(kind: ChordKind): kind is D8Kind {
  return (D8_KINDS as readonly ChordKind[]).includes(kind);
}

/** Every shape of a kind, in CAGED order. */
export function templatesFor(kind: ChordKind): VoicingTemplate[] {
  const quality = CAGED_KIND[kind];
  if (quality) return CAGED_ORDER.map((shape) => fromCaged(shape, kind, quality));
  return CAGED_ORDER.flatMap((shape) =>
    SEVENTHS.filter((t) => t.kind === kind && t.shape === shape),
  );
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
