import type { ReactElement } from 'react';
import { darken, lighten } from './colour';
import type { ColourStop, RenderData } from './types';

type Finish = RenderData['finish'];

const FALLBACK = '#8a8a8a';

/** `stops` sorted, or shades of one colour when fewer than two are given. */
function gradientStops(stops: readonly ColourStop[], shades: readonly [number, number][]) {
  if (stops.length >= 2) return [...stops].sort((a, b) => a.offset - b.offset);
  const base = stops[0]?.colour ?? FALLBACK;
  return shades.map(([offset, t]) => ({
    offset,
    colour: t >= 0 ? lighten(base, t) : darken(base, -t),
  }));
}

function Stops({ stops }: { stops: readonly ColourStop[] }) {
  return stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.colour} />);
}

/**
 * Wood grain along the body's length. The tile repeats vertically, so
 * every line ends at the x it starts at.
 */
const GRAIN_W = 120;
const GRAIN_H = 260;
const GRAIN: readonly { x: number; a: number; w: number; o: number }[] = [
  { x: 6, a: 5, w: 1.4, o: 0.5 },
  { x: 14, a: -7, w: 0.6, o: 0.4 },
  { x: 23, a: 4, w: 2.2, o: 0.35 },
  { x: 33, a: -3, w: 0.8, o: 0.55 },
  { x: 41, a: 8, w: 1.1, o: 0.3 },
  { x: 52, a: -6, w: 2.8, o: 0.25 },
  { x: 60, a: 3, w: 0.7, o: 0.5 },
  { x: 69, a: -9, w: 1.6, o: 0.4 },
  { x: 80, a: 6, w: 0.9, o: 0.45 },
  { x: 88, a: -4, w: 2, o: 0.3 },
  { x: 97, a: 7, w: 0.6, o: 0.5 },
  { x: 106, a: -5, w: 1.3, o: 0.4 },
  { x: 114, a: 4, w: 0.8, o: 0.35 },
];

/** Metal flakes in a sparkle finish: fixed, so nothing moves or changes between renders. */
const FLAKES: readonly { x: number; y: number; r: number; o: number; tone: number }[] = [
  { x: 2, y: 3, r: 0.9, o: 0.9, tone: 0 },
  { x: 9, y: 1.5, r: 0.6, o: 0.7, tone: 1 },
  { x: 14.5, y: 6, r: 1.1, o: 0.8, tone: 2 },
  { x: 5, y: 9, r: 0.7, o: 0.6, tone: 1 },
  { x: 11, y: 11, r: 1.3, o: 0.85, tone: 0 },
  { x: 17, y: 13.5, r: 0.6, o: 0.65, tone: 2 },
  { x: 1.5, y: 15, r: 1, o: 0.75, tone: 2 },
  { x: 7.5, y: 16.5, r: 0.7, o: 0.9, tone: 0 },
  { x: 13, y: 17.2, r: 0.5, o: 0.6, tone: 1 },
];

/**
 * The paint server for a body finish, with the id `id`: a radial gradient
 * for a sunburst, a grain pattern for natural wood, a linear gradient for
 * metallic and a static flake pattern for sparkle. A solid finish needs
 * none, so `paint` is its colour. Every paint is an SVG attribute, never
 * CSS, so the guitar still draws when serialised to a canvas (M11-09).
 */
export function finishPaint(
  id: string,
  finish: Finish,
): { defs: ReactElement | null; paint: string } {
  const base = finish.stops[0]?.colour ?? FALLBACK;
  switch (finish.type) {
    case 'solid':
      return { defs: null, paint: base };
    case 'sunburst':
      return {
        paint: `url(#${id})`,
        defs: (
          <radialGradient id={id} cx="0.5" cy="0.64" r="0.6" fx="0.5" fy="0.66">
            <Stops
              stops={gradientStops(finish.stops, [
                [0, 0.5],
                [0.55, 0],
                [1, -0.75],
              ])}
            />
          </radialGradient>
        ),
      };
    case 'metallic':
      return {
        paint: `url(#${id})`,
        defs: (
          <linearGradient id={id} x1="0.05" y1="0" x2="0.95" y2="1">
            <Stops
              stops={gradientStops(finish.stops, [
                [0, 0.45],
                [0.35, 0],
                [0.6, -0.35],
                [0.85, 0.2],
                [1, -0.1],
              ])}
            />
          </linearGradient>
        ),
      };
    case 'natural': {
      const grain = finish.stops[1]?.colour ?? darken(base, 0.35);
      return {
        paint: `url(#${id})`,
        defs: (
          <pattern
            id={id}
            patternUnits="userSpaceOnUse"
            width={GRAIN_W}
            height={GRAIN_H}
            patternTransform="rotate(-3)"
          >
            <rect width={GRAIN_W} height={GRAIN_H} fill={base} />
            {GRAIN.map((g, i) => (
              <path
                key={i}
                d={`M ${g.x} 0 C ${g.x + g.a} ${GRAIN_H / 3} ${g.x - g.a} ${(2 * GRAIN_H) / 3} ${g.x} ${GRAIN_H}`}
                fill="none"
                stroke={grain}
                strokeWidth={g.w}
                strokeOpacity={g.o}
              />
            ))}
          </pattern>
        ),
      };
    }
    case 'sparkle': {
      const tones = [
        finish.stops[1]?.colour ?? lighten(base, 0.75),
        finish.stops[2]?.colour ?? '#ffffff',
        lighten(base, 0.4),
      ];
      return {
        paint: `url(#${id})`,
        defs: (
          <pattern id={id} patternUnits="userSpaceOnUse" width={19} height={19}>
            <rect width={19} height={19} fill={base} />
            {FLAKES.map((f, i) => (
              <circle key={i} cx={f.x} cy={f.y} r={f.r} fill={tones[f.tone]} fillOpacity={f.o} />
            ))}
          </pattern>
        ),
      };
    }
  }
}
