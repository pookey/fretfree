import { Chord } from 'tonal';
import {
  MAX_FRET,
  STANDARD_TUNING,
  chromaOf,
  midiAt,
  openStringMidi,
  type Position,
  type Tuning,
} from './fretboard';

/**
 * CAGED and triad shape generation (topics C6, I1). M0 covers major CAGED
 * shapes in standard tuning and close-voiced triads on any three adjacent
 * strings; minor/7th CAGED variants arrive with M3.
 */

export type CagedShapeName = 'C' | 'A' | 'G' | 'E' | 'D';
export type Degree = 'R' | '3' | 'b3' | '5';

export interface ShapeNote extends Position {
  readonly degree: Degree;
}

export interface CagedShape {
  readonly shape: CagedShapeName;
  readonly root: string;
  /** Fret of the root on the shape's root string. */
  readonly rootFret: number;
  readonly rootString: number;
  readonly notes: readonly ShapeNote[];
}

interface Template {
  rootString: number;
  notes: readonly { string: number; offset: number; degree: Degree }[];
}

/** Major-chord templates; offsets are relative to the root fret on `rootString`. */
const MAJOR_TEMPLATES: Record<CagedShapeName, Template> = {
  C: {
    rootString: 5,
    notes: [
      { string: 5, offset: 0, degree: 'R' },
      { string: 4, offset: -1, degree: '3' },
      { string: 3, offset: -3, degree: '5' },
      { string: 2, offset: -2, degree: 'R' },
      { string: 1, offset: -3, degree: '3' },
    ],
  },
  A: {
    rootString: 5,
    notes: [
      { string: 5, offset: 0, degree: 'R' },
      { string: 4, offset: 2, degree: '5' },
      { string: 3, offset: 2, degree: 'R' },
      { string: 2, offset: 2, degree: '3' },
      { string: 1, offset: 0, degree: '5' },
    ],
  },
  G: {
    rootString: 6,
    notes: [
      { string: 6, offset: 0, degree: 'R' },
      { string: 5, offset: -1, degree: '3' },
      { string: 4, offset: -3, degree: '5' },
      { string: 3, offset: -3, degree: 'R' },
      { string: 2, offset: -3, degree: '3' },
      { string: 1, offset: 0, degree: 'R' },
    ],
  },
  E: {
    rootString: 6,
    notes: [
      { string: 6, offset: 0, degree: 'R' },
      { string: 5, offset: 2, degree: '5' },
      { string: 4, offset: 2, degree: 'R' },
      { string: 3, offset: 1, degree: '3' },
      { string: 2, offset: 0, degree: '5' },
      { string: 1, offset: 0, degree: 'R' },
    ],
  },
  D: {
    rootString: 4,
    notes: [
      { string: 4, offset: 0, degree: 'R' },
      { string: 3, offset: 2, degree: '5' },
      { string: 2, offset: 3, degree: 'R' },
      { string: 1, offset: 2, degree: '3' },
    ],
  },
};

/** The CAGED chain order, ascending the neck. */
export const CAGED_ORDER: readonly CagedShapeName[] = ['C', 'A', 'G', 'E', 'D'];

/**
 * The major CAGED shape for `root`, placed at the lowest neck position whose
 * frets are all ≥ `minFret` (default 0). Standard tuning only.
 */
export function cagedShape(
  shape: CagedShapeName,
  root: string,
  opts: { minFret?: number } = {},
): CagedShape {
  const t = MAJOR_TEMPLATES[shape];
  const minFret = opts.minFret ?? 0;
  const minOffset = Math.min(...t.notes.map((n) => n.offset));
  const openChroma = openStringMidi(t.rootString, STANDARD_TUNING) % 12;
  let rootFret = (((chromaOf(root) - openChroma) % 12) + 12) % 12;
  while (rootFret + minOffset < minFret) rootFret += 12;
  const notes = t.notes.map((n) => ({
    string: n.string,
    fret: rootFret + n.offset,
    degree: n.degree,
  }));
  if (notes.some((n) => n.fret > MAX_FRET)) {
    throw new RangeError(`${shape} shape of ${root} does not fit above fret ${minFret}`);
  }
  return { shape, root, rootFret, rootString: t.rootString, notes };
}

