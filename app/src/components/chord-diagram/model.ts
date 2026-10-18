import {
  STANDARD_TUNING,
  allStrings,
  chromaOf,
  midiAt,
  type Degree,
  type Position,
  type ShapeNote,
  type Tuning,
} from '../../theory';

/**
 * Pure model for the chart-view chord diagram (design §8): which strings are
 * fretted, open or muted, where the barres are and which fret window to draw.
 */

/** Fretting-hand fingers: index 1 to little 4, `T` the thumb over the neck. */
export type Finger = 1 | 2 | 3 | 4 | 'T';

/**
 * Same vocabulary and shapes as the neck markers: a root is a rounded square,
 * the 3rd a circle, the 5th a triangle, the 7th a hexagon, a plain tone a
 * circle.
 */
export type ChordDotStyle = 'root' | 'tone' | 'third' | 'fifth' | 'seventh';

export interface ChordDiagramNote extends Position {
  finger?: Finger;
  style?: ChordDotStyle;
  /** Text for the dot when the diagram shows labels (a degree or note name). */
  label?: string;
}

/** One finger across several strings at one fret, `from`/`to` inclusive. */
export interface Barre {
  fret: number;
  /** The lowest-numbered (highest-pitched) string it covers. */
  from: number;
  /** The highest-numbered (lowest-pitched) string it covers. */
  to: number;
  finger?: Finger;
}

export interface ChordVoicing {
  /** One entry per sounding string; fret 0 is an open string. */
  notes: readonly ChordDiagramNote[];
  /** Strings not in `notes` are muted. */
  barres?: readonly Barre[];
}

export interface FretWindow {
  /** The fret drawn in the top row. 1 means the nut is drawn. */
  baseFret: number;
  rows: number;
}

/** The smallest number of fret rows a diagram draws. */
export const MIN_ROWS = 4;

const FINGERS: Record<string, Finger> = { '1': 1, '2': 2, '3': 3, '4': 4, T: 'T' };

/**
 * A voicing from chord-book notation, lowest-pitched string first:
 * `x32010` (C), or `x-10-12-12-12-10`, dash-separated, when any fret has two
 * digits. Fingers use the same layout (`x32010`, where `x` or `0` means no
 * finger). A note whose pitch class matches `root` is styled as a root.
 */
export function parseVoicing(
  frets: string,
  opts: { fingers?: string; root?: string; tuning?: Tuning } = {},
): ChordVoicing {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const strings = allStrings(tuning).reverse();
  const fretTokens = tokens(frets, strings.length, 'frets');
  const fingerTokens = opts.fingers ? tokens(opts.fingers, strings.length, 'fingers') : [];
  const rootChroma = opts.root === undefined ? undefined : chromaOf(opts.root);
  const notes: ChordDiagramNote[] = [];
  strings.forEach((string, i) => {
    const token = fretTokens[i] as string;
    if (token.toLowerCase() === 'x') return;
    const fret = Number(token);
    if (!Number.isInteger(fret) || fret < 0) throw new RangeError(`Bad fret "${token}"`);
    const note: ChordDiagramNote = { string, fret };
    const finger = FINGERS[fingerTokens[i] ?? ''];
    if (finger !== undefined && fret > 0) note.finger = finger;
    if (rootChroma !== undefined && midiAt(note, tuning) % 12 === rootChroma) note.style = 'root';
    notes.push(note);
  });
  return { notes };
}

/** Dash-separated whenever a dash appears, otherwise one character per string. */
function tokens(text: string, count: number, what: string): string[] {
  const out = text.includes('-') ? text.split('-') : [...text];
  if (out.length !== count) {
    throw new RangeError(`Expected ${count} ${what}, got ${out.length} in "${text}"`);
  }
  return out;
}

const DEGREE_STYLES: Record<Degree, ChordDotStyle> = {
  R: 'root',
  '3': 'third',
  b3: 'third',
  '5': 'fifth',
  b7: 'seventh',
};

