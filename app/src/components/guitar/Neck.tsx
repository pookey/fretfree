import { darken, lighten } from './colour';
import {
  HEADSTOCK_PATH,
  boardEnd,
  boardHalfWidth,
  boardPath,
  fretY,
  inlayMarks,
  tunerKey,
  tunerPost,
} from './geometry';
import type { Paints } from './parts';
import type { BoardPalette, InlayShape } from './types';

const SHADOW = 'rgba(0,0,0,0.35)';
const NUT = '#efe6d6';

/** The board with its frets and inlays, from the nut to the heel. */
export function Board({
  palette,
  inlay,
  frets,
}: {
  palette: BoardPalette;
  inlay: InlayShape;
  frets: number;
}) {
  return (
    <g>
      <path d={boardPath(frets)} fill={palette['--wood']} />
      <path d={boardPath(frets)} fill="none" stroke={palette['--wood-dark']} strokeWidth={1.2} />
      {inlayMarks(inlay, frets).map((m) =>
        m.paths.map((d, i) => (
          <path key={`${m.fret}-${i}`} d={d} fill={palette['--inlay']} fillOpacity={0.85} />
        )),
      )}
      {Array.from({ length: frets }, (_, i) => {
        const y = fretY(i + 1);
        const h = boardHalfWidth(y);
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
      <rect x={-boardHalfWidth(0)} y={-3} width={boardHalfWidth(0) * 2} height={4} fill={NUT} />
    </g>
  );
}

/** Where the board meets the body: a soft shadow under the heel. */
export function HeelShadow({ frets, from }: { frets: number; from: number }) {
  const end = boardEnd(frets);
  const h = boardHalfWidth(end);
  return (
    <path
      d={`M ${-boardHalfWidth(from) - 1} ${from} L ${boardHalfWidth(from) + 3} ${from} L ${h + 3} ${end + 4} L ${-h - 1} ${end + 4} Z`}
      fill="rgba(0,0,0,0.3)"
    />
  );
}

/** The original headstock with its tuners. `wood` is the board's palette. */
export function Headstock({ palette, paints }: { palette: BoardPalette; paints: Paints }) {
  const wood = palette['--wood'];
  return (
    <g>
      {[1, 2, 3, 4, 5, 6].map((s) => {
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
      <path d={HEADSTOCK_PATH} fill={wood} />
      <path
        d={HEADSTOCK_PATH}
        fill="none"
        stroke={darken(palette['--wood-dark'], 0.2)}
        strokeWidth={1.4}
      />
      {/* A bevel just inside the edge. */}
      <path
        d={HEADSTOCK_PATH}
        transform="translate(0 -4) scale(0.9 0.96)"
        fill="none"
        stroke={lighten(wood, 0.15)}
        strokeOpacity={0.5}
        strokeWidth={1}
      />
      {[1, 2, 3, 4, 5, 6].map((s) => {
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
