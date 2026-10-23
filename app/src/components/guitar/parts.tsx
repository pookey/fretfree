import { darken, lighten } from './colour';
import { stringX } from './geometry';
import type { BridgeAnchor, ControlAnchors, PickupAnchor, Point, TailpieceAnchor } from './types';

/**
 * The hardware and electronics, each drawn at its body anchor. `metal` is
 * the hardware gradient's paint, `colour` its flat colour; everything is
 * an SVG attribute so the drawing survives a canvas (M11-09).
 */
export interface Paints {
  metal: string;
  colour: string;
  /** Pickup bobbins and switch tips: cream on a light pickguard, black otherwise. */
  plastic: string;
}

const SHADOW = 'rgba(0,0,0,0.35)';
const HOLE = '#141110';
const STRINGS = [1, 2, 3, 4, 5, 6] as const;

function rotate(p: { x: number; y: number; angle?: number }): string {
  return `translate(${p.x} ${p.y}) rotate(${p.angle ?? 0})`;
}

/** Each pole sits under its string: x relative to the anchor. */
function poles(at: Point): number[] {
  return STRINGS.map((s) => stringX(s, at.y) - at.x);
}

export function Pickup({ at, paints }: { at: PickupAnchor; paints: Paints }) {
  if (at.type === 'humbucker') {
    return (
      <g transform={rotate(at)}>
        <rect x={-45} y={-23} width={90} height={46} rx={6} fill={HOLE} />
        <rect x={-40} y={-19} width={80} height={38} rx={3} fill={paints.metal} />
        <rect x={-40} y={-19} width={80} height={38} rx={3} fill="none" stroke={SHADOW} />
        {poles(at).map((x) => (
          <circle key={x} cx={x} cy={-8} r={2.5} fill={darken(paints.colour, 0.25)} />
        ))}
      </g>
    );
  }
  return (
    <g transform={rotate(at)}>
      <rect x={-37.5} y={-10.5} width={75} height={21} rx={10.5} fill="rgba(0,0,0,0.55)" />
      <rect x={-36} y={-9} width={72} height={18} rx={9} fill={paints.plastic} />
      {poles(at).map((x) => (
        <circle key={x} cx={x} cy={0} r={2.1} fill={paints.metal} />
      ))}
    </g>
  );
}

/** What sits under the pickups: the tremolo and bridge plates. */
export function BridgeBase({ at, paints }: { at: BridgeAnchor; paints: Paints }) {
  const t = `translate(${at.x} ${at.y})`;
  switch (at.type) {
    case 'tremolo':
      return (
        <g transform={t}>
          <rect x={-37} y={-15} width={74} height={50} rx={3} fill={paints.metal} />
          <rect x={-37} y={-15} width={74} height={50} rx={3} fill="none" stroke={SHADOW} />
          {[-30, -18, -6, 6, 18, 30].map((x) => (
            <circle key={x} cx={x} cy={-10} r={1.6} fill={SHADOW} />
          ))}
        </g>
      );
    case 'plate':
      return (
        <g transform={t}>
          <path
            d="M -46 -78 L 46 -78 L 46 30 C 46 42 38 46 28 46 L -28 46 C -38 46 -46 42 -46 30 Z"
            fill={paints.metal}
            stroke={SHADOW}
          />
          <path d="M -40 -12 L 40 -12" stroke={SHADOW} strokeWidth={1.2} />
        </g>
      );
    case 'acoustic':
      return (
        <g transform={t}>
          <path
            d="M -78 -14 C -60 -18 -40 -14 -30 -14 L 30 -14 C 40 -14 60 -18 78 -14 L 78 16 C 60 20 40 16 30 16 L -30 16 C -40 16 -60 20 -78 16 Z"
            fill="#2a1c15"
            stroke={SHADOW}
          />
        </g>
      );
    case 'tune-o-matic':
      return null;
  }
}

