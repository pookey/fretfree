import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioClock, createClockSync } from './clock';

describe('createClockSync', () => {
  it('has nothing to map before a sample', () => {
    expect(createClockSync().toContextMs(5)).toBeNull();
  });

  it('follows the upper envelope of a stepping audio clock', () => {
    const sync = createClockSync();
    // The audio clock runs 2000ms ahead of the page, in 10ms blocks.
    for (let page = 0; page <= 200; page += 3) {
      const context = Math.floor((page + 2000) / 10) * 10;
      sync.observe(context, page);
    }
    expect(sync.toContextMs(250)).toBeGreaterThan(2250 - 3);
    expect(sync.toContextMs(250)).toBeLessThanOrEqual(2250);
  });

  it('forgets samples older than its window, so it follows drift', () => {
    const sync = createClockSync(100);
    sync.observe(1000, 0);
    sync.observe(1050, 200);
    expect(sync.toContextMs(300)).toBe(1150);
  });
});

describe('createAudioClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('samples both clocks on an interval while started', () => {
    vi.useFakeTimers();
    let page = 0;
    let context: number | null = null;
    const clock = createAudioClock(
      { contextSeconds: () => context, pageMs: () => page },
      { intervalMs: 10 },
    );
    expect(clock.toContextMs(0)).toBeNull();
    context = 5;
    clock.start();
    clock.start();
    page = 10;
    context = 5.01;
    vi.advanceTimersByTime(10);
    expect(clock.toContextMs(12)).toBe(5012);
    clock.stop();
    clock.stop();
    page = 20;
    context = 9;
    vi.advanceTimersByTime(50);
    // Stopped: only the explicit sample in toContextMs is taken.
    expect(clock.toContextMs(20)).toBe(9000);
  });
});
