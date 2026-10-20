import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  raw: { currentTime: 3, outputLatency: 0.02, baseLatency: 0.005 },
  start: vi.fn(async () => undefined),
}));

vi.mock('tone', () => ({
  getContext: () => ({ rawContext: fake.raw, state: 'running' }),
  start: fake.start,
}));

beforeEach(() => {
  vi.resetModules();
  fake.raw.currentTime = 3;
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
    const device = await import('./device');
    const clock = device.createToneClock();
    clock.start();
    await vi.waitFor(() => expect(device.currentOutputLatencyMs()).toBeCloseTo(25, 9));
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
