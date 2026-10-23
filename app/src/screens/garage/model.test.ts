import { describe, expect, it } from 'vitest';
import { guitarLabel, hasBody } from '../../components/guitar';
import {
  CATEGORIES,
  STARTER_SPEC,
  catalogueItem,
  itemsIn,
  type CatalogueItem,
} from '../../engine/garage';
import {
  CATEGORY_LABELS,
  partState,
  pendingTryOn,
  pickerItems,
  previewHeightRem,
  previewSpec,
  resolveLook,
  tapPart,
  tryOnSummary,
  withoutCategory,
} from './model';

const item = (id: string): CatalogueItem => {
  const found = catalogueItem(id);
  if (!found) throw new Error(`no catalogue item ${id}`);
  return found;
};

const starterOwned = new Set(Object.values(STARTER_SPEC));

describe('pickerItems', () => {
  it('offers only bodies that have a drawing', () => {
    const offered = pickerItems('body');
    expect(offered.map((i) => i.id)).toContain('body.stratocaster');
    for (const body of itemsIn('body')) {
      expect(offered.includes(body)).toBe(hasBody(body.render.shape));
    }
  });

  it('offers every part of the other categories', () => {
    expect(pickerItems('finish').length).toBeGreaterThan(10);
    expect(pickerItems('inlay').map((i) => i.id)).toEqual([
      'inlay.dots',
      'inlay.blocks',
      'inlay.trapezoids',
    ]);
  });

  it('labels every category', () => {
    for (const c of CATEGORIES) expect(CATEGORY_LABELS[c]).toMatch(/^[A-Z]/);
  });
});

describe('resolveLook', () => {
  it('resolves the starter into named parts', () => {
    const look = resolveLook(STARTER_SPEC);
    expect(look.body.name).toBe('Stratocaster');
    expect(look.finish.render.type).toBe('solid');
    expect(guitarLabel(look)).toMatch(/^Stratocaster guitar, red/);
  });

  it('throws on an unknown part', () => {
    expect(() => resolveLook({ ...STARTER_SPEC, finish: 'finish.nope' })).toThrow(/finish\.nope/);
  });
});

describe('partState', () => {
  it('says owned for a starter part', () => {
    expect(partState(item('finish.red'), starterOwned, 0)).toEqual({ kind: 'owned' });
  });

  it('gives the price, affordable or not, with no other wording', () => {
    const price = item('finish.blue').price!;
    expect(partState(item('finish.blue'), starterOwned, price)).toEqual({
      kind: 'buy',
      price,
      affordable: true,
    });
    expect(partState(item('finish.blue'), starterOwned, price - 1)).toEqual({
      kind: 'buy',
      price,
      affordable: false,
    });
  });

  it('names the badge for a mastery finish', () => {
    expect(partState(item('finish.gold-leaf'), starterOwned, 1e6)).toEqual({
      kind: 'badge',
      badgeId: 'whole-neck',
      badgeTitle: 'Whole neck',
    });
  });

  it('says owned for a mastery finish once its badge unlocks', () => {
    const owned = new Set([...starterOwned, 'finish.gold-leaf']);
    expect(partState(item('finish.gold-leaf'), owned, 0)).toEqual({ kind: 'owned' });
  });

  it('falls back to the badge ID when no achievement has it', () => {
    const odd = { ...item('finish.gold-leaf'), unlockedBy: 'no-such-badge' } as CatalogueItem;
    expect(partState(odd, starterOwned, 0)).toMatchObject({ badgeTitle: 'no-such-badge' });
  });
});

describe('trying parts on', () => {
  it('tries on a part that isn’t owned, without equipping it', () => {
    expect(tapPart(item('finish.blue'), starterOwned, {})).toEqual({
      tryOn: { finish: 'finish.blue' },
      equip: false,
    });
  });

  it('equips an owned part and ends the try-on in its category only', () => {
    const tryOn = { finish: 'finish.blue', inlay: 'inlay.blocks' };
    expect(tapPart(item('finish.red'), starterOwned, tryOn)).toEqual({
      tryOn: { inlay: 'inlay.blocks' },
      equip: true,
    });
  });

  it('shows try-ons over the equipped build', () => {
    expect(previewSpec(STARTER_SPEC, { body: 'body.les-paul' })).toEqual({
      ...STARTER_SPEC,
      body: 'body.les-paul',
    });
  });

  it('drops try-ons that the build now has', () => {
    const equipped = { ...STARTER_SPEC, finish: 'finish.blue' };
    expect(pendingTryOn(equipped, { finish: 'finish.blue', body: 'body.les-paul' })).toEqual({
      body: 'body.les-paul',
    });
  });

  it('drops one category', () => {
    expect(withoutCategory({ finish: 'finish.blue', body: 'body.les-paul' }, 'body')).toEqual({
      finish: 'finish.blue',
    });
  });

  it('sums up the try-ons in words, in category order', () => {
    expect(tryOnSummary({ finish: 'finish.cherry-sunburst', body: 'body.les-paul' })).toBe(
      'Les Paul body, Cherry sunburst finish',
    );
    expect(tryOnSummary({ finish: 'finish.nope' })).toBe('');
  });
});

describe('previewHeightRem', () => {
  it('fills the iPad window beside the parts panel', () => {
    expect(previewHeightRem('regular-wide', 834)).toBeCloseTo(834 / 16 - 17);
    expect(previewHeightRem('regular-wide', 300)).toBe(24);
    expect(previewHeightRem('regular-wide', 2000)).toBe(52);
  });

  it('leaves room for the parts panel below on iPad portrait', () => {
    expect(previewHeightRem('regular', 1194)).toBeCloseTo((1194 / 16) * 0.45);
    expect(previewHeightRem('regular', 2000)).toBe(36);
  });

  it('keeps the guitar above the parts sheet on a phone', () => {
    const h = previewHeightRem('compact', 852);
    expect(h * 16 + 6 * 16).toBeLessThanOrEqual(852 * 0.4 + 1);
    expect(previewHeightRem('compact', 393)).toBe(10);
  });
});
