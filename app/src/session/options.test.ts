import { describe, expect, it } from 'vitest';
import { parseSessionOptions } from './options';

describe('parseSessionOptions', () => {
  it('reads every option from route state', () => {
    expect(parseSessionOptions({ minutes: 2, maxItems: 17.6, reviewOnly: true })).toEqual({
      minutes: 2,
      maxItems: 17,
      reviewOnly: true,
    });
  });

  it('treats missing or malformed state as the daily session', () => {
    expect(parseSessionOptions(null)).toEqual({});
    expect(parseSessionOptions('warm-up')).toEqual({});
    expect(parseSessionOptions({ minutes: -1, maxItems: Infinity, reviewOnly: 'yes' })).toEqual({});
  });
});
