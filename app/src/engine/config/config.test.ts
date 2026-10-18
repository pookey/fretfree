import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG, collectAreas } from './index';

describe('ENGINE_CONFIG', () => {
  it('collects one key per area file', () => {
    expect(Object.keys(ENGINE_CONFIG).sort()).toEqual(
      expect.arrayContaining([
        'adaptive',
        'calibration',
        'fsrs',
        'gamification',
        'grading',
        'guides',
        'heatmap',
        'mastery',
        'session',
      ]),
    );
    expect(ENGINE_CONFIG.grading.defaultBaselineMs).toBe(700);
    expect(ENGINE_CONFIG.gamification.celebrations.comboShowAt).toBe(3);
  });

  it('rejects an area file without an export named after it', () => {
    expect(() => collectAreas({ './speed.ts': { other: {} } })).toThrow(/must export `speed`/);
  });
});
