import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../config';
import { CATALOGUE, catalogueItem, collectCatalogue, itemsIn } from './catalogue';
import {
  DEFAULT_GUITAR_NAME,
  GUITAR_NAME_MAX,
  STARTER_BUILD,
  STARTER_SPEC,
  cleanGuitarName,
} from './starter';
import { CATEGORIES, type CatalogueItem } from './types';

const part = (id: string, category: CatalogueItem['category'] = 'finish'): CatalogueItem =>
  ({ id, category, name: id, price: 10, render: {} }) as CatalogueItem;

describe('the catalogue registry', () => {
  it('collects every category file, in category order', () => {
    expect(new Set(CATALOGUE.map((i) => i.category))).toEqual(new Set(CATEGORIES));
    const order = CATALOGUE.map((i) => CATEGORIES.indexOf(i.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(ENGINE_CONFIG.garage.prices['finish.red']).toBe(0);
  });

  it('looks parts up by ID and by category', () => {
    expect(catalogueItem('board.rosewood')?.category).toBe('board');
    expect(catalogueItem('nope')).toBeUndefined();
    expect(itemsIn('inlay').every((i) => i.category === 'inlay')).toBe(true);
    expect(itemsIn('inlay').map((i) => i.id)).toContain('inlay.dots');
  });

  it('orders files by category, whatever order they load in', () => {
    const mods = {
      './catalogue/inlay.ts': { default: [part('inlay.a', 'inlay')] },
      './catalogue/body.ts': { default: [part('body.a', 'body')] },
    };
    expect(collectCatalogue(mods).map((i) => i.id)).toEqual(['body.a', 'inlay.a']);
  });

  it('rejects a file not named after a category', () => {
    expect(() => collectCatalogue({ './catalogue/neck.ts': { default: [] } })).toThrow(
      /neck\.ts is not named after a category/,
    );
  });

  it('rejects a file without a default export', () => {
    expect(() => collectCatalogue({ './catalogue/body.ts': {} })).toThrow(/must default-export/);
  });

  it('rejects a part filed under another category', () => {
    expect(() =>
      collectCatalogue({ './catalogue/body.ts': { default: [part('finish.x')] } }),
    ).toThrow(/finish\.x is a finish part, filed in body\.ts/);
  });

  it('rejects a part with neither a price nor a badge, so it is never unobtainable', () => {
    const { price: _price, ...unpriced } = part('finish.x');
    expect(() =>
      collectCatalogue({ './catalogue/finish.ts': { default: [unpriced as CatalogueItem] } }),
    ).toThrow(/finish\.x has no price/);
    const mastery = { ...unpriced, unlockedBy: 'whole-neck' } as CatalogueItem;
    expect(collectCatalogue({ './catalogue/finish.ts': { default: [mastery] } })).toEqual([
      mastery,
    ]);
  });

  it('has a registered part for every price in the config', () => {
    for (const id of Object.keys(ENGINE_CONFIG.garage.prices)) {
      expect(catalogueItem(id)?.price, id).toBe(ENGINE_CONFIG.garage.prices[id]);
    }
  });

  it('rejects an ID used twice', () => {
    expect(() =>
      collectCatalogue({
        './catalogue/finish.ts': { default: [part('finish.x'), part('finish.x')] },
      }),
    ).toThrow(/defined twice/);
  });
});

describe('the starter guitar', () => {
  it('is a complete build of free, registered parts in their own categories', () => {
    for (const category of CATEGORIES) {
      const item = catalogueItem(STARTER_SPEC[category]);
      expect(item?.category, category).toBe(category);
      expect(item?.price, category).toBe(0);
    }
    expect(STARTER_BUILD).toEqual({ spec: STARTER_SPEC, name: DEFAULT_GUITAR_NAME });
  });

  it('has rosewood with exactly the default neck palette', () => {
    const rosewood = itemsIn('board').find((b) => b.id === STARTER_SPEC.board);
    expect(rosewood?.render.palette).toEqual({
      '--wood': '#4a2f22',
      '--wood-dark': '#3a2419',
      '--string': '#ddd3c4',
      '--fret-wire': '#c9c3bb',
      '--inlay': '#e8dfd2',
    });
  });
});

describe('guitar names', () => {
  it('are trimmed, capped and never empty', () => {
    expect(cleanGuitarName('  Blue Moon  ')).toBe('Blue Moon');
    expect(cleanGuitarName('   ')).toBe(DEFAULT_GUITAR_NAME);
    expect(cleanGuitarName('x'.repeat(60))).toHaveLength(GUITAR_NAME_MAX);
  });

  it('cap by character, not UTF-16 unit, so an emoji is never split', () => {
    const name = cleanGuitarName(`${'a'.repeat(39)}🎸🎸`);
    expect([...name]).toHaveLength(GUITAR_NAME_MAX);
    expect(name.endsWith('🎸')).toBe(true);
  });
});
