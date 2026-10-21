import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import { parseNoteItemId } from './note';
import tab, { parseTabItemId, tabItemId } from './tab';

describe('tab items', () => {
  it('builds and parses `tab@s<n>f<n>`', () => {
    expect(tabItemId({ string: 3, fret: 5 })).toBe('tab@s3f5');
    expect(tabItemId({ string: 6, fret: 0 })).toBe('tab@s6f0');
    expect(parseTabItemId('tab@s1f12')).toEqual({ string: 1, fret: 12 });
  });

  it('rejects malformed IDs and arguments', () => {
    expect(parseTabItemId('tab@s3f05')).toBeNull();
    expect(parseTabItemId('tab@s03f5')).toBeNull();
    expect(parseTabItemId('tab@s3')).toBeNull();
    expect(parseTabItemId('note@s3f5')).toBeNull();
    expect(() => tabItemId({ string: 0.5, fret: 3 })).toThrow(RangeError);
    expect(() => tabItemId({ string: 3, fret: -1 })).toThrow(RangeError);
  });

  it('is its own card, apart from the note card at the same cell', () => {
    expect(parseNoteItemId('tab@s3f5')).toBeNull();
    expect(tab.kinds).toEqual(['tab']);
  });

  it('round-trips through the item registry', () => {
    const ref = parseItemId('tab@s2f7');
    expect(ref).toEqual({ kind: 'tab', position: { string: 2, fret: 7 } });
    expect(itemId(ref!)).toBe('tab@s2f7');
  });
});
