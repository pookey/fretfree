import { describe, expect, it } from 'vitest';
import { isFrontier } from './mastery';
import type { SkillStatus } from './model';
import { overlayStatus } from './overlay';

const ALL: SkillStatus[] = ['locked', 'unlocked', 'practising', 'mastered'];

describe('overlayStatus (M1-36)', () => {
  it('leaves every status alone without an overlay, or with it off', () => {
    for (const s of ALL) {
      expect(overlayStatus(s)).toBe(s);
      expect(overlayStatus(s, null)).toBe(s);
      expect(overlayStatus(s, {})).toBe(s);
      expect(overlayStatus(s, { unlockAll: false })).toBe(s);
    }
  });

  it('puts every unmastered skill on the frontier when unlocking all', () => {
    expect(overlayStatus('locked', { unlockAll: true })).toBe('unlocked');
    expect(overlayStatus('unlocked', { unlockAll: true })).toBe('unlocked');
    expect(overlayStatus('practising', { unlockAll: true })).toBe('practising');
    for (const s of ALL.filter((s) => s !== 'mastered'))
      expect(isFrontier(overlayStatus(s, { unlockAll: true }))).toBe(true);
  });

  it('keeps mastered skills mastered', () => {
    expect(overlayStatus('mastered', { unlockAll: true })).toBe('mastered');
  });
});
