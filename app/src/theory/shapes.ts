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
 * CAGED and triad shape generation (topics C6, I1). CAGED shapes come in
 * major, minor and dominant-7 forms in standard tuning; close-voiced triads
 * work on any three adjacent strings. Each CAGED shape has a triad core, the
 * close triad on three adjacent strings inside it (research/03: "triads are
 * the cores of the CAGED shapes"), which is what C6 teaches first.
 */

export type CagedShapeName = 'C' | 'A' | 'G' | 'E' | 'D';
export type CagedQuality = 'major' | 'minor' | 'dominant7';
export type Degree = 'R' | '3' | 'b3' | '5' | 'b7';

export const CAGED_QUALITIES: readonly CagedQuality[] = ['major', 'minor', 'dominant7'];

export interface ShapeNote extends Position {
  readonly degree: Degree;
}

export interface CagedShape {
  readonly shape: CagedShapeName;
  readonly quality: CagedQuality;
  readonly root: string;
  /** Fret of the root on the shape's root string. */
  readonly rootFret: number;
  readonly rootString: number;
  /** Low-to-high: the lowest-pitched string first. */
  readonly notes: readonly ShapeNote[];
}

interface Template {
  rootString: number;
  notes: readonly { string: number; offset: number; degree: Degree }[];
}

/**
 * CAGED templates, named after the open chord each one is (C x32010, Am
 * x02210, G7 320001 …). Offsets are relative to the root fret on `rootString`.
 * The minor C and G shapes put the 5th on string 1 (C) or string 2 (G) where
 * the major 3rd was, because the b3 would sit a 4-fret stretch below the nut.
 */
const TEMPLATES: Record<CagedQuality, Record<CagedShapeName, Template>> = {
  major: {
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
  },
  minor: {
    C: {
      rootString: 5,
      notes: [
        { string: 5, offset: 0, degree: 'R' },
        { string: 4, offset: -2, degree: 'b3' },
        { string: 3, offset: -3, degree: '5' },
        { string: 2, offset: -2, degree: 'R' },
        { string: 1, offset: 0, degree: '5' },
      ],
    },
    A: {
      rootString: 5,
      notes: [
        { string: 5, offset: 0, degree: 'R' },
        { string: 4, offset: 2, degree: '5' },
        { string: 3, offset: 2, degree: 'R' },
        { string: 2, offset: 1, degree: 'b3' },
        { string: 1, offset: 0, degree: '5' },
      ],
    },
    G: {
      rootString: 6,
      notes: [
        { string: 6, offset: 0, degree: 'R' },
        { string: 5, offset: -2, degree: 'b3' },
        { string: 4, offset: -3, degree: '5' },
        { string: 3, offset: -3, degree: 'R' },
        { string: 2, offset: 0, degree: '5' },
        { string: 1, offset: 0, degree: 'R' },
      ],
    },
    E: {
      rootString: 6,
      notes: [
        { string: 6, offset: 0, degree: 'R' },
        { string: 5, offset: 2, degree: '5' },
        { string: 4, offset: 2, degree: 'R' },
        { string: 3, offset: 0, degree: 'b3' },
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
        { string: 1, offset: 1, degree: 'b3' },
      ],
    },
  },
  dominant7: {
    C: {
      rootString: 5,
      notes: [
        { string: 5, offset: 0, degree: 'R' },
        { string: 4, offset: -1, degree: '3' },
        { string: 3, offset: 0, degree: 'b7' },
        { string: 2, offset: -2, degree: 'R' },
        { string: 1, offset: -3, degree: '3' },
      ],
    },
    A: {
      rootString: 5,
      notes: [
        { string: 5, offset: 0, degree: 'R' },
        { string: 4, offset: 2, degree: '5' },
        { string: 3, offset: 0, degree: 'b7' },
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
        { string: 1, offset: -2, degree: 'b7' },
      ],
    },
    E: {
      rootString: 6,
      notes: [
        { string: 6, offset: 0, degree: 'R' },
        { string: 5, offset: 2, degree: '5' },
        { string: 4, offset: 0, degree: 'b7' },
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
        { string: 2, offset: 1, degree: 'b7' },
        { string: 1, offset: 2, degree: '3' },
      ],
    },
  },
};

/** The CAGED chain order, ascending the neck. */
export const CAGED_ORDER: readonly CagedShapeName[] = ['C', 'A', 'G', 'E', 'D'];

export interface CagedOptions {
  /** Defaults to `major`. */
  readonly quality?: CagedQuality;
  /** Place the shape at the lowest position whose frets are all ≥ this. Default 0. */
  readonly minFret?: number;
}

/** The shape that follows `shape` up the neck (D wraps round to C). */
export function nextCagedShape(shape: CagedShapeName): CagedShapeName {
  return CAGED_ORDER[(CAGED_ORDER.indexOf(shape) + 1) % CAGED_ORDER.length] as CagedShapeName;
}

/** The shape that precedes `shape` down the neck (C wraps round to D). */
export function previousCagedShape(shape: CagedShapeName): CagedShapeName {
  return CAGED_ORDER[(CAGED_ORDER.indexOf(shape) + 4) % CAGED_ORDER.length] as CagedShapeName;
}

/**
 * The CAGED shape for `root`, placed at the lowest neck position whose frets
 * are all ≥ `minFret` (default 0). Standard tuning only.
 */
export function cagedShape(
  shape: CagedShapeName,
  root: string,
  opts: CagedOptions = {},
): CagedShape {
  const quality = opts.quality ?? 'major';
  const t = TEMPLATES[quality][shape];
  const minFret = opts.minFret ?? 0;
  const minOffset = Math.min(...t.notes.map((n) => n.offset));
  const openChroma = openStringMidi(t.rootString, STANDARD_TUNING) % 12;
  let rootFret = (((chromaOf(root) - openChroma) % 12) + 12) % 12;
  while (rootFret + minOffset < minFret) rootFret += 12;
  return placeTemplate(shape, quality, root, rootFret);
}

function placeTemplate(
  shape: CagedShapeName,
  quality: CagedQuality,
  root: string,
  rootFret: number,
): CagedShape {
  const t = TEMPLATES[quality][shape];
  const notes = t.notes.map((n) => ({
    string: n.string,
    fret: rootFret + n.offset,
    degree: n.degree,
  }));
  if (notes.some((n) => n.fret > MAX_FRET || n.fret < 0)) {
    throw new RangeError(`${shape} shape of ${root} does not fit at root fret ${rootFret}`);
  }
  return { shape, quality, root, rootFret, rootString: t.rootString, notes };
}

/** Lowest and highest fretted positions of a shape (open strings count as 0). */
export function shapeSpan(s: { readonly notes: readonly Position[] }): {
  from: number;
  to: number;
} {
  const frets = s.notes.map((n) => n.fret);
  return { from: Math.min(...frets), to: Math.max(...frets) };
}

/**
 * The five shapes of one chord, chained up the neck from the lowest position
 * (e.g. C major: C → A → G → E → D).
 */
export function cagedChain(root: string, opts: { quality?: CagedQuality } = {}): CagedShape[] {
  const shapes = CAGED_ORDER.map((s) => cagedShape(s, root, opts));
  return shapes.sort((a, b) => shapeSpan(a).from - shapeSpan(b).from);
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

export interface TriadCore extends TriadVoicing {
  readonly shape: CagedShapeName;
  /** Lowest-pitched string of the three-string set, e.g. 3 for strings 3–1. */
  readonly lowString: number;
}

/** The triad inside a three-string slice of a shape, or null if the slice isn't a close triad. */
function coreOn(s: CagedShape, quality: TriadQuality, lowString: number): TriadCore | null {
  const slice = [lowString, lowString - 1, lowString - 2].map((str) =>
    s.notes.find((n) => n.string === str),
  );
  if (slice.some((n) => n === undefined)) return null;
  const notes = slice as ShapeNote[];
  const degrees = TRIAD_DEGREES[quality];
  if (!degrees.every((d) => notes.some((n) => n.degree === d))) return null;
  const midis = notes.map((n) => midiAt(n));
  const [m0, m1, m2] = midis as [number, number, number];
  if (!(m0 < m1 && m1 < m2 && m2 - m0 < 12)) return null;
  const inversion = degrees.indexOf((notes[0] as ShapeNote).degree) as Inversion;
  return { shape: s.shape, root: s.root, quality, inversion, lowString, notes };
}

/**
 * Every close-voiced triad on three adjacent strings inside the shape, top
 * string set first. A dominant-7 shape's cores are those of the major shape at
 * the same position (7 = major triad + b7).
 */
export function triadCores(s: CagedShape): TriadCore[] {
  const base = s.quality === 'dominant7' ? placeTemplate(s.shape, 'major', s.root, s.rootFret) : s;
  const quality: TriadQuality = s.quality === 'minor' ? 'minor' : 'major';
  const out: TriadCore[] = [];
  for (let low = 3; low <= 6; low++) {
    const core = coreOn(base, quality, low);
    if (core) out.push(core);
  }
  return out;
}

/**
 * The triad core taught first for a shape: the highest string set that holds
 * a complete close triad (strings 3–1 for C, A, E and D; 4–2 for G, and for
 * the minor C shape; 5–3 for the minor G shape).
 */
export function triadCore(s: CagedShape): TriadCore {
  const core = triadCores(s)[0];
  if (!core) throw new Error(`${s.shape} shape of ${s.root} has no triad core`);
  return core;
}
