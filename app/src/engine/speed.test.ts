import { describe, expect, it } from 'vitest';
import { isSpeedEvidence } from './speed';

describe('isSpeedEvidence', () => {
  it('leaves out timing drills, and counts every other drill', () => {
    expect(isSpeedEvidence('tap-strum-rhythm')).toBe(false);
    expect(isSpeedEvidence('name-the-note')).toBe(true);
    expect(isSpeedEvidence(undefined)).toBe(true);
    expect(isSpeedEvidence('d31', ['d31'])).toBe(false);
  });
});
