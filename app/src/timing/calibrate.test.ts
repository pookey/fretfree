import { describe, expect, it, vi } from 'vitest';
import { runCalibration, type CalibrationProgress } from './calibrate';
import { createFakeMetronome } from './fake-metronome';
import type { CalibrationConfig } from './latency';
import { createFakeOnsetSource } from './onsets';

const cfg: CalibrationConfig = {
  bpm: 100,
  clicks: 12,
  warmupClicks: 2,
  matchMs: 200,
  outlierIqr: 1.5,
  minSamples: 8,
  maxSpreadMs: 60,
};

function setup() {
  const metronome = createFakeMetronome({ startMs: 5000 });
  const source = createFakeOnsetSource('tap');
  return { metronome, source };
}

/** Lets the run's start (source, then metronome) settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('runCalibration', () => {
  it('counts in, has the learner tap along, and measures their offset past output latency', async () => {
    const { metronome, source } = setup();
    const run = runCalibration({ metronome, source, outputLatencyMs: () => 20 }, cfg);
    const seen: CalibrationProgress[] = [];
    run.onProgress((p) => seen.push(p));
    await settle();
    expect(source.state).toBe('running');
    expect(metronome.layout).toMatchObject({ countInBars: 1 });
    expect(metronome.tempo[0]!.bpm).toBe(100);
    const jitter = [3, -2, 4, -4, 1, 0, -1, 2, -3, 2, 1, -2];
    let n = 0;
    while (metronome.running) {
      const click = metronome.tick()!;
      if (click.pulse >= cfg.clicks) {
        // The click that ends the run isn't heard.
        expect(click.audible).toBe(false);
        break;
      }
      // Heard 20ms late (output latency); the learner adds 30ms of their own.
      source.emit(click.at + 20 + 30 + (click.countIn ? 100 : jitter[n++]!));
    }
    const result = await run.done;
    expect(result).toMatchObject({ ok: true, samples: 10 });
    // The median of the jitter is 0.5ms.
    expect(result?.ok && result.offsetMs).toBe(31);
    expect(metronome.running).toBe(false);
    expect(source.state).toBe('idle');
    expect(seen.at(-1)).toEqual({ clicks: 12, total: 12, onsets: 16 });
  });

  it('reports a run with too few taps', async () => {
    const { metronome, source } = setup();
    const run = runCalibration({ metronome, source, outputLatencyMs: () => 0 }, cfg);
    await settle();
    metronome.tickUntil(cfg.clicks + 1);
    expect(await run.done).toMatchObject({ ok: false, reason: 'too-few' });
  });

  it('resolves null when cancelled, or when something else takes the metronome', async () => {
    const first = setup();
    const cancelled = runCalibration({ ...first, outputLatencyMs: () => 0 }, cfg);
    await settle();
    cancelled.cancel();
    cancelled.cancel();
    expect(await cancelled.done).toBeNull();
    expect(first.metronome.running).toBe(false);

    const second = setup();
    const interrupted = runCalibration({ ...second, outputLatencyMs: () => 0 }, cfg);
    await settle();
    second.metronome.stop();
    expect(await interrupted.done).toBeNull();
    expect(second.source.state).toBe('idle');
  });

  it('is not ended by a metronome run it replaces', async () => {
    const { metronome, source } = setup();
    await metronome.start({ meter: { groups: [4], unit: 4 }, bpm: 60 });
    const run = runCalibration({ metronome, source, outputLatencyMs: () => 0 }, cfg);
    await settle();
    expect(metronome.tempo[0]!.bpm).toBe(100);
    run.cancel();
    expect(await run.done).toBeNull();
  });

  it('resolves null when audio stays locked, or the input is lost', async () => {
    const locked = setup();
    locked.metronome.refuseNextStart();
    const run = runCalibration({ ...locked, outputLatencyMs: () => 0 }, cfg);
    expect(await run.done).toBeNull();
    expect(locked.source.state).toBe('idle');

    const lost = setup();
    const lostRun = runCalibration({ ...lost, outputLatencyMs: () => 0 }, cfg);
    await settle();
    lost.source.loseInput();
    expect(await lostRun.done).toBeNull();
  });

  it('rejects with the input error when it cannot start, before any click', async () => {
    const { metronome, source } = setup();
    source.failNextStart('denied');
    const run = runCalibration({ metronome, source, outputLatencyMs: () => 0 }, cfg);
    await expect(run.done).rejects.toMatchObject({ reason: 'denied' });
    expect(metronome.startCalls).toBe(0);
  });

  it('starts nothing more once cancelled while the input starts', async () => {
    const { metronome, source } = setup();
    const run = runCalibration({ metronome, source, outputLatencyMs: () => 0 }, cfg);
    run.cancel();
    await settle();
    expect(metronome.startCalls).toBe(0);
    expect(await run.done).toBeNull();
    const failing = setup();
    failing.source.failNextStart('failed');
    const late = runCalibration({ ...failing, outputLatencyMs: () => 0 }, cfg);
    late.cancel();
    expect(await late.done).toBeNull();
  });

  it('uses the configured run by default', async () => {
    const { metronome, source } = setup();
    const unsubscribe = vi.fn();
    const run = runCalibration({ metronome, source, outputLatencyMs: () => 0 });
    run.onProgress(unsubscribe)();
    await settle();
    expect(metronome.tickUntil(0)).toHaveLength(4);
    run.cancel();
  });
});
