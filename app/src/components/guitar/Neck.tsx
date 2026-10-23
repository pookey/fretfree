import { darken, lighten } from './colour';
import {
  DEFAULT_FRETS,
  HEADSTOCK_PATH,
  SCALE,
  boardEnd,
  boardHalfWidth,
  boardPath,
  fretY,
  inlayMarks,
  stringWidth,
  stringX,
  tunerKey,
  tunerPost,
} from './geometry';
import type { Paints } from './parts';
import type { BoardPalette, HeadstockKind, InlayShape, NeckKind, Point } from './types';

const SHADOW = 'rgba(0,0,0,0.35)';
const NUT = '#efe6d6';
const STRINGS = [1, 2, 3, 4, 5, 6] as const;

// ---- Neck widths -----------------------------------------------------------

/**
 * Widths in mm: the board at the nut and at the 22nd fret's end, and the
 * outer strings' spread at the nut and at the saddles. The electric neck is
 * `geometry.ts`'s; a steel-string acoustic is a little wider (1.75 in at the
 * nut, 2.125 in at the saddle), and a classical wider still (52 mm at the nut).
 */
export const NECK_SIZES: Readonly<
  Record<
    Exclude<NeckKind, 'electric'>,
    { nut: number; heel: number; nutSpread: number; bridgeSpread: number }
  >
> = {
  acoustic: { nut: 44.5, heel: 57, nutSpread: 36, bridgeSpread: 54 },
  classical: { nut: 52, heel: 62, nutSpread: 42, bridgeSpread: 58 },
};

/** Half the board's width at `y` on a `neck`. */
export function neckHalfWidth(neck: NeckKind, y: number): number {
  if (neck === 'electric') return boardHalfWidth(y);
  const { nut, heel } = NECK_SIZES[neck];
  return (nut + ((heel - nut) * y) / boardEnd(DEFAULT_FRETS)) / 2;
}

/** String 1 (high E) to 6 (low E) at `y` on a `neck`; the low E is on the left. */
export function neckStringX(neck: NeckKind, string: number, y: number): number {
  if (neck === 'electric') return stringX(string, y);
  const { nutSpread, bridgeSpread } = NECK_SIZES[neck];
  const spread = nutSpread + ((bridgeSpread - nutSpread) * y) / SCALE;
  return spread / 2 - ((string - 1) * spread) / 5;
}

function neckBoardPath(neck: NeckKind, frets: number): string {
  if (neck === 'electric') return boardPath(frets);
  const end = boardEnd(frets);
  const top = neckHalfWidth(neck, 0);
  const bottom = neckHalfWidth(neck, end);
  return `M ${-top} 0 L ${top} 0 L ${bottom} ${end} L ${-bottom} ${end} Z`;
}

// ---- Board -----------------------------------------------------------------

/**
 * The board with its frets and inlays, from the nut to the heel. A steel-
 * string board is radiused, so its edges fall away into shade; a
 * classical board is flat and evenly lit.
 */
export function Board({
  palette,
  inlay,
  frets,
  neck = 'electric',
}: {
  palette: BoardPalette;
  inlay: InlayShape;
  frets: number;
  neck?: NeckKind;
}) {
  const end = boardEnd(frets);
  const half = (y: number) => neckHalfWidth(neck, y);
  const d = neckBoardPath(neck, frets);
  return (
    <g>
      <path d={d} fill={palette['--wood']} />
      {neck !== 'classical' &&
        [-1, 1].map((side) => (
          <path
            key={side}
            d={`M ${side * half(0)} 0 L ${side * (half(0) - 3.5)} 0 L ${side * (half(end) - 4.5)} ${end} L ${side * half(end)} ${end} Z`}
            fill="#000"
            opacity={0.16}
          />
        ))}
      <path d={d} fill="none" stroke={palette['--wood-dark']} strokeWidth={1.2} />
      {inlayMarks(inlay, frets).map((m) => {
        // The marks are drawn for the electric board; widen them to this one.
        const cy = (fretY(m.fret - 1) + fretY(m.fret)) / 2;
        const k = half(cy) / boardHalfWidth(cy);
        return (
          <g key={m.fret} transform={k === 1 ? undefined : `scale(${k.toFixed(3)} 1)`}>
            {m.paths.map((p, i) => (
              <path key={i} d={p} fill={palette['--inlay']} fillOpacity={0.85} />
            ))}
          </g>
        );
      })}
      {Array.from({ length: frets }, (_, i) => {
        const y = fretY(i + 1);
        const h = half(y);
        return (
          <line
            key={i}
            x1={-h}
            x2={h}
            y1={y}
            y2={y}
            stroke={palette['--fret-wire']}
            strokeWidth={1.4}
          />
        );
      })}
      <rect x={-half(0)} y={-3} width={half(0) * 2} height={4} fill={NUT} />
    </g>
  );
}

