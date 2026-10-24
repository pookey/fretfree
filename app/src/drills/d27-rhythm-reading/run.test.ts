import { describe, expect, it } from 'vitest';
import { createFakeMetronome, type FakeMetronome } from '../../timing/fake-metronome';
import type { Compensation } from '../../timing/latency';
import { METER_PRESETS } from '../../timing/meter';
import { createFakeOnsetSource, OnsetSourceError, type FakeOnsetSource } from '../../timing/onsets';
import { hearOptions, repFade, runReading, type ReadingRunOptions } from './run';

const flush = () => new Promise((r) => setTimeout(r, 0));

// 120 BPM: a pulse is 500 ms. The fake starts the count-in at 1000 ms, so pulse 0 is at 3000.
const OPTIONS: ReadingRunOptions = {
  meter: METER_PRESETS['4/4'],
  bpm: 120,
  subdivide: 4,
  countInBars: 1,
  bars: 1,
  pulses: [0, 0.75, 1, 3],
  alsoPulses: [0, 0.5, 1, 3],
  subdivided: false,
};

function setup(
  options: Partial<ReadingRunOptions> = {},
  compensation: () => Compensation = () => ({ outputMs: 0, calibrationMs: 0 }),
) {
  const metronome: FakeMetronome = createFakeMetronome();
  const source: FakeOnsetSource = createFakeOnsetSource('tap');
  const run = runReading({ metronome, source, compensation }, { ...OPTIONS, ...options });
  return { metronome, source, run };
}

describe('runReading', () => {
  it('starts the input, then the click on the bar’s grid, and hands back both sets of targets', async () => {
    let calibrationMs = 20;
    const { metronome, source, run } = setup({}, () => ({ outputMs: 10, calibrationMs }));
    await flush();
    expect(source.state).toBe('running');
    expect(metronome.layout).toMatchObject({ subdivide: 4, countInBars: 1 });

    expect(metronome.tickUntil(0)).toHaveLength(16);
    source.emit(3030);
    metronome.tickUntil(2);
    // A recalibration mid-run counts from the next onset.
    calibrationMs = 0;
    source.emit(3385);
    metronome.tickUntil(4);
    expect(await Promise.race([run.done.then(() => 'done'), flush().then(() => 'pending')])).toBe(
      'pending',
    );
    // The click after the bar ends the run.
    metronome.tick();
    await expect(run.done).resolves.toEqual({
      targetsMs: [3000, 3375, 3500, 4500],
      alsoMs: [3000, 3250, 3500, 4500],
      onsetsMs: [3000, 3375],
    });
    expect(metronome.running).toBe(false);
    expect(source.state).toBe('idle');
  });

  it('sounds the beats, the steps between only when subdivided, and nothing past the bar', async () => {
    const plain = setup();
    await flush();
    const clicks = plain.metronome.tickUntil(4);
    expect(clicks.filter((c) => c.accent === 'sub').every((c) => !c.audible)).toBe(true);
    expect(clicks.filter((c) => c.accent !== 'sub').every((c) => c.audible)).toBe(true);
    expect(plain.metronome.tick()).toMatchObject({ pulse: 4, audible: false });

    const sub = setup({ subdivided: true });
    await flush();
    expect(sub.metronome.tickUntil(4).every((c) => c.audible)).toBe(true);
    expect(repFade(4, true)({ pulse: 4, accent: 'bar' })).toBe(false);
  });

  it('waits past the bar for a late onset of the last note', async () => {
    const { metronome, run } = setup(
      { pulses: [0, 3.75], alsoPulses: undefined, settleMs: 200 },
      () => ({
        outputMs: 200,
        calibrationMs: 0,
      }),
    );
    await flush();
    // The last note is due at 4875; its window closes at 5275.
    metronome.tickUntil(4.5);
    // 4.5 sounds at 5250, before the window closes; 4.75 (5375) is after it.
    expect(metronome.tick()).toMatchObject({ pulse: 4.5 });
    expect(metronome.running).toBe(true);
    expect(metronome.tick()).toMatchObject({ pulse: 4.75 });
    await expect(run.done).resolves.toMatchObject({ targetsMs: [3000, 4875], alsoMs: [] });
  });

  it('gives back nothing when cancelled, or when another run takes the click', async () => {
    const cancelled = setup();
    await flush();
    cancelled.metronome.tickUntil(1);
    cancelled.run.cancel();
    await expect(cancelled.run.done).resolves.toBeNull();
    expect(cancelled.source.state).toBe('idle');

    const taken = setup();
    await flush();
    taken.metronome.stop();
    await expect(taken.run.done).resolves.toBeNull();
  });

  it('gives back nothing when audio stays locked, or the input is lost mid-run', async () => {
    const metronome = createFakeMetronome();
    metronome.refuseNextStart();
    const source = createFakeOnsetSource('tap');
    const refused = runReading(
      { metronome, source, compensation: () => ({ outputMs: 0, calibrationMs: 0 }) },
      OPTIONS,
    );
    await expect(refused.done).resolves.toBeNull();

    const lost = setup();
    await flush();
    lost.source.loseInput();
    await expect(lost.run.done).resolves.toBeNull();
  });

  it('rejects when the input won’t start', async () => {
    const metronome = createFakeMetronome();
    const source = createFakeOnsetSource('mic');
    source.failNextStart('denied');
    const run = runReading(
      { metronome, source, compensation: () => ({ outputMs: 0, calibrationMs: 0 }) },
      OPTIONS,
    );
    await expect(run.done).rejects.toBeInstanceOf(OnsetSourceError);
    expect(metronome.startCalls).toBe(0);
  });

  it('cancelled before the input starts, never starts the click', async () => {
    const { metronome, run } = setup();
    run.cancel();
    await flush();
    await expect(run.done).resolves.toBeNull();
    expect(metronome.startCalls).toBe(0);
  });
});

describe('hearOptions', () => {
  it('counts in on the beats, then clicks each note and nothing between', () => {
    const o = hearOptions(METER_PRESETS['4/4'], 90, 4, [0, 3, 4, 7]);
    expect(o).toMatchObject({ bpm: 90, subdivide: 4, countInBars: 1 });
    const fade = o.fade as (c: { pulse: number; countIn: boolean }) => boolean;
    expect(fade({ pulse: -4, countIn: true })).toBe(true);
    expect(fade({ pulse: -3.75, countIn: true })).toBe(false);
    expect(fade({ pulse: 0, countIn: false })).toBe(true);
    expect(fade({ pulse: 0.5, countIn: false })).toBe(false);
    expect(fade({ pulse: 0.75, countIn: false })).toBe(true);
    expect(fade({ pulse: 1.75, countIn: false })).toBe(true);
  });
});
