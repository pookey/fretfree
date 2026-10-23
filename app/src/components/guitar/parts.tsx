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
import { NYLON, neckStringX } from './Neck';
import type {
  BridgeAnchor,
  ControlAnchors,
  NeckKind,
  PickupAnchor,
  Point,
  TailpieceAnchor,
} from './types';

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
function poles(at: Point, neck: NeckKind = 'electric'): number[] {
  return STRINGS.map((s) => neckStringX(neck, s, at.y) - at.x);
}

/** Bridge woods: dark rosewood, with a lit top edge. */
const BRIDGE_WOOD = '#2b1d16';
const BONE = '#efe6d6';
/** Wound bass strings, where a bridge draws their ends. */
const WOUND = '#cfc9bd';

/**
 * A steel-string bridge: a long bar with wings that thin towards rounded
 * ends. Its outline, round the anchor; the footprint is `BRIDGE.acoustic`.
 */
const ACOUSTIC_BRIDGE = [
  'M -50 -15 L 50 -15',
  'C 58 -15 62 -13.5 66 -10.5',
  'C 69 -8 70 -5 70 -1.5 L 70 4.5',
  'C 70 8.5 69 11.5 66 13.5',
  'C 62 16 58 17 50 17 L -50 17',
  'C -58 17 -62 16 -66 13.5',
  'C -69 11.5 -70 8.5 -70 4.5 L -70 -1.5',
  'C -70 -5 -69 -8 -66 -10.5',
  'C -62 -13.5 -58 -15 -50 -15 Z',
].join(' ');

/** A classical bridge: thin wings either side of the saddle, and the tie block behind it. */
const TIE_BLOCK_BRIDGE = [
  'M -78 -10 L -46 -12 L 46 -12 L 78 -10',
  'C 82 -10 84 -9 84 -6 L 84 8',
  'C 84 11 82 12 78 12 L 46 13 L 46 21',
  'C 46 23 44 24 42 24 L -42 24',
  'C -44 24 -46 23 -46 21 L -46 13 L -78 12',
  'C -82 12 -84 11 -84 8 L -84 -6',
  'C -84 -9 -82 -10 -78 -10 Z',
].join(' ');

/** Where each string ties off on a tie block: through a hole, then looped back over the block. */
const TIE_HOLE_Y = 9;
/** Behind the saddle: where an acoustic bridge's pins hold the strings. */
const ACOUSTIC_PIN_Y = 10;

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

/** What sits under the pickups: the tremolo and bridge plates, and wooden bridges. */
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
    case 'tie-block': {
      const d = at.type === 'acoustic' ? ACOUSTIC_BRIDGE : TIE_BLOCK_BRIDGE;
      return (
        <g transform={t}>
          <path d={d} transform="translate(2 3)" fill="#000" opacity={0.3} />
          <path d={d} fill={BRIDGE_WOOD} />
          {/* Light along the top edge, shade along the bottom. */}
          <path
            d={d}
            fill="none"
            stroke={lighten(BRIDGE_WOOD, 0.25)}
            strokeWidth={1.2}
            transform="translate(0 0.8)"
            opacity={0.6}
          />
          <path d={d} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={0.8} />
          {at.type === 'tie-block' && (
            <g>
              <rect x={-44} y={6} width={88} height={16} rx={2} fill={lighten(BRIDGE_WOOD, 0.08)} />
              <rect
                x={-44}
                y={6}
                width={88}
                height={1.4}
                fill={lighten(BRIDGE_WOOD, 0.3)}
                opacity={0.7}
              />
              {/* A mosaic strip across the block. */}
              <rect x={-42} y={17.5} width={84} height={2.6} fill="#1a120e" />
              <path
                d="M -41 18.8 L 41 18.8"
                stroke={BONE}
                strokeWidth={1.4}
                strokeDasharray="1.4 1.4"
              />
            </g>
          )}
        </g>
      );
    }
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

