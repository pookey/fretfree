import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  raw: { currentTime: 3, outputLatency: 0.02, baseLatency: 0.005 },
  start: vi.fn(async () => undefined),
  imported: 0,
}));

vi.mock('tone', () => {
  fake.imported += 1;
  return {
    // Read on every call: Tone can adopt another context (M4-13's gesture context).
    getContext: () => ({ rawContext: fake.raw, state: 'running' }),
    start: fake.start,
    setContext: vi.fn(),
  };
});

beforeEach(() => {
  vi.resetModules();
  fake.raw = { currentTime: 3, outputLatency: 0.02, baseLatency: 0.005 };
  fake.imported = 0;
});

describe('device', () => {
  it('reads no latency and no clock before Tone loads', async () => {
    const device = await import('./device');
    expect(device.currentOutputLatencyMs()).toBe(0);
    expect(device.createToneClock().toContextMs(10)).toBeNull();
    expect(device.liveCompensation('tap', { tap: 12, mic: null })).toEqual({
      outputMs: 0,
      calibrationMs: 12,
    });
  });

  it('maps taps onto Tone’s clock and takes its output latency off, once loaded', async () => {
    const audio = await import('../audio/audio');
    const device = await import('./device');
    await audio.loadTone();
    const clock = device.createToneClock();
    clock.start();
    expect(device.currentOutputLatencyMs()).toBeCloseTo(25, 9);
    const page = performance.now();
    expect(clock.toContextMs(page)).toBeGreaterThan(3000 - 1);
    clock.stop();
    expect(device.liveCompensation('mic', { tap: null, mic: 40 })).toEqual({
      outputMs: expect.closeTo(25, 9) as number,
      calibrationMs: 40,
    });
    const taps = device.createToneTapSource();
    await taps.start();
    expect(taps.kind).toBe('tap');
    taps.stop();
  });

  it('reads the output latency whoever loaded Tone, with no tap clock started', async () => {
    // The metronome, the mic and the guitar all load Tone through audio.ts.
    const audio = await import('../audio/audio');
    const device = await import('./device');
    await audio.loadTone();
    expect(device.currentOutputLatencyMs()).toBeCloseTo(25, 9);
    expect(device.liveCompensation('mic', { tap: null, mic: 40 }).outputMs).toBeCloseTo(25, 9);
  });

  it('reads the latency the moment Tone loads, before any timer or microtask runs', async () => {
    const audio = await import('../audio/audio');
    const device = await import('./device');
    const loaded = audio.loadTone();
    expect(device.currentOutputLatencyMs()).toBe(0);
    await loaded;
    expect(device.currentOutputLatencyMs()).toBeCloseTo(25, 9);
  });

  it('follows the context Tone uses now, not the one it had', async () => {
    const audio = await import('../audio/audio');
    const device = await import('./device');
    await audio.loadTone();
    const clock = device.createToneClock();
    expect(clock.toContextMs(performance.now())).toBeGreaterThan(3000 - 1);
    fake.raw = { currentTime: 0.5, outputLatency: 0.04, baseLatency: 0 };
    expect(device.currentOutputLatencyMs()).toBeCloseTo(40, 9);
    expect(device.createToneClock().toContextMs(performance.now())).toBeLessThan(600);
  });

  it('never loads Tone itself: a tap source just waits for it', async () => {
    const device = await import('./device');
    const taps = device.createToneTapSource();
    await taps.start();
    expect(device.currentOutputLatencyMs()).toBe(0);
    taps.stop();
    expect(fake.imported).toBe(0);
  });

  it('starts the mic on Tone’s context by default, unlocking audio first', async () => {
    const { createMicOnsetSource } = await import('./mic-onsets');
    const getUserMedia = vi.fn(() =>
      Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })),
    );
    const source = createMicOnsetSource({ mediaDevices: () => ({ getUserMedia }) });
    await expect(source.start()).rejects.toMatchObject({ reason: 'denied' });
    await vi.waitFor(() => expect(fake.start).toHaveBeenCalled());
  });
});