/** Saddles and bridge bars, over the pickups. */
export function BridgeTop({ at, paints }: { at: BridgeAnchor; paints: Paints }) {
  const t = `translate(${at.x} ${at.y})`;
  const xs = poles(at);
  switch (at.type) {
    case 'tremolo':
      return (
        <g transform={t}>
          {xs.map((x) => (
            <rect
              key={x}
              x={x - 4}
              y={-5}
              width={8}
              height={14}
              rx={1.5}
              fill={paints.metal}
              stroke={SHADOW}
              strokeWidth={0.8}
            />
          ))}
        </g>
      );
    case 'plate':
      // Three barrel saddles, two strings each.
      return (
        <g transform={t}>
          {[0, 2, 4].map((i) => {
            const a = xs[i] ?? 0;
            const b = xs[i + 1] ?? 0;
            return (
              <rect
                key={i}
                x={Math.min(a, b) - 4}
                y={-4}
                width={Math.abs(b - a) + 8}
                height={8}
                rx={4}
                fill={paints.metal}
                stroke={SHADOW}
                strokeWidth={0.8}
              />
            );
          })}
        </g>
      );
    case 'tune-o-matic':
      return (
        <g transform={t}>
          <rect x={-44} y={-6} width={88} height={12} rx={6} fill={paints.metal} stroke={SHADOW} />
          <circle cx={-41} cy={0} r={4.5} fill={paints.metal} stroke={SHADOW} />
          <circle cx={41} cy={0} r={4.5} fill={paints.metal} stroke={SHADOW} />
          {xs.map((x) => (
            <rect
              key={x}
              x={x - 3}
              y={-4}
              width={6}
              height={8}
              rx={1}
              fill={lighten(paints.colour, 0.2)}
              stroke={SHADOW}
              strokeWidth={0.6}
            />
          ))}
        </g>
      );
    case 'acoustic':
      return (
        <g transform={t}>
          <rect x={-34} y={-6} width={68} height={3.5} rx={1.5} fill="#efe6d6" />
          {xs.map((x) => (
            <circle key={x} cx={x} cy={7} r={2.6} fill="#efe6d6" stroke={SHADOW} />
          ))}
        </g>
      );
  }
}

/** Where the strings end, past the saddles. */
export function stringEnd(bridge: BridgeAnchor, tail?: TailpieceAnchor): number {
  if (tail) return tail.y;
  return bridge.y + (bridge.type === 'tremolo' ? 30 : bridge.type === 'plate' ? 36 : 7);
}

export function Tailpiece({ at, paints }: { at: TailpieceAnchor; paints: Paints }) {
  if (at.type === 'trapeze') {
    return (
      <g transform={`translate(${at.x} ${at.y})`}>
        <path
          d="M -32 -6 L 32 -6 L 14 70 L -14 70 Z"
          fill={paints.metal}
          stroke={SHADOW}
          strokeLinejoin="round"
        />
        <path d="M -22 4 L 22 4 L 10 58 L -10 58 Z" fill={darken(paints.colour, 0.35)} />
      </g>
    );
  }
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect x={-46} y={-7} width={92} height={14} rx={7} fill={paints.metal} stroke={SHADOW} />
      <circle cx={-41} cy={0} r={3} fill={darken(paints.colour, 0.3)} />
      <circle cx={41} cy={0} r={3} fill={darken(paints.colour, 0.3)} />
    </g>
  );
}

export function Controls({ at, paints }: { at: ControlAnchors; paints: Paints }) {
  return (
    <g>
      {at.plate && <path d={at.plate} fill={paints.metal} stroke={SHADOW} />}
      {at.switch?.type === 'blade' && (
        <g transform={rotate(at.switch)}>
          <rect x={-2} y={-16} width={4} height={32} rx={2} fill={HOLE} />
          <rect x={-4} y={-11} width={8} height={12} rx={3} fill={paints.plastic} stroke={SHADOW} />
        </g>
      )}
      {at.switch?.type === 'toggle' && (
        <g transform={rotate(at.switch)}>
          <circle r={10} fill={HOLE} opacity={0.6} />
          <circle r={7} fill={paints.metal} stroke={SHADOW} />
          <circle r={3.5} fill={paints.plastic} stroke={SHADOW} />
        </g>
      )}
      {at.knobs.map((k) => (
        <g key={`${k.x},${k.y}`} transform={`translate(${k.x} ${k.y})`}>
          <circle cx={1.5} cy={2} r={11.5} fill={SHADOW} />
          <circle r={11} fill={paints.metal} />
          <circle
            r={11}
            fill="none"
            stroke={darken(paints.colour, 0.4)}
            strokeDasharray="1.2 1.2"
          />
          <circle cx={-2.5} cy={-3} r={4} fill={lighten(paints.colour, 0.6)} opacity={0.55} />
        </g>
      ))}
      {at.jack && (
        <g transform={`translate(${at.jack.x} ${at.jack.y})`}>
          <circle r={8} fill={paints.metal} stroke={SHADOW} />
          <circle r={3.5} fill={HOLE} />
        </g>
      )}
    </g>
  );
}