/** Where the board meets the body: a soft shadow under the heel. */
export function HeelShadow({
  frets,
  from,
  neck = 'electric',
}: {
  frets: number;
  from: number;
  neck?: NeckKind;
}) {
  const end = boardEnd(frets);
  const h = neckHalfWidth(neck, end);
  const top = neckHalfWidth(neck, from);
  return (
    <path
      d={`M ${-top - 1} ${from} L ${top + 3} ${from} L ${h + 3} ${end + 4} L ${-h - 1} ${end + 4} Z`}
      fill="rgba(0,0,0,0.3)"
    />
  );
}

// ---- Headstocks ------------------------------------------------------------

/**
 * An original slotted headstock: it flares from the nut into a long, nearly
 * straight-sided paddle whose top dips to the centre between two rounded
 * shoulders. It copies no maker's crest.
 */
export const SLOTTED_PATH = [
  'M -26 0',
  'C -27 -10 -34 -18 -36 -30',
  'L -38.5 -168',
  'C -38.8 -179 -36 -187 -28 -190',
  'C -18 -194 -8 -192 0 -185',
  'C 8 -192 18 -194 28 -190',
  'C 36 -187 38.8 -179 38.5 -168',
  'L 36 -30',
  'C 34 -18 27 -10 26 0',
  'Z',
].join(' ');

/** The slots run between these heights; their inner and outer edges are at these |x|. */
export const SLOT = { top: -160, bottom: -40, inner: 10, outer: 24 } as const;

/** Roller heights, nearest the nut first: the inner strings (3, 4) take the nearest. */
const ROLLER_Y = [-62, -99, -136] as const;

function rollerRank(string: number): number {
  return string >= 4 ? string - 4 : 3 - string;
}

/** Where a string leaves the neck at the headstock end: its tuner post, or its wrap on a roller. */
export function stringAnchor(string: number, headstock: HeadstockKind = 'solid'): Point {
  if (headstock === 'solid') return tunerPost(string);
  const side = string >= 4 ? -1 : 1;
  const rank = rollerRank(string);
  // Each string wraps nearer the outside the farther its roller is from the nut.
  return { x: side * (SLOT.inner + 3.5 + rank * 3.5), y: ROLLER_Y[rank]! };
}

function slotPath(side: 1 | -1): string {
  const { top, bottom, inner, outer } = SLOT;
  const r = (outer - inner) / 2;
  const k = 0.5523 * r;
  const [a, b] = side === 1 ? [inner, outer] : [-outer, -inner];
  const mid = (a + b) / 2;
  return [
    `M ${a} ${bottom - r}`,
    `L ${a} ${top + r}`,
    `C ${a} ${top + r - k} ${mid - k} ${top} ${mid} ${top}`,
    `C ${mid + k} ${top} ${b} ${top + r - k} ${b} ${top + r}`,
    `L ${b} ${bottom - r}`,
    `C ${b} ${bottom - r + k} ${mid + k} ${bottom} ${mid} ${bottom}`,
    `C ${mid - k} ${bottom} ${a} ${bottom - r + k} ${a} ${bottom - r}`,
    'Z',
  ].join(' ');
}

/** A headstock's outline, its own edge highlight and the wood. */
function HeadWood({ d, palette }: { d: string; palette: BoardPalette }) {
  const wood = palette['--wood'];
  return (
    <g>
      <path d={d} fill={wood} />
      <path d={d} fill="none" stroke={darken(palette['--wood-dark'], 0.2)} strokeWidth={1.4} />
      {/* A bevel just inside the edge. */}
      <path
        d={d}
        transform="translate(0 -4) scale(0.9 0.96)"
        fill="none"
        stroke={lighten(wood, 0.15)}
        strokeOpacity={0.5}
        strokeWidth={1}
      />
    </g>
  );
}

