import { describe, expect, it } from 'vitest';
import { CATALOGUE } from './catalogue';
import { STARTER_SPEC } from './starter';
import type { CatalogueItem, GaragePurchase, WalletState } from './types';
import { balance, buy, buyRefusal, canBuy, owned } from './wallet';

const at = new Date('2026-10-23T09:00:00Z');

const blue: CatalogueItem = {
  id: 'finish.blue',
  category: 'finish',
  name: 'Blue',
  price: 120,
  render: { type: 'solid', stops: [{ offset: 0, colour: '#0072b2' }] },
};
const goldLeaf: CatalogueItem = {
  id: 'finish.gold-leaf',
  category: 'finish',
  name: 'Gold leaf',
  unlockedBy: 'whole-neck',
  render: { type: 'metallic', stops: [{ offset: 0, colour: '#c9a227' }] },
};
// The stand-ins replace the catalogue's own parts of the same IDs, at fixed prices.
const catalogue = [
  ...CATALOGUE.filter((i) => i.id !== blue.id && i.id !== goldLeaf.id),
  blue,
  goldLeaf,
];

const bought = (itemId: string, price: number): GaragePurchase => ({ itemId, price, at });

const state = (patch: Partial<WalletState> = {}): WalletState => ({
  xpTotal: 0,
  purchases: [],
  achievements: [],
  ...patch,
});

describe('balance', () => {
  it('is XP earned minus what owned parts cost', () => {
    expect(balance(500, [])).toBe(500);
    expect(balance(500, [bought('a', 120), bought('b', 80)])).toBe(300);
  });

  it('never shows below 0, even after an offline merge overspends', () => {
    expect(balance(100, [bought('a', 120), bought('b', 80)])).toBe(0);
  });
});

describe('owned', () => {
  it('starts with the free starter guitar', () => {
    const ids = owned([], [], catalogue);
    for (const id of Object.values(STARTER_SPEC)) expect(ids.has(id)).toBe(true);
    expect(ids.has(blue.id)).toBe(false);
    expect(ids.has(goldLeaf.id)).toBe(false);
  });

  it('adds bought parts and finishes whose badge is unlocked', () => {
    const ids = owned([bought(blue.id, 120)], [{ id: 'whole-neck' }], catalogue);
    expect(ids.has(blue.id)).toBe(true);
    expect(ids.has(goldLeaf.id)).toBe(true);
  });

  it('ignores badges that unlock nothing', () => {
    expect(owned([], [{ id: 'streak-7' }], catalogue).has(goldLeaf.id)).toBe(false);
  });

  it('uses the registered catalogue by default', () => {
    expect(owned([], []).has(STARTER_SPEC.body)).toBe(true);
  });
});

describe('canBuy and buy', () => {
  it('sells an affordable part not yet owned', () => {
    const s = state({ xpTotal: 120 });
    expect(canBuy(blue, s, catalogue)).toBe(true);
    expect(buy(blue, s, at, catalogue)).toEqual({
      ok: true,
      purchase: { itemId: 'finish.blue', price: 120, at },
    });
  });

  it('refuses a part already owned, starter parts included', () => {
    const s = state({ xpTotal: 1000, purchases: [bought(blue.id, 120)] });
    expect(buy(blue, s, at, catalogue)).toEqual({ ok: false, reason: 'owned' });
    const starter = CATALOGUE.find((i) => i.id === STARTER_SPEC.finish)!;
    expect(canBuy(starter, state({ xpTotal: 1000 }))).toBe(false);
    expect(buyRefusal(starter, state())).toBe('owned');
  });

  it('refuses a mastery finish: it is unlocked, never sold', () => {
    expect(buy(goldLeaf, state({ xpTotal: 10_000 }), at, catalogue)).toEqual({
      ok: false,
      reason: 'mastery-only',
    });
    const unlocked = state({ achievements: [{ id: 'whole-neck' }] });
    expect(buyRefusal(goldLeaf, unlocked, catalogue)).toBe('owned');
  });

  it('refuses a part the balance does not cover, counting earlier purchases', () => {
    expect(buy(blue, state({ xpTotal: 119 }), at, catalogue)).toEqual({
      ok: false,
      reason: 'unaffordable',
    });
    const spent = state({ xpTotal: 200, purchases: [bought('finish.green', 100)] });
    expect(canBuy(blue, spent, catalogue)).toBe(false);
  });
});
