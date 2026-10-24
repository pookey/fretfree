import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import keyApply, { keyApplyItemId, parseKeyApplyItemId } from './key-apply';

describe('key-apply items', () => {
  it('builds and parses `key-apply:<letter>@<signature>`', () => {
    expect(keyApplyItemId('F', 2)).toBe('key-apply:F@2#');
    expect(keyApplyItemId('B', -1)).toBe('key-apply:B@1b');
    expect(keyApplyItemId('C', 0)).toBe('key-apply:C@0');
    expect(parseKeyApplyItemId('key-apply:E@3b')).toEqual({ letter: 'E', alteration: -3 });
    expect(parseKeyApplyItemId('key-apply:G@0')).toEqual({ letter: 'G', alteration: 0 });
    for (let a = -7; a <= 7; a++) {
      for (const letter of 'ABCDEFG') {
        expect(parseKeyApplyItemId(keyApplyItemId(letter, a))).toEqual({ letter, alteration: a });
      }
    }
  });

  it('rejects malformed IDs and refs', () => {
    expect(parseKeyApplyItemId('key-apply:F@8#')).toBeNull();
    expect(parseKeyApplyItemId('key-apply:F#@2#')).toBeNull();
    expect(parseKeyApplyItemId('key-apply:f@2#')).toBeNull();
    expect(parseKeyApplyItemId('key-apply:F@0#')).toBeNull();
    expect(parseKeyApplyItemId('key-apply:F')).toBeNull();
    expect(parseKeyApplyItemId('signature-key:2#')).toBeNull();
    expect(() => keyApplyItemId('H', 0)).toThrow(RangeError);
    expect(() => keyApplyItemId('F#', 0)).toThrow(RangeError);
    expect(() => keyApplyItemId('F', 8)).toThrow(RangeError);
    expect(() => keyApplyItemId('F', 1.5)).toThrow(RangeError);
  });

  it('round-trips through the item registry', () => {
    expect(keyApply.kinds).toEqual(['key-apply']);
    const ref = parseItemId('key-apply:C@2#');
    expect(ref).toEqual({ kind: 'key-apply', letter: 'C', alteration: 2 });
    expect(itemId(ref!)).toBe('key-apply:C@2#');
  });
});
