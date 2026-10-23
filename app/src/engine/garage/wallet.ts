import { CATALOGUE } from './catalogue';
import type {
  BuyRefusalReason,
  BuyResult,
  CatalogueItem,
  GaragePurchase,
  WalletState,
} from './types';

/**
 * The garage wallet (design §3.8). Pure and deterministic. XP earned is never
 * spent: the balance is derived from it and the purchases, so sync's max-merge
 * of `xpTotal` and union of purchases can't make it wrong, only below zero
 * after an offline merge, which shows as 0.
 */

/** XP left to spend: `xpTotal − Σ price`, at least 0. */
export function balance(xpTotal: number, purchases: readonly GaragePurchase[]): number {
  const spent = purchases.reduce((sum, p) => sum + p.price, 0);
  return Math.max(0, xpTotal - spent);
}

/**
 * The IDs of every owned part: the free starter parts, the bought ones, and
 * the parts whose `unlockedBy` badge is unlocked.
 */
export function owned(
  purchases: readonly GaragePurchase[],
  achievements: readonly { id: string }[],
  catalogue: readonly CatalogueItem[] = CATALOGUE,
): Set<string> {
  const unlocked = new Set(achievements.map((a) => a.id));
  const out = new Set(purchases.map((p) => p.itemId));
  for (const item of catalogue) {
    if (item.price === 0) out.add(item.id);
    if (item.unlockedBy !== undefined && unlocked.has(item.unlockedBy)) out.add(item.id);
  }
  return out;
}

/** Why `item` can't be bought now, or null if it can. */
export function buyRefusal(
  item: CatalogueItem,
  state: WalletState,
  catalogue: readonly CatalogueItem[] = CATALOGUE,
): BuyRefusalReason | null {
  if (owned(state.purchases, state.achievements, catalogue).has(item.id)) return 'owned';
  if (item.price === undefined) return 'mastery-only';
  if (item.price > balance(state.xpTotal, state.purchases)) return 'unaffordable';
  return null;
}

/** False for mastery-only, owned and unaffordable parts. */
export function canBuy(
  item: CatalogueItem,
  state: WalletState,
  catalogue: readonly CatalogueItem[] = CATALOGUE,
): boolean {
  return buyRefusal(item, state, catalogue) === null;
}

/** The purchase record for `item` at `now`, or why it can't be bought. */
export function buy(
  item: CatalogueItem,
  state: WalletState,
  now: Date,
  catalogue: readonly CatalogueItem[] = CATALOGUE,
): BuyResult {
  const reason = buyRefusal(item, state, catalogue);
  if (reason !== null) return { ok: false, reason };
  return { ok: true, purchase: { itemId: item.id, price: item.price ?? 0, at: now } };
}
