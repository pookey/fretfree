import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, itemId, parseItemId } from '../model';
import {
  STRUM_PATTERNS,
  TAP_PATTERNS,
  parseRhythmPatternItemId,
  strumRhythmItemId,
  tapRhythmItemId,
} from './rhythm-pattern';

describe('rhythm pattern item IDs', () => {
  it('builds and parses tap and strum cards', () => {
    expect(tapRhythmItemId('offbeats')).toBe('tap-rhythm:offbeats');
    expect(strumRhythmItemId('d-du-udu')).toBe('strum-rhythm:d-du-udu');
    expect(parseRhythmPatternItemId('tap-rhythm:quarters')).toEqual({
      kind: 'tap-rhythm',
      pattern: 'quarters',
    });
    const ref = parseItemId('strum-rhythm:down-up-eighths');
    expect(ref).toEqual({ kind: 'strum-rhythm', pattern: 'down-up-eighths' });
    expect(itemId(ref!)).toBe('strum-rhythm:down-up-eighths');
  });

  it('round-trips every pattern', () => {
    for (const p of TAP_PATTERNS)
      expect(itemId(parseItemId(tapRhythmItemId(p))!)).toBe(`tap-rhythm:${p}`);
    for (const p of STRUM_PATTERNS)
      expect(itemId(parseItemId(strumRhythmItemId(p))!)).toBe(`strum-rhythm:${p}`);
  });

  it('registers both kinds', () => {
    expect(ITEM_KINDS).toContain('tap-rhythm');
    expect(ITEM_KINDS).toContain('strum-rhythm');
  });

  it('rejects unknown patterns, and a pattern of the other kind', () => {
    expect(() => tapRhythmItemId('waltz' as never)).toThrow(RangeError);
    expect(() => strumRhythmItemId('quarters' as never)).toThrow(RangeError);
    for (const bad of [
      'tap-rhythm:waltz',
      'tap-rhythm:d-du-udu',
      'strum-rhythm:quarters',
      'tap-rhythm:',
      'tap-rhythm:Quarters',
      'rhythm:quarters',
      'tap-rhythm:quarters@80',
    ]) {
      expect(parseRhythmPatternItemId(bad), bad).toBeNull();
    }
  });
});
