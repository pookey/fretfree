import { hasBody, type GuitarLook } from '../../components/guitar';
import { ACHIEVEMENTS } from '../../engine/gamification/achievements';
import {
  CATEGORIES,
  catalogueItem,
  itemsIn,
  type CatalogueItem,
  type Category,
  type GuitarSpec,
} from '../../engine/garage';
import type { SizeClass } from '../../shell/size-class';

/**
 * The Garage screen's pure logic (design §3.8, §7 Garage): what each part's
 * swatch says, how a try-on sits on top of the equipped build, and how tall
 * the preview is drawn.
 */

const REM = 16;

/** The picker's tab names, in `CATEGORIES` order. */
export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  body: 'Body',
  finish: 'Finish',
  pickguard: 'Pickguard',
  hardware: 'Hardware',
  board: 'Fretboard',
  inlay: 'Inlays',
};

/**
 * The parts the picker offers in `category`. Bodies without a drawing yet are
 * left out: the renderer would draw them as a Stratocaster.
 */
export function pickerItems(category: Category): CatalogueItem[] {
  const items: CatalogueItem[] = itemsIn(category);
  return items.filter((item) => item.category !== 'body' || hasBody(item.render.shape));
}

/** A spec's parts, resolved through the catalogue into what `<Guitar>` draws. */
export function resolveLook(spec: GuitarSpec): GuitarLook {
  const part = (id: string) => {
    const item = catalogueItem(id);
    if (!item) throw new Error(`No catalogue item ${id}`);
    return { name: item.name, render: item.render };
  };
  return Object.fromEntries(CATEGORIES.map((c) => [c, part(spec[c])])) as unknown as GuitarLook;
}

/**
 * What a swatch says about its part. Every state is marked by text and a
 * shape, not colour alone. There is no "can't afford" state: an unaffordable
 * part shows its price like any other, and only its Buy button is disabled.
 */
export type PartState =
  | { kind: 'owned' }
  | { kind: 'buy'; price: number; affordable: boolean }
  | { kind: 'badge'; badgeId: string; badgeTitle: string };

export function partState(
  item: CatalogueItem,
  owned: ReadonlySet<string>,
  balance: number,
): PartState {
  if (owned.has(item.id)) return { kind: 'owned' };
  if (item.price === undefined) {
    const badgeId = item.unlockedBy ?? '';
    const badgeTitle = ACHIEVEMENTS.find((a) => a.id === badgeId)?.title ?? badgeId;
    return { kind: 'badge', badgeId, badgeTitle };
  }
  return { kind: 'buy', price: item.price, affordable: item.price <= balance };
}

/** Parts being tried on, by category, over the equipped build. */
export type TryOn = Partial<GuitarSpec>;

/** The build the preview shows: the equipped parts, with any try-ons in their place. */
export function previewSpec(equipped: GuitarSpec, tryOn: TryOn): GuitarSpec {
  return { ...equipped, ...tryOn };
}

/**
 * What tapping a part does. An owned part is equipped at once (free), and
 * any try-on in its category ends. Any other part is tried on: the preview
 * changes and nothing is spent or saved.
 */
export function tapPart(
  item: CatalogueItem,
  owned: ReadonlySet<string>,
  tryOn: TryOn,
): { tryOn: TryOn; equip: boolean } {
  const rest = withoutCategory(tryOn, item.category);
  if (owned.has(item.id)) return { tryOn: rest, equip: true };
  return { tryOn: { ...rest, [item.category]: item.id }, equip: false };
}

export function withoutCategory(tryOn: TryOn, category: Category): TryOn {
  const { [category]: _dropped, ...rest } = tryOn;
  return rest;
}

/**
 * Try-ons that still differ from the build. A part that was bought (and so
 * equipped) or equipped elsewhere stops being a try-on.
 */
export function pendingTryOn(equipped: GuitarSpec, tryOn: TryOn): TryOn {
  const out: TryOn = {};
  for (const category of CATEGORIES) {
    const id = tryOn[category];
    if (id !== undefined && id !== equipped[category]) out[category] = id;
  }
  return out;
}

/** The parts being tried on, in words: "Cherry sunburst finish, Les Paul body". */
export function tryOnSummary(tryOn: TryOn): string {
  return CATEGORIES.flatMap((category) => {
    const id = tryOn[category];
    const item = id === undefined ? undefined : catalogueItem(id);
    return item ? [`${item.name} ${CATEGORY_LABELS[category].toLowerCase()}`] : [];
  }).join(', ');
}

/**
 * The preview's height in rem on iPad portrait and phones. The guitar stands
 * upright, so its height sets its size. On regular-wide the stylesheet sizes
 * it instead (`.frame` in `Garage.module.css`), since how it fits there
 * depends on the width of the main pane.
 */
export function previewHeightRem(
  sizeClass: Exclude<SizeClass, 'regular-wide'>,
  viewportHeight: number,
): number {
  const vh = viewportHeight / REM;
  switch (sizeClass) {
    // The parts panel sits below, so leave some of it in view.
    case 'regular':
      return clamp(vh * 0.45, 24, 36);
    // The parts sheet covers the bottom 60% of the screen, so the guitar fits
    // in the top 40%, under the title, and a try-on stays in view.
    case 'compact':
      return clamp(vh * 0.4 - 6, 10, 20);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
