import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import earFind, { earFindItemId, parseEarFindItemId } from './ear-find';
import { parseFindItemId } from './find';

describe('ear-find items', () => {
  it('builds and parses `ear-find:<pc>@s<n>`', () => {
    expect(earFindItemId('G', 4)).toBe('ear-find:G@s4');
    expect(earFindItemId('Bb', 1)).toBe('ear-find:Bb@s1');
    expect(parseEarFindItemId('ear-find:F#@s6')).toEqual({ pc: 'F#', string: 6 });
  });

  it('rejects malformed IDs and arguments', () => {
    expect(parseEarFindItemId('ear-find:H@s4')).toBeNull();
    expect(parseEarFindItemId('ear-find:G@s04')).toBeNull();
    expect(parseEarFindItemId('find:G@s4')).toBeNull();
    expect(() => earFindItemId('H', 4)).toThrow(RangeError);
    expect(() => earFindItemId('G', -1)).toThrow(RangeError);
  });

  it('is its own card, apart from the find card for the same note', () => {
    expect(parseFindItemId('ear-find:G@s4')).toBeNull();
    expect(earFind.kinds).toEqual(['ear-find']);
  });

  it('round-trips through the item registry', () => {
    const ref = parseItemId('ear-find:C#@s2');
    expect(ref).toEqual({ kind: 'ear-find', pc: 'C#', string: 2 });
    expect(itemId(ref!)).toBe('ear-find:C#@s2');
  });
});
