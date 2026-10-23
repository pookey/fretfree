import type { Category, RenderData } from '../../engine/garage/types';

/**
 * What the guitar renderer draws (design §3.8). It takes resolved render
 * data, not catalogue IDs, so it stays independent of the catalogue: the
 * Garage looks each `GuitarSpec` ID up and passes the parts' names and
 * render data here. The render data types are the Garage model's.
 */
export type {
  BoardPalette,
  Category,
  ColourStop,
  FinishType,
  InlayShape,
  RenderData,
} from '../../engine/garage/types';

// ---- Renderer types --------------------------------------------------------

/** One resolved part: a catalogue item's display name and render data. */
export interface GuitarPart<C extends Category> {
  name: string;
  render: RenderData[C];
}

/** A whole guitar, one resolved part per category. */
export type GuitarLook = { readonly [C in Category]: GuitarPart<C> };

/**
 * Body drawings use one frame, in millimetres: x = 0 is the centre line,
 * the nut is at y = 0 and y grows towards the bridge. Every body shares
 * the scale length (`SCALE` in `geometry.ts`), so the saddles sit at
 * y = SCALE, and the bass side is on the left (the guitar faces you,
 * headstock up).
 */
export interface Point {
  x: number;
  y: number;
}

export interface PickupAnchor extends Point {
  /** `wide`: a flat single coil in a wide cover, as on a Jazzmaster. */
  type: 'single' | 'humbucker' | 'wide';
  /** Degrees clockwise; a slanted bridge pickup brings its treble end nearer the bridge. */
  angle?: number;
}

export interface BridgeAnchor extends Point {
  /**
   * `tremolo`: a plate of six saddles. `plate`: a plate that holds the bridge
   * pickup, with three barrel saddles. `tune-o-matic`: a bar with six
   * saddles, usually with a tailpiece. `acoustic`: a wooden bridge with a
   * saddle and pins. `locking`: a double-locking tremolo, its saddles
   * clamping the strings, with fine tuners behind them. `tie-block`: a
   * classical bridge, the strings tied round a raised block behind the saddle.
   */
  type: 'tremolo' | 'plate' | 'tune-o-matic' | 'acoustic' | 'locking' | 'tie-block';
}

export interface TailpieceAnchor extends Point {
  /** `vibrato`: a plate the strings anchor to, with an arm on the treble side. */
  type: 'stop' | 'trapeze' | 'vibrato';
}

export interface ControlAnchors {
  knobs: readonly Point[];
  switch?: Point & { type: 'blade' | 'toggle'; angle?: number };
  /** A metal control plate the knobs sit on, as a path. */
  plate?: string;
  /** The output jack on the top; `plate` sets it in a recessed oval plate. */
  jack?: Point & { plate?: boolean; angle?: number };
  /** Thumb-wheel pots seen edge on, drawn over `plate` (a Jazzmaster's rhythm circuit). */
  rollers?: readonly (Point & { angle?: number })[];
}

/**
 * A detail drawn on the top after the finish: `hole` is a dark opening
 * (f-holes, a soundhole), `trim` a cream line (purfling), `rosette` an
 * inlaid ring `width` mm wide centred on the path, and `bevel` a carved
 * edge: a lit band `width` mm wide inside the path, with a dark line where
 * it meets the flat of the top.
 */
export interface BodyDetail {
  d: string;
  paint: 'hole' | 'trim' | 'rosette' | 'bevel';
  width?: number;
}

/** `solid`: a paddle with posts through it. `slotted`: two slots with rollers, as on a classical. */
export type HeadstockKind = 'solid' | 'slotted';

/**
 * The neck's width and string spacing: `acoustic` is a steel-string neck a
 * little wider than `electric`; `classical` is wider and flat, with nylon strings.
 */
export type NeckKind = 'electric' | 'acoustic' | 'classical';

/** One body shape: a file in `bodies/`, registered by its file name. */
export interface BodyShape {
  /** The model name, for the accessible label when no part name is given. */
  name: string;
  /** The body's outline, as a closed path. */
  outline: string;
  /** The pickguard, when the shape has one; drawn only when the spec's pickguard has a colour. */
  pickguard?: string;
  pickups: readonly PickupAnchor[];
  bridge: BridgeAnchor;
  tailpiece?: TailpieceAnchor;
  controls: ControlAnchors;
  /**
   * Where the neck enters the body: the top of the neck pocket on the
   * centre line. Electrics share `NECK_JOINT_Y`; an acoustic's body starts
   * at its 12th or 14th fret.
   */
  neckJoint: { y: number };
  /** `solid` when unset. */
  headstock?: HeadstockKind;
  /** `electric` when unset. */
  neck?: NeckKind;
  /** Frets on the board; 22 when unset. */
  frets?: number;
  /** A cream binding round the edge of the top. */
  binding?: boolean;
  details?: readonly BodyDetail[];
}
