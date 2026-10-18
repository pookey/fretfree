import { describe, expect, it } from 'vitest';
import { initialScope, rollingAccuracy, updateScope, type ScopeState } from './adaptive';

const bounds = { minLevel: 0, maxLevel: 3 };

function feed(state: ScopeState, answers: boolean[]) {
  let s = state;
  let last = null as ReturnType<typeof updateScope>['change'];
  for (const a of answers) {
    const r = updateScope(s, a, bounds);
    s = r.state;
    if (r.change) last = r.change;
  }
  return { s, last };
}

describe('adaptive scope (80–90% band)', () => {
  it('computes rolling accuracy', () => {
    expect(rollingAccuracy([])).toBe(0);
    expect(rollingAccuracy([true, false, true, true])).toBe(0.75);
  });

  it('waits for enough answers before deciding', () => {
    const { s, last } = feed(initialScope(), Array(9).fill(true));
    expect(last).toBeNull();
    expect(s.level).toBe(0);
  });

  it('widens above 92% and resets the window', () => {
    const { s, last } = feed(initialScope(), Array(10).fill(true));
    expect(last).toBe('widen');
    expect(s.level).toBe(1);
    expect(s.recent).toEqual([]);
  });

  it('narrows below 75%', () => {
    const answers = [true, false, false, true, false, true, false, true, false, true];
    const { s, last } = feed(initialScope(2), answers);
    expect(last).toBe('narrow');
    expect(s.level).toBe(1);
  });

  it('holds steady inside the band', () => {
    const answers = [true, true, true, true, false, true, true, true, true, false, true, true];
    const { s, last } = feed(initialScope(1), answers);
    expect(last).toBeNull();
    expect(s.level).toBe(1);
  });

  it('respects the level bounds', () => {
    expect(feed(initialScope(3), Array(12).fill(true)).s.level).toBe(3);
    expect(feed(initialScope(0), Array(12).fill(false)).s.level).toBe(0);
  });

  it('keeps only the most recent window of answers', () => {
    const s = feed(initialScope(0), Array(30).fill(false)).s;
    expect(s.recent).toHaveLength(20);
  });
});
