/**
 * What the guitar renderer draws (design §3.8). It takes resolved render
 * data, not catalogue IDs, so it stays independent of the catalogue: the
 * Garage looks each `GuitarSpec` ID up and passes the parts' names and
 * render data here.
 *
 * TODO(M11-01): the first block mirrors `engine/garage/types.ts`, which is
 * being built in parallel. Import those types from there once it lands and
 * keep only the renderer types below.
 */

export const CATEGORIES = ['body', 'finish', 'pickguard', 'hardware', 'board', 'inlay'] as const;

export type Category = (typeof CATEGORIES)[number];

export type FinishType = 'solid' | 'sunburst' | 'natural' | 'metallic' | 'sparkle';

/** One colour of a finish, at `offset` (0 to 1) along its gradient. */
export interface ColourStop {
  offset: number;
  colour: string;
}

/** A fretboard palette: the neck tokens of `styles/tokens.css`. */
export type BoardPalette = Readonly<
  Record<'--wood' | '--wood-dark' | '--string' | '--fret-wire' | '--inlay', string>
>;

export type InlayShape = 'dots' | 'blocks' | 'trapezoids';

/** What the renderer needs for each category's parts. */
export interface RenderData {
  /** `shape` names a body file in `bodies/`. */
  body: { shape: string };
  finish: { type: FinishType; stops: readonly ColourStop[] };
  /** `colour: null` is no pickguard. */
  pickguard: { colour: string | null };
  hardware: { colour: string };
  board: { palette: BoardPalette };
  inlay: { shape: InlayShape };
}

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
  type: 'single' | 'humbucker';
  /** Degrees clockwise; a slanted bridge pickup brings its treble end nearer the bridge. */
  angle?: number;
}

export interface BridgeAnchor extends Point {
  /**
   * `tremolo`: a plate of six saddles. `plate`: a plate that holds the bridge
   * pickup, with three barrel saddles. `tune-o-matic`: a bar with six
   * saddles, usually with a tailpiece. `acoustic`: a wooden bridge with a
   * saddle and pins.
   */
  type: 'tremolo' | 'plate' | 'tune-o-matic' | 'acoustic';
}

export interface TailpieceAnchor extends Point {
  type: 'stop' | 'trapeze';
}

export interface ControlAnchors {
  knobs: readonly Point[];
  switch?: Point & { type: 'blade' | 'toggle'; angle?: number };
  /** A metal control plate the knobs sit on, as a path. */
  plate?: string;
  jack?: Point;
}

/**
 * A detail drawn on the top after the finish: `hole` is a dark opening
 * (f-holes, a soundhole), `trim` a cream line (a rosette, purfling).
 */
export interface BodyDetail {
  d: string;
  paint: 'hole' | 'trim';
}

/** One body shape: a file in `bodies/`, registered by its file name. */
export interface BodyShape {
  /** The generic name, for the accessible label when no part name is given. */
  name: string;
  /** The body's outline, as a closed path. */
  outline: string;
  /** The pickguard, when the shape has one; drawn only when the spec's pickguard has a colour. */
  pickguard?: string;
  pickups: readonly PickupAnchor[];
  bridge: BridgeAnchor;
  tailpiece?: TailpieceAnchor;
  controls: ControlAnchors;
  /** Where the neck enters the body: the top of the neck pocket on the centre line. */
  neckJoint: { y: number };
  /** Frets on the board; 22 when unset. */
  frets?: number;
  /** A cream binding round the edge of the top. */
  binding?: boolean;
  details?: readonly BodyDetail[];
}
