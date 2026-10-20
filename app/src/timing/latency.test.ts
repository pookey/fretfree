import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../engine/config';
import {
  compensate,
  compensation,
  outputLatencyMs,
  summariseCalibration,
  type CalibrationConfig,
} from './latency';

describe('output latency', () => {
  it('adds output and base latency, in ms', () => {
    expect(outputLatencyMs({ outputLatency: 0.02, baseLatency: 0.005 })).toBeCloseTo(25, 9);
  });

  it('counts what the browser does not report as zero', () => {
    expect(outputLatencyMs({})).toBe(0);
    expect(outputLatencyMs({ baseLatency: 0.01 })).toBeCloseTo(10, 9);
    expect(outputLatencyMs({ outputLatency: Number.NaN })).toBe(0);
  });
});

describe('compensation', () => {
  it('takes output latency and the input calibration off each onset', () => {
    const c = compensation('tap', { tap: 30, mic: 80 }, { outputLatency: 0.02 });
    expect(c).toEqual({ outputMs: 20, calibrationMs: 30 });
    expect(compensate(1050, c)).toBe(1000);
    expect(compensation('mic', { tap: 30, mic: 80 }, {}).calibrationMs).toBe(80);
  });

  it('uses no calibration for an input not yet calibrated', () => {
    expect(compensation('mic', { tap: 30, mic: null }, {})).toEqual({ outputMs: 0, calibrationMs: 0 });
  });
});

describe('summariseCalibration', () => {
  const cfg: CalibrationConfig = {
    bpm: 100,
    clicks: 16,
    warmupClicks: 2,
    matchMs: 200,
    outlierIqr: 1.5,
    minSamples: 8,
    maxSpreadMs: 60,
  };
  const clicks = Array.from({ length: 16 }, (_, i) => 1000 + i * 600);
  const jitter = [4, -3, 6, -5, 2, 0, -2, 5, -4, 3, 1, -1, 2, -6, 4, 0];

  it('is the median offset of the steady taps, skipping the warm-up', () => {
    const taps = clicks.map((c, i) => c + 40 + jitter[i]!);
    taps[0] = clicks[0]! + 190; // The first taps settle in; they don't count.
    const result = summariseCalibration(clicks, taps, cfg);
    expect(result).toMatchObject({ ok: true, offsetMs: 41, samples: 14 });
    expect(result.ok && result.spreadMs).toBeLessThan(10);
  });

  it('trims an outlying tap', () => {
    const taps = clicks.map((c, i) => c - 20 + jitter[i]!);
    taps[9] = clicks[9]! + 180;
    const result = summariseCalibration(clicks, taps, cfg);
    expect(result).toMatchObject({ ok: true, samples: 13 });
    expect(result.ok && result.offsetMs).toBeCloseTo(-19, -1);
  });

  it('needs enough taps near the clicks', () => {
    const taps = clicks.slice(0, 8).map((c) => c + 10);
    expect(summariseCalibration(clicks, taps, cfg)).toEqual({
      ok: false,
      reason: 'too-few',
      samples: 6,
      spreadMs: null,
    });
  });

  it('refuses taps too uneven to trust', () => {
    const taps = clicks.map((c, i) => c + (i % 2 ? 90 : -90) + jitter[i]!);
    expect(summariseCalibration(clicks, taps, cfg)).toMatchObject({ ok: false, reason: 'uneven' });
  });

  it('reports too few when trimming leaves too few', () => {
    const few = { ...cfg, minSamples: 13 };
    const taps = clicks.map((c, i) => c + jitter[i]!);
    taps[5] = clicks[5]! + 150;
    taps[7] = clicks[7]! - 150;
    expect(summariseCalibration(clicks, taps, few)).toMatchObject({ ok: false, reason: 'too-few' });
  });

  it('fits about 10 seconds at the configured tempo', () => {
    const { bpm, clicks: n } = ENGINE_CONFIG.timing.calibration;
    expect((n * 60) / bpm).toBeGreaterThanOrEqual(8);
    expect((n * 60) / bpm).toBeLessThanOrEqual(12);
    expect(summariseCalibration(clicks, clicks).ok).toBe(true);
  });
});