/**
 * The five shapes of one chord, chained up the neck from the lowest position
 * (e.g. C major: C → A → G → E → D).
 */
export function cagedChain(root: string): CagedShape[] {
  const shapes = CAGED_ORDER.map((s) => cagedShape(s, root));
  const lowestFret = (s: CagedShape) => Math.min(...s.notes.map((n) => n.fret));
  return shapes.sort((a, b) => lowestFret(a) - lowestFret(b));
}

export type TriadQuality = 'major' | 'minor';
export type Inversion = 0 | 1 | 2;

export interface TriadVoicing {
  readonly root: string;
  readonly quality: TriadQuality;
  readonly inversion: Inversion;
  /** Low-to-high: the lowest-pitched string first. */
  readonly notes: readonly ShapeNote[];
}

const TRIAD_DEGREES: Record<TriadQuality, readonly Degree[]> = {
  major: ['R', '3', '5'],
  minor: ['R', 'b3', '5'],
};

/**
 * Close-voiced triads on three adjacent strings (`lowString` and the two above
 * it), within a 4-fret stretch and inside `[0, maxFret]`. The inversion is set
 * by the bass note: root position R-3-5, 1st 3-5-R, 2nd 5-R-3.
 */
export function triadVoicings(
  root: string,
  quality: TriadQuality,
  lowString: number,
  inversion: Inversion,
  opts: { tuning?: Tuning; maxFret?: number; maxStretch?: number } = {},
): TriadVoicing[] {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const maxFret = opts.maxFret ?? 15;
  const maxStretch = opts.maxStretch ?? 4;
  if (lowString - 2 < 1) throw new RangeError(`No string set starts at string ${lowString}`);
  const symbol = quality === 'major' ? 'M' : 'm';
  const pcs = Chord.getChord(symbol, root).notes;
  if (pcs.length !== 3) throw new Error(`Invalid triad root: ${root}`);
  const degrees = TRIAD_DEGREES[quality];
  const order = [0, 1, 2].map((i) => (i + inversion) % 3);
  const strings = [lowString, lowString - 1, lowString - 2];

  const fretsFor = (string: number, pc: string): number[] => {
    const out: number[] = [];
    const base = (((chromaOf(pc) - openStringMidi(string, tuning)) % 12) + 12) % 12;
    for (let f = base; f <= maxFret; f += 12) out.push(f);
    return out;
  };

  const result: TriadVoicing[] = [];
  const [s0, s1, s2] = strings as [number, number, number];
  const [i0, i1, i2] = order as [number, number, number];
  for (const f0 of fretsFor(s0, pcs[i0] as string)) {
    for (const f1 of fretsFor(s1, pcs[i1] as string)) {
      for (const f2 of fretsFor(s2, pcs[i2] as string)) {
        const frets = [f0, f1, f2];
        if (Math.max(...frets) - Math.min(...frets) > maxStretch) continue;
        const m0 = midiAt({ string: s0, fret: f0 }, tuning);
        const m1 = midiAt({ string: s1, fret: f1 }, tuning);
        const m2 = midiAt({ string: s2, fret: f2 }, tuning);
        // Close voicing: ascending and spanning less than an octave.
        if (!(m0 < m1 && m1 < m2 && m2 - m0 < 12)) continue;
        result.push({
          root,
          quality,
          inversion,
          notes: [
            { string: s0, fret: f0, degree: degrees[i0] as Degree },
            { string: s1, fret: f1, degree: degrees[i1] as Degree },
            { string: s2, fret: f2, degree: degrees[i2] as Degree },
          ],
        });
      }
    }
  }
  return result.sort((a, b) => (a.notes[0]?.fret ?? 0) - (b.notes[0]?.fret ?? 0));
}