function SolidHeadstock({ palette, paints }: { palette: BoardPalette; paints: Paints }) {
  return (
    <g>
      {STRINGS.map((s) => {
        const post = tunerPost(s);
        const key = tunerKey(s);
        const out = Math.sign(key.x);
        return (
          <g key={s}>
            <rect
              x={Math.min(post.x, key.x)}
              y={post.y - 3}
              width={Math.abs(key.x - post.x)}
              height={6}
              fill={paints.metal}
            />
            <path
              d={`M ${key.x - out * 4} ${key.y - 8} C ${key.x + out * 10} ${key.y - 10} ${key.x + out * 14} ${key.y + 10} ${key.x - out * 4} ${key.y + 8} Z`}
              fill={paints.metal}
              stroke={SHADOW}
            />
          </g>
        );
      })}
      <HeadWood d={HEADSTOCK_PATH} palette={palette} />
      {STRINGS.map((s) => {
        const post = tunerPost(s);
        return (
          <g key={s}>
            <circle cx={post.x} cy={post.y} r={6.5} fill={paints.metal} stroke={SHADOW} />
            <circle cx={post.x} cy={post.y} r={3} fill={darken(paints.colour, 0.25)} />
          </g>
        );
      })}
    </g>
  );
}

/** Cream buttons, as on most classical tuners. */
const BUTTON = '#efe6d6';
const ROLLER = '#e9e0cf';

/**
 * The slotted headstock: two slots through the head, a roller across each
 * slot for each string, and the tuner plates on the sides with their
 * buttons sticking out.
 */
function SlottedHeadstock({ palette, paints }: { palette: BoardPalette; paints: Paints }) {
  return (
    <g>
      {([-1, 1] as const).map((side) => (
        <g key={side}>
          {/* The tuner plate along the side, seen edge on. */}
          <rect
            x={side === 1 ? 36 : -40}
            y={-150}
            width={4}
            height={100}
            rx={1.5}
            fill={paints.metal}
            stroke={SHADOW}
            strokeWidth={0.6}
          />
          {ROLLER_Y.map((y) => (
            <g key={y}>
              <rect x={side === 1 ? 38 : -50} y={y - 2} width={12} height={4} fill={paints.metal} />
              <ellipse cx={side * 56} cy={y} rx={7.5} ry={9.5} fill={BUTTON} stroke={SHADOW} />
              <ellipse cx={side * 55} cy={y - 3} rx={3} ry={3.5} fill="#fff" opacity={0.45} />
            </g>
          ))}
        </g>
      ))}
      <HeadWood d={SLOTTED_PATH} palette={palette} />
      {([-1, 1] as const).map((side) => (
        <g key={side}>
          <path d={slotPath(side)} fill="#140f0c" />
          <path
            d={slotPath(side)}
            fill="none"
            stroke={lighten(palette['--wood'], 0.2)}
            strokeOpacity={0.45}
            strokeWidth={1}
            transform="translate(0 1.2)"
          />
          {ROLLER_Y.map((y) => {
            const x0 = side === 1 ? SLOT.inner : -SLOT.outer;
            const w = SLOT.outer - SLOT.inner;
            return (
              <g key={y}>
                <rect x={x0} y={y - 4.5} width={w} height={9} fill={ROLLER} />
                <rect x={x0} y={y + 1.5} width={w} height={3} fill="#000" opacity={0.18} />
                <rect x={x0} y={y - 4.5} width={w} height={9} fill="none" stroke={SHADOW} />
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

/** The headstock with its tuners. `palette` is the board's: the head is the same wood. */
export function Headstock({
  palette,
  paints,
  kind = 'solid',
}: {
  palette: BoardPalette;
  paints: Paints;
  kind?: HeadstockKind;
}) {
  return kind === 'slotted' ? (
    <SlottedHeadstock palette={palette} paints={paints} />
  ) : (
    <SolidHeadstock palette={palette} paints={paints} />
  );
}

// ---- Strings ---------------------------------------------------------------

/** Clear nylon, a warm off-white. */
export const NYLON = '#ece2c8';

/**
 * The six strings, from the headstock over the nut to `end`. On a
 * classical neck the trebles (1 to 3) are plain nylon, a little thicker
 * than steel, and the basses are wound in the palette's string colour.
 */
export function Strings({
  palette,
  end,
  neck = 'electric',
  headstock = 'solid',
}: {
  palette: BoardPalette;
  end: number;
  neck?: NeckKind;
  headstock?: HeadstockKind;
}) {
  return (
    <g fill="none" strokeLinejoin="round">
      {STRINGS.map((s) => {
        const a = stringAnchor(s, headstock);
        const d = `M ${a.x} ${a.y} L ${neckStringX(neck, s, 0)} 0 L ${neckStringX(neck, s, end)} ${end}`;
        const nylon = neck === 'classical' && s <= 3;
        const width = stringWidth(s) + (nylon ? 0.35 : 0);
        return (
          <g key={s} data-string={s}>
            <path d={d} stroke="#000" strokeOpacity={0.35} strokeWidth={width + 0.9} />
            <path d={d} stroke={nylon ? NYLON : palette['--string']} strokeWidth={width} />
          </g>
        );
      })}
    </g>
  );
}
