import { describe, expect, it, vi } from 'vitest';
import type { AudioClock } from './clock';
import {
  OnsetSourceError,
  createFakeOnsetSource,
  createOnsetSource,
  createTapOnsetSource,
  withLatency,
  type Onset,
  type OnsetDriver,
} from './onsets';

/** A clock that maps page ms to audio ms by a fixed offset. */
function fixedClock(offset: number) {
  return {
    start: vi.fn<() => void>(),
    stop: vi.fn<() => void>(),
    sample: vi.fn<() => void>(),
    toContextMs: (page: number) => page + offset,
  } satisfies AudioClock;
}

describe('createOnsetSource', () => {
  it('runs a driver and hands on its onsets while running', async () => {
    const fake = createFakeOnsetSource('mic');
    const seen: Onset[] = [];
    const states: string[] = [];
    fake.onOnset((o) => seen.push(o));
    fake.onStateChange((s) => states.push(s));
    fake.emit(1); // Not running: not heard.
    await fake.start();
    await fake.start();
    expect(fake.startCalls).toBe(1);
    fake.emit(100, 0.4);
    fake.stop();
    fake.stop();
    fake.emit(200);
    expect(seen).toEqual([{ at: 100, kind: 'mic', strength: 0.4 }]);
    expect(states).toEqual(['starting', 'running', 'idle']);
    expect(fake.kind).toBe('mic');
  });

  it('enters error when start fails, and can retry', async () => {
    const fake = createFakeOnsetSource();
    fake.failNextStart('denied');
    await expect(fake.start()).rejects.toMatchObject({ reason: 'denied' });
    expect(fake.state).toBe('error');
    expect(fake.error?.reason).toBe('denied');
    fake.stop(); // A stop in error changes nothing.
    await fake.start();
    expect(fake.state).toBe('running');
    expect(fake.error).toBeNull();
  });

  it('enters error with lost when a running input goes away', async () => {
    const fake = createFakeOnsetSource();
    await fake.start();
    fake.loseInput();
    expect(fake.state).toBe('error');
    expect(fake.error).toBeInstanceOf(OnsetSourceError);
    expect(fake.error?.reason).toBe('lost');
    fake.loseInput();
    expect(fake.state).toBe('error');
  });

  it('a stop while starting wins, and releases the driver once it starts', async () => {
    let resolve!: () => void;
    const driver: OnsetDriver = {
      start: vi.fn(() => new Promise<void>((r) => (resolve = r))),
      stop: vi.fn(),
    };
    const source = createOnsetSource('tap', driver);
    const started = source.start();
    expect(source.start()).toBe(started);
    source.stop();
    expect(source.state).toBe('idle');
    expect(driver.stop).not.toHaveBeenCalled();
    resolve();
    await started;
    expect(driver.stop).toHaveBeenCalledTimes(1);
    expect(source.state).toBe('idle');
  });

  it('ignores a cancelled start that fails', async () => {
    let reject!: (e: unknown) => void;
    const source = createOnsetSource('tap', {
      start: () => new Promise<void>((_, r) => (reject = r)),
      stop: vi.fn(),
    });
    const started = source.start();
    source.stop();
    reject(new Error('late'));
    await expect(started).resolves.toBeUndefined();
    expect(source.state).toBe('idle');
  });

  it('wraps a driver that throws, or rejects with something else', async () => {
    const throws = createOnsetSource('mic', {
      start: () => {
        throw new Error('boom');
      },
      stop: vi.fn(),
    });
    await expect(throws.start()).rejects.toMatchObject({ reason: 'failed', message: 'boom' });
    const odd = createOnsetSource('mic', { start: () => Promise.reject('nope'), stop: vi.fn() });
    await expect(odd.start()).rejects.toMatchObject({ reason: 'failed', message: 'nope' });
  });
});

describe('withLatency', () => {
  it('takes the compensation off each onset, read at the time', async () => {
    const fake = createFakeOnsetSource();
    await fake.start();
    let calibrationMs = 30;
    const seen: unknown[] = [];
    const stop = withLatency(
      fake,
      () => ({ outputMs: 20, calibrationMs }),
      (o) => seen.push(o),
    );
    fake.emit(1000);
    calibrationMs = 0;
    fake.emit(2000);
    stop();
    fake.emit(3000);
    expect(seen).toEqual([
      { at: 950, rawAt: 1000, kind: 'tap', strength: 1 },
      { at: 1980, rawAt: 2000, kind: 'tap', strength: 1 },
    ]);
  });
});

describe('createTapOnsetSource', () => {
  const press = (type: string, timeStamp: number, extra: object = {}) => ({
    type,
    timeStamp,
    ...extra,
  });

  it('maps pointer presses and tap keys onto the audio clock while running', async () => {
    const clock = fixedClock(5000);
    const taps = createTapOnsetSource(clock);
    const seen: number[] = [];
    taps.onOnset((o) => seen.push(o.at));
    taps.handle(press('pointerdown', 1));
    await taps.start();
    expect(clock.start).toHaveBeenCalled();
    taps.handle(press('pointerdown', 10));
    taps.handle(press('pointerdown', 11, { button: 2 }));
    taps.handle(press('pointerup', 12));
    taps.handle(press('keydown', 20, { key: ' ' }));
    taps.handle(press('keydown', 21, { key: ' ', repeat: true }));
    taps.handle(press('keydown', 22, { key: 'a' }));
    taps.handle(press('keydown', 23));
    taps.handle(press('keydown', 30, { key: 'Enter' }));
    taps.stop();
    expect(clock.stop).toHaveBeenCalled();
    taps.handle(press('pointerdown', 40));
    expect(seen).toEqual([5010, 5020, 5030]);
  });

  it('skips a tap the clock cannot place yet', async () => {
    const taps = createTapOnsetSource({ ...fixedClock(0), toContextMs: () => null });
    const seen = vi.fn();
    taps.onOnset(seen);
    await taps.start();
    taps.handle(press('pointerdown', 10));
    expect(seen).not.toHaveBeenCalled();
  });

  it('listens on a target until detached, and keeps tap keys from scrolling', async () => {
    const taps = createTapOnsetSource(fixedClock(0), { keys: ['j'] });
    const seen: number[] = [];
    taps.onOnset((o) => seen.push(o.at));
    const target = new EventTarget();
    const detach = taps.attach(target);
    await taps.start();
    const key = new KeyboardEvent('keydown', { key: 'j', cancelable: true });
    target.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    const other = new KeyboardEvent('keydown', { key: 'k', cancelable: true });
    target.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    target.dispatchEvent(new MouseEvent('pointerdown', { button: 0 }));
    detach();
    target.dispatchEvent(new MouseEvent('pointerdown', { button: 0 }));
    expect(seen).toHaveLength(2);
  });
});
