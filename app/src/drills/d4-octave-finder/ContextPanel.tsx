import type { GuideLevel, Handedness } from '../../engine/model';
import { crossesGBShift, openStringMidi, stringCount, type Tuning } from '../../theory';
import type { DrillContextPanelProps } from '../types';
import type { D4Answer, D4Prompt } from './logic';
import styles from './ContextPanel.module.css';

/** A string pair, lower string first: the octave of a note on `from` is on `to`. */
type Pair = readonly [from: number, to: number];

/** The pairs C1 teaches (engine/skills/c1.ts): two and three strings over, and 6→1. */
const PAIRS: readonly Pair[] = [
  [6, 4],
  [5, 3],
  [4, 2],
  [3, 1],
  [6, 3],
  [5, 2],
  [4, 1],
  [6, 1],
];

/** One octave shape: every pair the same distance apart with the same fret offset. */
export interface OctaveShape {
  id: string;
  /** Strings between the dot and its octave (5 is the double octave). */
  distance: number;
  /** Frets from the dot to its octave, toward the body positive. */
  offset: number;
  gbShift: boolean;
  pairs: Pair[];
}

/** The fret offset of the octave nearest in fret, e.g. +2 for 6→4, +3 for 4→2. */
function offsetOf([from, to]: Pair, tuning: Tuning): number {
  const gap = openStringMidi(to, tuning) - openStringMidi(from, tuning);
  return 12 * Math.round(gap / 12) - gap;
}

/**
 * The octave shapes in a tuning, by distance and then without the G–B shift
 * first. In standard tuning: +2 two strings over, +3 across G–B, −3 three
 * strings over, −2 across G–B, and the double octave at the same fret.
 */
export function octaveShapes(tuning: Tuning): OctaveShape[] {
  const n = stringCount(tuning);
  const shapes: OctaveShape[] = [];
  for (const pair of PAIRS.filter(([a]) => a <= n)) {
    const distance = pair[0] - pair[1];
    const offset = offsetOf(pair, tuning);
    const gbShift = crossesGBShift(pair[0], pair[1], tuning);
    const same = shapes.find(
      (s) => s.distance === distance && s.offset === offset && s.gbShift === gbShift,
    );
    if (same) same.pairs.push(pair);
    else
      shapes.push({
        id: `${distance}${offset}${gbShift ? 'gb' : ''}`,
        distance,
        offset,
        gbShift,
        pairs: [pair],
      });
  }
  return shapes.sort((a, b) => a.distance - b.distance || Number(a.gbShift) - Number(b.gbShift));
}

/** The shape a single prompt uses, whichever way along the strings it runs. */
export function shapeOfPrompt(
  shapes: readonly OctaveShape[],
  prompt: D4Prompt,
): OctaveShape | null {
  if (prompt.mode !== 'single') return null;
  const from = Math.max(prompt.source.string, prompt.string);
  const to = Math.min(prompt.source.string, prompt.string);
  return shapes.find((s) => s.pairs.some(([a, b]) => a === from && b === to)) ?? null;
}

export function shapeTitle(shape: OctaveShape): string {
  if (shape.distance === 5) return 'Double octave';
  const over = `${shape.distance} strings over`;
  return shape.gbShift ? `${over}, across G–B` : over;
}

/** The shape's fret offset as a short signed number: "+2", "−3", "0". */
export function frets(offset: number): string {
  if (offset === 0) return '0';
  return `${offset > 0 ? '+' : '−'}${Math.abs(offset)}`;
}

/** Guide level 1 keeps the core shapes: two strings over, with and without G–B, and 6→1. */
function shown(shape: OctaveShape, guideLevel: GuideLevel): boolean {
  return guideLevel >= 2 || shape.distance !== 3;
}

const COL = 12;
const GAP = 8;
const PAD = 6;

/** "Note on string 6, octave on string 4, 2 frets higher": the diagram's accessible name. */
export function shapeLabel(shape: OctaveShape): string {
  const [from, to] = shape.pairs[0] as Pair;
  const n = Math.abs(shape.offset);
  const move =
    n === 0
      ? 'same fret'
      : `${n} fret${n === 1 ? '' : 's'} ${shape.offset > 0 ? 'higher' : 'lower'}`;
  return `Note on string ${from}, octave on string ${to}, ${move}`;
}

/**
 * One shape on a strip of neck, in player view (string 1 on top): the dot is a
 * square in the root colour, its octave a circle in the tone colour, joined by
 * the shape's line. A shape across G–B marks that string pair.
 */
