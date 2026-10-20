import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import { parseScalePositionItemId, scalePositionItemId, scaleRunItemId } from './scale-position';

describe('scale-position item IDs', () => {
  it('builds and parses position and run cards', () => {
    expect(scalePositionItemId(1)).toBe('scale-position:1');
    expect(scaleRunItemId(4, 5)).toBe('scale-run:4@5');
    expect(parseScalePositionItemId('scale-position:3')).toEqual({
      kind: 'scale-position',
      position: 3,
    });
    expect(parseScalePositionItemId('scale-run:2@7')).toEqual({
      kind: 'scale-run',
      position: 2,
      degree: 7,
    });
  });

  it('round-trips through the registry', () => {
    for (const id of ['scale-position:5', 'scale-run:1@1', 'scale-run:5@7']) {
      const ref = parseItemId(id);
      expect(ref, id).not.toBeNull();
      expect(itemId(ref!)).toBe(id);
    }
  });

  it('refuses positions and degrees outside the scale', () => {
    expect(() => scalePositionItemId(0 as never)).toThrow(RangeError);
    expect(() => scaleRunItemId(6 as never, 1)).toThrow(RangeError);
    expect(() => scaleRunItemId(1, 8 as never)).toThrow(RangeError);
    for (const bad of [
      'scale-position:0',
      'scale-position:6',
      'scale-position:01',
      'scale-position:1@1',
      'scale-run:1',
      'scale-run:1@0',
      'scale-run:1@8',
      'scale-run:6@1',
      'scale:1',
    ]) {
      expect(parseScalePositionItemId(bad), bad).toBeNull();
    }
  });
});