/** A CAGED shape or triad voicing as a diagram, styled and labelled by degree. */
export function voicingFromShape(shape: { readonly notes: readonly ShapeNote[] }): ChordVoicing {
  return {
    notes: shape.notes.map((n) => ({
      string: n.string,
      fret: n.fret,
      style: DEGREE_STYLES[n.degree],
      label: n.degree,
    })),
  };
}

/**
 * Barres implied by fingering: one finger on two or more strings at the same
 * fret covers every string between them. Explicit barres win.
 */
export function barresOf(voicing: ChordVoicing): Barre[] {
  if (voicing.barres) return [...voicing.barres];
  const groups = new Map<string, ChordDiagramNote[]>();
  for (const n of voicing.notes) {
    if (n.finger === undefined || n.fret === 0) continue;
    const key = `${n.finger}@${n.fret}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  const out: Barre[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const strings = group.map((n) => n.string);
    const first = group[0] as ChordDiagramNote;
    out.push({
      fret: first.fret,
      from: Math.min(...strings),
      to: Math.max(...strings),
      finger: first.finger,
    });
  }
  return out.sort((a, b) => a.fret - b.fret || a.from - b.from);
}

/** Strings with no note: drawn with a cross above the nut. */
export function mutedStrings(voicing: ChordVoicing, tuning: Tuning = STANDARD_TUNING): number[] {
  const sounding = new Set(voicing.notes.map((n) => n.string));
  return allStrings(tuning).filter((s) => !sounding.has(s));
}

/**
 * The fret window: from the nut when every fretted note fits in `minRows`,
 * otherwise from the lowest fretted note. It grows to fit a wide stretch.
 */
export function fretWindow(voicing: ChordVoicing, minRows: number = MIN_ROWS): FretWindow {
  const fretted = [
    ...voicing.notes.map((n) => n.fret),
    ...(voicing.barres ?? []).map((b) => b.fret),
  ].filter((f) => f > 0);
  if (fretted.length === 0) return { baseFret: 1, rows: minRows };
  const low = Math.min(...fretted);
  const high = Math.max(...fretted);
  const baseFret = high <= minRows ? 1 : low;
  return { baseFret, rows: Math.max(minRows, high - baseFret + 1) };
}

const FINGER_NAMES: Record<string, string> = {
  '1': 'index',
  '2': 'middle',
  '3': 'ring',
  '4': 'little',
  T: 'thumb',
};

/** Spoken names for the degree shapes a fretted dot is drawn with. */
const STYLE_WORDS: Partial<Record<ChordDotStyle, string>> = {
  third: '3rd',
  fifth: '5th',
  seventh: '7th',
};

/**
 * The spoken description, low string first: "string 6 muted, string 5 fret 3
 * ring finger root, …". Says only what the diagram shows: pass `labelOf` to
 * read out the dot text the diagram is drawing.
 */
export function describeVoicing(
  voicing: ChordVoicing,
  opts: {
    tuning?: Tuning;
    fingers?: boolean;
    roots?: boolean;
    labelOf?: (n: ChordDiagramNote) => string | undefined;
  } = {},
): string {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const byString = new Map(voicing.notes.map((n) => [n.string, n]));
  const parts = allStrings(tuning)
    .reverse()
    .map((s) => {
      const n = byString.get(s);
      if (!n) return `string ${s} muted`;
      const words = [`string ${s}`, n.fret === 0 ? 'open' : `fret ${n.fret}`];
      if (opts.fingers !== false && n.finger !== undefined && n.fret > 0) {
        words.push(`${FINGER_NAMES[String(n.finger)]} finger`);
      }
      if (opts.roots !== false && n.style === 'root') words.push('root');
      const degree = n.fret > 0 && n.style ? STYLE_WORDS[n.style] : undefined;
      if (degree) words.push(degree);
      const label = opts.labelOf?.(n);
      if (label) words.push(`labelled ${label}`);
      return words.join(' ');
    });
  const barres = barresOf(voicing).map(
    (b) => `barre at fret ${b.fret} from string ${b.to} to string ${b.from}`,
  );
  return [...parts, ...barres].join(', ');
}