function ShapeDiagram({
  shape,
  tuning,
  handedness,
}: {
  shape: OctaveShape;
  tuning: Tuning;
  handedness: Handedness;
}) {
  const [from, to] = shape.pairs[0] as Pair;
  const strings = stringCount(tuning);
  const span = Math.abs(shape.offset) + 1;
  const cols = Math.max(4, span);
  const width = cols * COL + 2 * PAD;
  const height = (strings - 1) * GAP + 2 * PAD;
  const start = Math.floor((cols - span) / 2);
  const left = handedness === 'left';
  const x = (col: number) => {
    const cx = PAD + (start + col + 0.5) * COL;
    return left ? width - cx : cx;
  };
  const y = (s: number) => PAD + (s - 1) * GAP;
  const root = { x: x(shape.offset >= 0 ? 0 : -shape.offset), y: y(from) };
  const octave = { x: x(shape.offset >= 0 ? shape.offset : 0), y: y(to) };
  // The pair a fret closer than the rest: B over G in standard tuning.
  const gb = shape.gbShift
    ? Array.from({ length: strings - 1 }, (_, i) => i + 2).find(
        (s) => openStringMidi(s - 1, tuning) - openStringMidi(s, tuning) === 4,
      )
    : undefined;
  const r = 4;
  return (
    <svg
      className={styles.diagram}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={shapeLabel(shape)}
      data-testid={`octave-shape-${shape.id}`}
    >
      {gb !== undefined && (
        <rect
          className={styles.gb}
          x={PAD / 2}
          y={y(gb - 1)}
          width={width - PAD}
          height={GAP}
          data-testid="gb-pair"
        />
      )}
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line
          key={`f${i}`}
          className={styles.fret}
          x1={PAD + i * COL}
          x2={PAD + i * COL}
          y1={y(1)}
          y2={y(strings)}
        />
      ))}
      {Array.from({ length: strings }, (_, i) => (
        <line
          key={`s${i}`}
          className={styles.string}
          x1={PAD}
          x2={width - PAD}
          y1={y(i + 1)}
          y2={y(i + 1)}
        />
      ))}
      <line className={styles.link} x1={root.x} y1={root.y} x2={octave.x} y2={octave.y} />
      <rect
        className={styles.root}
        x={root.x - r}
        y={root.y - r}
        width={2 * r}
        height={2 * r}
        rx={1}
        data-testid="shape-root"
      />
      <circle
        className={styles.octave}
        cx={octave.x}
        cy={octave.y}
        r={r}
        data-testid="shape-octave"
      />
    </svg>
  );
}

/**
 * D4's context panel (design §7): the octave shapes in one row of small neck
 * strips, drawn with shape as well as colour, so it fits above the neck on an
 * iPad in landscape. It fades with the guides: at level 1 the core shapes
 * only; from level 2 every shape with its string pairs and the G–B rule; at
 * level 3 a tip for running a shape down the strings. Once the learner has answered (or in a
 * worked example), the prompt's shape is marked, so it is never shown before
 * the recall (research/02 rule 4).
 */
export function OctaveContextPanel({
  prompt,
  guideLevel,
  guided,
  handedness,
  tuning,
  feedback,
}: DrillContextPanelProps<D4Prompt, D4Answer>) {
  const shapes = octaveShapes(tuning);
  const current = feedback || guided ? shapeOfPrompt(shapes, prompt) : null;
  return (
    <div className={styles.panel} data-testid="octave-panel">
      <div className={styles.head}>
        <h2>Octave shapes</h2>
        <p className={styles.key} aria-hidden="true">
          <span className={styles.keyRoot} /> note <span className={styles.keyOctave} /> octave
        </p>
      </div>
      <ul className={styles.shapes} aria-label="Octave shapes">
        {shapes
          .filter((s) => shown(s, guideLevel))
          .map((shape) => (
            <li
              key={shape.id}
              className={styles.shape}
              data-shape={shape.id}
              aria-current={shape === current ? 'true' : undefined}
            >
              <ShapeDiagram shape={shape} tuning={tuning} handedness={handedness} />
              <span className="visually-hidden">{shapeTitle(shape)}</span>
              <span className={styles.offset} aria-hidden="true">
                {frets(shape.offset)}
              </span>
              {guideLevel >= 2 &&
                shape.pairs.map(([a, b]) => (
                  <span key={a} className={styles.pair}>
                    {a}→{b}
                  </span>
                ))}
            </li>
          ))}
      </ul>
      {guideLevel >= 2 && (
        <p>
          Frets from the note to its octave. <strong>G–B</strong> is a fret closer, so a shape
          across it lands a fret higher.
          {guideLevel >= 3 && ' Going down the strings, run it backwards.'}
        </p>
      )}
    </div>
  );
}
