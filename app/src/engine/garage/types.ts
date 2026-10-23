/**
 * The Garage contracts (design §3.8): a cosmetic guitar built from catalogue
 * parts. Most parts are bought with the derived garage balance; a few
 * finishes are unlocked only by a mastery, speed or mic badge. Nothing here
 * changes what is practised.
 */

export const CATEGORIES = ['body', 'finish', 'pickguard', 'hardware', 'board', 'inlay'] as const;

export type Category = (typeof CATEGORIES)[number];

/** A complete build: one catalogue item ID per category. */
export interface GuitarSpec {
  body: string;
  finish: string;
  pickguard: string;
  hardware: string;
  board: string;
  inlay: string;
}

export type FinishType = 'solid' | 'sunburst' | 'natural' | 'metallic' | 'sparkle';

/** One colour of a finish, at `offset` (0 to 1) along its gradient. */
export interface ColourStop {
  offset: number;
  colour: string;
}

/**
 * A fretboard palette: the neck tokens of `styles/tokens.css`, so the neck
 * skin (M11-08) can apply it as-is. Strings, fret wire and inlays must keep
 * 3:1 contrast against `--wood` (M11-04 tests this).
 */
export type BoardPalette = Readonly<
  Record<'--wood' | '--wood-dark' | '--string' | '--fret-wire' | '--inlay', string>
>;

export type InlayShape = 'dots' | 'blocks' | 'trapezoids';

/** What the renderer needs for each category's parts. */
export interface RenderData {
  /** `shape` names a body file in `components/guitar/bodies/` (M11-03). */
  body: { shape: string };
  finish: { type: FinishType; stops: readonly ColourStop[] };
  /** `colour: null` is no pickguard. */
  pickguard: { colour: string | null };
  hardware: { colour: string };
  board: { palette: BoardPalette };
  inlay: { shape: InlayShape };
}

interface ItemOf<C extends Category> {
  /** Unique across the catalogue: `<category>.<name>`, e.g. `finish.red`. */
  id: string;
  category: C;
  /** A generic display name, never a brand or model name. */
  name: string;
  /**
   * XP price, from `engine/config/garage.ts`. 0 is a free starter part.
   * Absent: not for sale, only unlocked by `unlockedBy`.
   */
  price?: number;
  /** The achievement ID that unlocks this part (mastery finishes only). */
  unlockedBy?: string;
  render: RenderData[C];
}

/** A catalogue part, narrowed by `category`. */
export type CatalogueItem<C extends Category = Category> = { [K in C]: ItemOf<K> }[C];

/** One owned part (schema v6 `garagePurchases`, keyed by `itemId`). */
export interface GaragePurchase {
  itemId: string;
  /** The XP it cost, kept so the balance never moves if a price changes. */
  price: number;
  at: Date;
}

/** The equipped build and its name (schema v6 `garage` singleton). */
export interface GarageBuild {
  spec: GuitarSpec;
  name: string;
}

/** What the wallet needs to decide ownership and affordability. */
export interface WalletState {
  /** Lifetime XP earned (`Gamification.xpTotal`). Never spent. */
  xpTotal: number;
  purchases: readonly GaragePurchase[];
  /** Unlocked achievements; only their IDs matter. */
  achievements: readonly { id: string }[];
}

export type BuyRefusalReason =
  /** Already owned: a starter part, a purchase or an unlocked finish. */
  | 'owned'
  /** Not for sale: unlocked only by its badge. */
  | 'mastery-only'
  | 'unaffordable'
  /** No catalogue item has this ID. */
  | 'unknown-item';

export type BuyResult =
  { ok: true; purchase: GaragePurchase } | { ok: false; reason: BuyRefusalReason };
