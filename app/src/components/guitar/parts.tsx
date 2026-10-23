import { darken, lighten } from './colour';
import {
  BLADE,
  BRIDGE,
  JACK,
  JACK_PLATE,
  KNOB,
  PICKUP,
  TAILPIECE,
  TOGGLE,
  type Box,
} from './footprint';
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

/** A box from `footprint.ts` as rect attributes. */
function rect(b: Box) {
  return { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 };
}

/** Each pole sits under its string: x relative to the anchor. */
function poles(at: Point): number[] {
  return STRINGS.map((s) => stringX(s, at.y) - at.x);
}

export function Pickup({ at, paints }: { at: PickupAnchor; paints: Paints }) {
  if (at.type === 'humbucker') {
    return (
      <g transform={rotate(at)}>
        <rect {...rect(PICKUP.humbucker)} rx={6} fill={HOLE} />
        <rect x={-40} y={-19} width={80} height={38} rx={3} fill={paints.metal} />
        <rect x={-40} y={-19} width={80} height={38} rx={3} fill="none" stroke={SHADOW} />
        {poles(at).map((x) => (
          <circle key={x} cx={x} cy={-8} r={2.5} fill={darken(paints.colour, 0.25)} />
        ))}
      </g>
    );
  }
  if (at.type === 'wide') {
    // A flat coil under a broad cover, its poles in one row.
    return (
      <g transform={rotate(at)}>
        <rect {...rect(PICKUP.wide)} rx={8} fill="rgba(0,0,0,0.55)" />
        <rect x={-43} y={-16} width={86} height={32} rx={5} fill={paints.plastic} />
        <rect x={-43} y={-16} width={86} height={32} rx={5} fill="none" stroke={SHADOW} />
        {poles(at).map((x) => (
          <circle
            key={x}
            cx={x}
            cy={0}
            r={2.4}
            fill={paints.metal}
            stroke={SHADOW}
            strokeWidth={0.5}
          />
        ))}
      </g>
    );
  }
  return (
    <g transform={rotate(at)}>
      <rect {...rect(PICKUP.single)} rx={10.5} fill="rgba(0,0,0,0.55)" />
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
          <rect {...rect(BRIDGE.tremolo)} rx={3} fill={paints.metal} />
          <rect {...rect(BRIDGE.tremolo)} rx={3} fill="none" stroke={SHADOW} />
          {[-30, -18, -6, 6, 18, 30].map((x) => (
            <circle key={x} cx={x} cy={-10} r={1.6} fill={SHADOW} />
          ))}
        </g>
      );
    case 'plate': {
      const { x0, x1, y0, y1 } = BRIDGE.plate;
      return (
        <g transform={t}>
          <path
            d={`M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1 - 16} C ${x1} ${y1 - 4} ${x1 - 8} ${y1} ${x1 - 18} ${y1} L ${x0 + 18} ${y1} C ${x0 + 8} ${y1} ${x0} ${y1 - 4} ${x0} ${y1 - 16} Z`}
            fill={paints.metal}
            stroke={SHADOW}
          />
          <path d={`M ${x0 + 6} -12 L ${x1 - 6} -12`} stroke={SHADOW} strokeWidth={1.2} />
        </g>
      );
    }
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
    case 'locking': {
      // The base plate on its two pivot posts, and the block behind it that holds the fine tuners.
      const { x0, x1, y0 } = BRIDGE.locking;
      return (
        <g transform={t}>
          <rect x={x0 + 6} y={-12} width={x1 - x0 - 12} height={42} rx={4} fill={paints.metal} />
          <rect x={-34} y={24} width={68} height={28} rx={7} fill={paints.metal} />
          <rect
            x={x0 + 6}
            y={-12}
            width={x1 - x0 - 12}
            height={42}
            rx={4}
            fill="none"
            stroke={SHADOW}
          />
          <rect x={-34} y={24} width={68} height={28} rx={7} fill="none" stroke={SHADOW} />
          {[x0 + 4.5, x1 - 4.5].map((x) => (
            <circle key={x} cx={x} cy={y0 + 7} r={4.5} fill={paints.metal} stroke={SHADOW} />
          ))}
        </g>
      );
    }
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
    case 'locking':
      // Six saddles, each clamping its string with a screw, and a fine tuner behind each.
      return (
        <g transform={t}>
          {xs.map((x) => (
            <g key={x}>
              <rect
                x={x - 3.6}
                y={-8}
                width={7.2}
                height={24}
                rx={1.2}
                fill={paints.metal}
                stroke={SHADOW}
                strokeWidth={0.8}
              />
              <circle cx={x} cy={11} r={1.9} fill={SHADOW} />
              <circle
                cx={x}
                cy={40}
                r={3.6}
                fill={paints.metal}
                stroke={SHADOW}
                strokeWidth={0.8}
              />
              <circle cx={x} cy={40} r={1.4} fill={SHADOW} />
            </g>
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
  const past = { tremolo: 30, plate: 36, locking: 11 } as const;
  return bridge.y + (past[bridge.type as keyof typeof past] ?? 7);
}

export function Tailpiece({ at, paints }: { at: TailpieceAnchor; paints: Paints }) {
  if (at.type === 'vibrato') {
    // A plate that narrows towards the tail, the strings' anchor bar across
    // its top, and the arm swinging out from its treble corner.
    const plate =
      'M -30 -12 L 30 -12 C 36 -12 38 -8 38 -2 L 34 36 C 33.4 42 30 46 24 46 L -24 46 C -30 46 -33.4 42 -34 36 L -38 -2 C -38 -8 -36 -12 -30 -12 Z';
    const xs = poles(at);
    return (
      <g transform={`translate(${at.x} ${at.y})`}>
        <path d={plate} fill={paints.metal} stroke={SHADOW} />
        <rect x={-27} y={-4} width={54} height={8} rx={3} fill={darken(paints.colour, 0.2)} />
        {xs.map((x) => (
          <circle key={x} cx={x} cy={0} r={1.6} fill={HOLE} />
        ))}
        <circle cx={30} cy={22} r={5} fill={darken(paints.colour, 0.3)} stroke={SHADOW} />
        <path
          d="M 30 22 C 42 26 51 34 57 43"
          fill="none"
          stroke={paints.metal}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={57.5} cy={43.5} r={3.5} fill={paints.plastic} stroke={SHADOW} />
      </g>
    );
  }
  if (at.type === 'trapeze') {
    return (
      <g transform={`translate(${at.x} ${at.y})`}>
        {/* An open frame: the strings' bar, two rails and the hinge at the tail. */}
        <path
          d="M -25 2 L -10 62 M 25 2 L 10 62"
          stroke={SHADOW}
          strokeWidth={6.5}
          strokeLinecap="round"
        />
        <path
          d="M -25 2 L -10 62 M 25 2 L 10 62"
          stroke={paints.metal}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <rect x={-13} y={58} width={26} height={12} rx={4} fill={paints.metal} stroke={SHADOW} />
        <path d="M -9 64 L 9 64" stroke={SHADOW} strokeWidth={1.2} />
        <rect x={-32} y={-6} width={64} height={12} rx={6} fill={paints.metal} stroke={SHADOW} />
        {poles(at).map((x) => (
          <circle key={x} cx={x} cy={0} r={1.4} fill={HOLE} />
        ))}
      </g>
    );
  }
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect {...rect(TAILPIECE.stop)} rx={7} fill={paints.metal} stroke={SHADOW} />
      <circle cx={-41} cy={0} r={3} fill={darken(paints.colour, 0.3)} />
      <circle cx={41} cy={0} r={3} fill={darken(paints.colour, 0.3)} />
    </g>
  );
}

export function Controls({ at, paints }: { at: ControlAnchors; paints: Paints }) {
  return (
    <g>
      {at.plate && <path d={at.plate} fill={paints.metal} stroke={SHADOW} />}
      {at.rollers?.map((r) => (
        // A thumb wheel seen edge on: a dark slot and a ridged wheel.
        <g key={`${r.x},${r.y}`} transform={rotate(r)}>
          <rect x={-5} y={-11} width={10} height={22} rx={2} fill={HOLE} opacity={0.6} />
          <rect x={-3.5} y={-9} width={7} height={18} rx={3} fill={darken(paints.colour, 0.15)} />
          {[-6, -3, 0, 3, 6].map((y) => (
            <path key={y} d={`M -3.5 ${y} L 3.5 ${y}`} stroke={SHADOW} strokeWidth={0.8} />
          ))}
        </g>
      ))}
      {at.switch?.type === 'blade' && (
        <g transform={rotate(at.switch)}>
          <rect x={-2} y={BLADE.y0} width={4} height={BLADE.y1 - BLADE.y0} rx={2} fill={HOLE} />
          <rect
            x={BLADE.x0}
            y={-11}
            width={BLADE.x1 - BLADE.x0}
            height={12}
            rx={3}
            fill={paints.plastic}
            stroke={SHADOW}
          />
        </g>
      )}
      {at.switch?.type === 'toggle' && (
        // A ring washer with a short lever leaning to its tip.
        <g transform={rotate(at.switch)}>
          <circle r={TOGGLE.rx - 1} fill={HOLE} opacity={0.5} />
          <circle r={7} fill={paints.metal} stroke={SHADOW} />
          <circle r={3} fill={darken(paints.colour, 0.35)} />
          <path
            d="M 0 0 L 3.5 -5.5"
            stroke={paints.metal}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <circle cx={4} cy={-6.2} r={2.8} fill={paints.plastic} stroke={SHADOW} />
        </g>
      )}
      {at.knobs.map((k) => (
        <g key={`${k.x},${k.y}`} transform={`translate(${k.x} ${k.y})`}>
          <circle cx={KNOB.dx} cy={KNOB.dy} r={KNOB.rx} fill={SHADOW} />
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
        <g transform={rotate(at.jack)}>
          {at.jack.plate && (
            <g>
              <ellipse rx={JACK_PLATE.rx} ry={JACK_PLATE.ry} fill={HOLE} opacity={0.5} />
              <ellipse
                rx={JACK_PLATE.rx - 1.5}
                ry={JACK_PLATE.ry - 1.5}
                fill={paints.metal}
                stroke={SHADOW}
              />
              <circle cy={-JACK_PLATE.ry + 5} r={1.3} fill={SHADOW} />
              <circle cy={JACK_PLATE.ry - 5} r={1.3} fill={SHADOW} />
            </g>
          )}
          <circle r={at.jack.plate ? 6 : JACK.rx} fill={paints.metal} stroke={SHADOW} />
          <circle r={3.5} fill={HOLE} />
        </g>
      )}
    </g>
  );
}

/**
 * A carved edge (`BodyDetail` paint `bevel`): a band `width` mm in from the
 * path, lit, with a dark line where it meets the flat of the top. Both are
 * strokes of the outline clipped to the body, so the band stays even round
 * tight horns, and a mask keeps the line to the band's inner edge.
 */
export function Bevel({
  d,
  width,
  clip,
  id,
}: {
  d: string;
  width: number;
  clip: string;
  id: string;
}) {
  const band = 2 * width;
  const edge = band + 1.6;
  return (
    <g clipPath={clip}>
      <mask id={id} maskUnits="userSpaceOnUse" x={-500} y={-500} width={1000} height={1500}>
        <path d={d} fill="none" stroke="#fff" strokeWidth={edge} />
        <path d={d} fill="none" stroke="#000" strokeWidth={band} />
      </mask>
      <path d={d} fill="none" stroke="#fff" strokeOpacity={0.13} strokeWidth={band} />
      <path d={d} fill="none" stroke="#fff" strokeOpacity={0.08} strokeWidth={band * 0.45} />
      <path
        d={d}
        fill="none"
        stroke="#000"
        strokeOpacity={0.4}
        strokeWidth={edge}
        mask={`url(#${id})`}
      />
    </g>
  );
}
