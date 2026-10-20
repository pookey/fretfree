import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, itemId, parseItemId } from '../model';
import { inversionItemId, parseInversionItemId } from './inversion';

describe('inversion item IDs', () => {
  it('builds and parses build and name cards', () => {
    expect(inversionItemId('inversion', 1, 3, 'major')).toBe('inversion:1@s3/major');
    expect(inversionItemId('inversion-name', 0, 6, 'minor')).toBe('inversion-name:0@s6/minor');
    expect(parseInversionItemId('inversion:2@s4/minor')).toEqual({
      kind: 'inversion',
      inversion: 2,
      lowString: 4,
      quality: 'minor',
    });
    const ref = parseItemId('inversion-name:1@s5/major');
    expect(ref).toEqual({ kind: 'inversion-name', inversion: 1, lowString: 5, quality: 'major' });
    expect(itemId(ref!)).toBe('inversion-name:1@s5/major');
  });

  it('registers both kinds', () => {
    expect(ITEM_KINDS).toContain('inversion');
    expect(ITEM_KINDS).toContain('inversion-name');
  });

  it('rejects other inversions, string sets and qualities', () => {
    expect(() => inversionItemId('inversion', 3 as never, 3, 'major')).toThrow(RangeError);
    expect(() => inversionItemId('inversion', 0, 2 as never, 'major')).toThrow(RangeError);
    expect(() => inversionItemId('inversion', 0, 3, 'dominant7' as never)).toThrow(RangeError);
    for (const bad of [
      'inversion:3@s3/major',
      'inversion:0@s2/major',
      'inversion:0@s7/major',
      'inversion:0@s3/diminished',
      'inversion:01@s3/major',
      'inversion:0@s3',
      'inversions:0@s3/major',
      'inversion-name:1@3/major',
    ]) {
      expect(parseInversionItemId(bad), bad).toBeNull();
    }
  });
});
