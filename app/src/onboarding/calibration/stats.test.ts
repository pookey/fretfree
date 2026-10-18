import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import { foreperiod, latencyBaseline, median, nextDot, quantile, trimOutliers } from './stats';

const CFG = ENGINE_CONFIG.calibration;

describe('median', () => {
  it('takes the middle value, or the mean of the middle two, without sorting the input', () => {
    const odd = [500, 300, 400];
    expect(median(odd)).toBe(400);
    expect(odd).toEqual([500, 300, 400]);
    expect(median([400, 300, 600, 500])).toBe(450);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });
});

describe('quantile', () => {
  it('interpolates between ranks', () => {
    const s = [100, 200, 300, 400, 500];
    expect(quantile(s, 0)).toBe(100);
    expect(quantile(s, 0.25)).toBe(200);
    expect(quantile(s, 0.5)).toBe(300);
    expect(quantile(s, 1)).toBe(500);
    expect(quantile([100, 200], 0.25)).toBe(125);
  });
});

describe('trimOutliers', () => {
  it('drops anticipations and lapses outside the valid window', () => {
    expect(trimOutliers([90, 149, 150, 600, 2500, 2501, 9000])).toEqual([150, 600, 2500]);
  });

  it('drops taps beyond the Tukey fences and keeps the order', () => {
    const run = [520, 480, 1900, 500, 510, 490, 530, 470];
    expect(trimOutliers(run)).toEqual([520, 480, 500, 510, 490, 530, 470]);
  });

  it('keeps everything when the taps are tight', () => {
    const run = [500, 510, 490, 505, 495];
    expect(trimOutliers(run)).toEqual(run);
  });

  it('skips the fences with fewer than four valid taps', () => {
    expect(trimOutliers([300, 1200, 400])).toEqual([300, 1200, 400]);
  });

  it('honours a custom fence width', () => {
    const run = [500, 500, 510, 520, 700];
    expect(trimOutliers(run, { ...CFG, outlierIqr: 1.5 })).toEqual([500, 500, 510, 520]);
    expect(trimOutliers(run, { ...CFG, outlierIqr: 20 })).toEqual(run);
  });
});

describe('latencyBaseline', () => {
  const steady = [900, 800, 600, 640, 620, 580, 610, 630, 590, 650, 600, 620, 610, 640, 600, 630];

  it('is the rounded median of the counted taps, after the warm-up', () => {
    const result = latencyBaseline(steady);
    expect(result.kept).toEqual(steady.slice(CFG.warmupTrials));
    expect(result.baselineMs).toBe(615);
  });

  it('ignores slow warm-up taps, lapses and anticipations', () => {
    const noisy = [3000, 2000, 600, 610, 90, 620, 4000, 600, 1800, 610, 620, 600, 610, 620];
    const result = latencyBaseline(noisy);
    expect(result.kept).not.toContain(90);
    expect(result.kept).not.toContain(1800);
    expect(result.baselineMs).toBe(610);
  });

  it('rounds to whole milliseconds', () => {
    const cfg = { ...CFG, warmupTrials: 0, minSamples: 2 };
    expect(latencyBaseline([600, 601], cfg).baselineMs).toBe(601);
  });

  it('gives no baseline when too few taps are usable', () => {
    const short = steady.slice(0, CFG.warmupTrials + CFG.minSamples - 1);
    expect(latencyBaseline(short).baselineMs).toBeNull();
    expect(latencyBaseline([]).baselineMs).toBeNull();
    const ok = steady.slice(0, CFG.warmupTrials + CFG.minSamples);
    expect(latencyBaseline(ok).baselineMs).not.toBeNull();
  });
});

describe('foreperiod', () => {
  it('spans the configured pause, in whole milliseconds', () => {
    expect(foreperiod(() => 0)).toBe(CFG.foreperiodMs.min);
    expect(foreperiod(() => 0.999999)).toBe(CFG.foreperiodMs.max);
    expect(foreperiod(() => 0.5, { foreperiodMs: { min: 100, max: 201 } })).toBe(151);
  });
});

describe('nextDot', () => {
  const strings = [1, 2, 3, 4, 5, 6];
  const range = { from: 0, to: 7 };

  it('picks any cell in the window from the rng', () => {
    expect(nextDot(null, strings, range, () => 0)).toEqual({ string: 1, fret: 0 });
    expect(nextDot(null, strings, range, () => 0.9999)).toEqual({ string: 6, fret: 7 });
    expect(nextDot(null, strings, { from: 3, to: 4 }, () => 0.5)).toEqual({ string: 4, fret: 3 });
  });

  it('never lights the same cell twice in a row', () => {
    const prev = { string: 1, fret: 0 };
    expect(nextDot(prev, strings, range, () => 0)).toEqual({ string: 1, fret: 1 });
    expect(nextDot({ string: 2, fret: 2 }, [2], { from: 2, to: 3 }, () => 0)).toEqual({
      string: 2,
      fret: 3,
    });
  });

  it('stays in range for rng() at its upper bound', () => {
    expect(nextDot(null, [1], { from: 0, to: 1 }, () => 1)).toEqual({ string: 1, fret: 1 });
  });
});