/** Saddles and bridge bars, over the pickups; `neck` spaces the strings. */
export function BridgeTop({
  at,
  paints,
  neck,
}: {
  at: BridgeAnchor;
  paints: Paints;
  neck?: NeckKind;
}) {
  const t = `translate(${at.x} ${at.y})`;
  const xs = poles(at, neck);
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
    case 'acoustic': {
      // A bone saddle, slanted so the bass strings are a little longer, and a pin behind each string.
      const pins = poles({ x: at.x, y: at.y + ACOUSTIC_PIN_Y }, neck);
      return (
        <g transform={t}>
          <g transform="rotate(-2.5)">
            <rect x={-38} y={-2.4} width={76} height={4.8} rx={2} fill="#000" opacity={0.45} />
            <rect x={-37} y={-1.6} width={74} height={3.2} rx={1.5} fill={BONE} />
          </g>
          {pins.map((x) => (
            <g key={x}>
              <circle cx={x + 0.6} cy={ACOUSTIC_PIN_Y + 0.8} r={3.6} fill="#000" opacity={0.45} />
              <circle cx={x} cy={ACOUSTIC_PIN_Y} r={3.1} fill={BONE} />
              <circle cx={x - 0.9} cy={ACOUSTIC_PIN_Y - 0.9} r={1} fill="#fff" opacity={0.8} />
            </g>
          ))}
        </g>
      );
    }
    case 'tie-block':
      // A straight bone saddle; each string runs to a hole in the block and loops back over it.
      return (
        <g transform={t}>
          <rect x={-35} y={-2.2} width={70} height={4.4} rx={2} fill="#000" opacity={0.45} />
          <rect x={-34} y={-1.6} width={68} height={3.2} rx={1.5} fill={BONE} />
          {poles({ x: at.x, y: at.y + TIE_HOLE_Y }, neck).map((x, i) => {
            const colour = i < 3 ? NYLON : WOUND;
            return (
              <g key={x} fill="none" strokeLinecap="round">
                <circle cx={x} cy={TIE_HOLE_Y} r={1.6} fill="#0d0907" />
                <path
                  d={`M ${x} ${TIE_HOLE_Y} L ${x} 16 C ${x} 19.5 ${x + 5} 19 ${x + 5.5} 15 C ${x + 6} 12 ${x + 2} 11 ${x - 1.5} 12.5`}
                  stroke={colour}
                  strokeWidth={1.3}
                />
              </g>
            );
          })}
        </g>
      );
  }
}

/** Where the strings end, past the saddles. */
export function stringEnd(bridge: BridgeAnchor, tail?: TailpieceAnchor): number {
  if (tail) return tail.y;
  const past = {
    tremolo: 30,
    plate: 36,
    locking: 11,
    acoustic: ACOUSTIC_PIN_Y,
    'tie-block': TIE_HOLE_Y,
  } as const;
  return bridge.y + (past[bridge.type as keyof typeof past] ?? 0);
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
 * path, lit where it faces the upper left and shaded where it faces the
 * lower right, with a dark line where it meets the flat of the top. Both
 * are strokes of the outline clipped to the body, so the band stays even
 * round tight horns; a gradient at 45° across the body does the lighting,
 * and a mask keeps the line to the band's inner edge.
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
  const light = `${id}-light`;
  return (
    <g clipPath={clip}>
      <defs>
        {/* At a true 45° in body millimetres, across the frame every body shares. */}
        <linearGradient
          id={light}
          gradientUnits="userSpaceOnUse"
          x1={-180}
          y1={380}
          x2={180}
          y2={740}
        >
          <stop offset="0" stopColor="#fff" stopOpacity={0.3} />
          <stop offset="0.4" stopColor="#fff" stopOpacity={0.06} />
          <stop offset="0.6" stopColor="#000" stopOpacity={0.06} />
          <stop offset="1" stopColor="#000" stopOpacity={0.32} />
        </linearGradient>
        <mask id={id} maskUnits="userSpaceOnUse" x={-500} y={-500} width={1000} height={1500}>
          <path d={d} fill="none" stroke="#fff" strokeWidth={edge} />
          <path d={d} fill="none" stroke="#000" strokeWidth={band} />
        </mask>
      </defs>
      <path d={d} fill="none" stroke={`url(#${light})`} strokeWidth={band} />
      <path
        d={d}
        fill="none"
        stroke="#000"
        strokeOpacity={0.35}
        strokeWidth={edge}
        mask={`url(#${id})`}
      />
    </g>
  );
}

/**
 * A rosette (`BodyDetail` paint `rosette`): a ring `width` mm wide centred
 * on the path, inlaid in the top: dark purfling at both edges, a cream
 * line inside each, and a mosaic of short tiles round the middle.
 */
export function Rosette({ d, width }: { d: string; width: number }) {
  const tile = Math.max(1.2, width / 8);
  return (
    <g fill="none">
      <path d={d} stroke="#1d1612" strokeWidth={width} />
      <path d={d} stroke={BONE} strokeWidth={width - 2.4} />
      <path d={d} stroke="#2a201a" strokeWidth={width - 4.4} />
      <path
        d={d}
        stroke={BONE}
        strokeOpacity={0.85}
        strokeWidth={Math.max(1.2, width - 7.4)}
        strokeDasharray={`${tile} ${tile}`}
      />
    </g>
  );
}
