import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import accent, {
  ACCENT_PATTERNS,
  COUNT_PATTERNS,
  accentItemId,
  countItemId,
  parseAccentItemId,
  patternMeter,
  type AccentPattern,
  type CountPattern,
} from './accent';

describe('accent items', () => {
  it('builds and parses `count:<meter>:<per beat>` and `accent:<meter>:<name>`', () => {
    expect(countItemId('6/8:3')).toBe('count:6/8:3');
    expect(accentItemId('4/4:backbeat')).toBe('accent:4/4:backbeat');
    expect(parseAccentItemId('count:4/4:4')).toEqual({ kind: 'count', pattern: '4/4:4' });
    expect(parseAccentItemId('accent:7/8:grouping')).toEqual({
      kind: 'accent',
      pattern: '7/8:grouping',
    });
  });

  it('round-trips every pattern through the item registry', () => {
    for (const pattern of COUNT_PATTERNS) {
      const ref = parseItemId(countItemId(pattern));
      expect(ref).toEqual({ kind: 'count', pattern });
      expect(itemId(ref!)).toBe(`count:${pattern}`);
    }
    for (const pattern of ACCENT_PATTERNS) {
      const ref = parseItemId(accentItemId(pattern));
      expect(ref).toEqual({ kind: 'accent', pattern });
      expect(itemId(ref!)).toBe(`accent:${pattern}`);
    }
    expect(accent.kinds).toEqual(['count', 'accent']);
  });

  it('rejects malformed IDs and patterns it has no bar for', () => {
    for (const id of [
      'count:4/4:5',
      'count:4/4:backbeat',
      'accent:4/4:4',
      'accent:4/4',
      'count:04/4:4',
      'accent:9/8:backbeat',
      'meter:4/4:feltBeats',
      'count:',
    ]) {
      expect(parseAccentItemId(id), id).toBeNull();
    }
    expect(() => countItemId('4/4:5' as CountPattern)).toThrow(RangeError);
    expect(() => accentItemId('4/4:nope' as AccentPattern)).toThrow(RangeError);
  });

  it('names the meter of a pattern', () => {
    expect(patternMeter('12/8:3')).toBe('12/8');
    expect(patternMeter('3/4:waltz-strum')).toBe('3/4');
  });
});
