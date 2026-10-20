import { describe, expect, it } from 'vitest';
import { createFakeMetronome, type FakeMetronome } from '../../timing/fake-metronome';
import type { Compensation } from '../../timing/latency';
import { createFakeOnsetSource, OnsetSourceError, type FakeOnsetSource } from '../../timing/onsets';
import { runRhythm, type RhythmRunOptions } from './run';

const flush = () => new Promise((r) => setTimeout(r, 0));

// 120 BPM: a pulse is 500 ms. The fake starts the count-in at 1000 ms, so pulse 0 is at 3000.
const OPTIONS: RhythmRunOptions = {
  bpm: 120,
  countInBars: 1,
  bars: 1,
  pulses: [0, 1, 1.5, 3],
  subdivided: false,
};

function setup(
  options: Partial<RhythmRunOptions> = {},
  compensation: () => Compensation = () => ({ outputMs: 0, calibrationMs: 0 }),
) {
  const metronome: FakeMetronome = createFakeMetronome();
  const source: FakeOnsetSource = createFakeOnsetSource('tap');
  const run = runRhythm({ metronome, source, compensation }, { ...OPTIONS, ...options });
  return { metronome, source, run };
}

describe('runRhythm', () => {
  it('starts the input, then the click on eighths, and hands back targets and onsets', async () => {
    let calibrationMs = 20;
    const { metronome, source, run } = setup({}, () => ({ outputMs: 10, calibrationMs }));
    await flush();
    expect(source.state).toBe('running');
    expect(metronome.running).toBe(true);
    expect(metronome.layout).toMatchObject({ subdivide: 2, countInBars: 1 });

    const countIn = metronome.tickUntil(0);
    expect(countIn).toHaveLength(8);
    source.emit(2600); // a count-in tap: kept, and ignored by the grade
    source.emit(3030);
    metronome.tickUntil(2);
    // A recalibration mid-run counts from the next onset.
    calibrationMs = 0;
    source.emit(3760);
    metronome.tickUntil(4);
    expect(await Promise.race([run.done.then(() => 'done'), flush().then(() => 'pending')])).toBe(
      'pending',
    );
    // The beat after the rhythm ends the run.
    metronome.tick();
    await expect(run.done).resolves.toEqual({
      targetsMs: [3000, 3500, 3750, 4500],
      onsetsMs: [2570, 3000, 3750],
    });
    expect(metronome.running).toBe(false);
    expect(source.state).toBe('idle');
  });

  it('sounds the "&" only when subdivided, and never past the rhythm', async () => {
    const plain = setup();
    await flush();
    const clicks = plain.metronome.tickUntil(4);
    expect(clicks.filter((c) => c.accent === 'sub').every((c) => !c.audible)).toBe(true);
    expect(clicks.filter((c) => c.accent !== 'sub').every((c) => c.audible)).toBe(true);
    expect(plain.metronome.tick()).toMatchObject({ pulse: 4, audible: false });

    const sub = setup({ subdivided: true });
    await flush();
    expect(sub.metronome.tickUntil(4).every((c) => c.audible)).toBe(true);
  });

  it('runs for every bar', async () => {
    const { metronome, run } = setup({ bars: 2, pulses: [0, 4] });
    await flush();
    metronome.tickUntil(8);
    metronome.tick();
    await expect(run.done).resolves.toEqual({ targetsMs: [3000, 5000], onsetsMs: [] });
  });

  it('resolves null when cancelled, stopping the click and the input', async () => {
    const { metronome, source, run } = setup();
    await flush();
    metronome.tickUntil(1);
    run.cancel();
    await expect(run.done).resolves.toBeNull();
    expect(metronome.running).toBe(false);
    expect(source.state).toBe('idle');
    // Later beats change nothing.
    run.cancel();
  });

  it('resolves null when cancelled before the click starts', async () => {
    const { metronome, run } = setup();
    run.cancel();
    await expect(run.done).resolves.toBeNull();
    await flush();
    expect(metronome.startCalls).toBe(0);
  });

  it('resolves null when audio stays locked', async () => {
    const metronome = createFakeMetronome();
    metronome.refuseNextStart();
    const source = createFakeOnsetSource('tap');
    const run = runRhythm(
      { metronome, source, compensation: () => ({ outputMs: 0, calibrationMs: 0 }) },
      OPTIONS,
    );
    await expect(run.done).resolves.toBeNull();
    expect(source.state).toBe('idle');
  });

  it('resolves null when something else takes the click', async () => {
    const { metronome, run } = setup();
    await flush();
    metronome.stop();
    await expect(run.done).resolves.toBeNull();
  });

  it('resolves null when the input is lost mid-run', async () => {
    const { metronome, source, run } = setup();
    await flush();
    metronome.tickUntil(1);
    source.loseInput();
    await expect(run.done).resolves.toBeNull();
    expect(source.error?.reason).toBe('lost');
    expect(metronome.running).toBe(false);
  });

  it('rejects when the input won’t start', async () => {
    const metronome = createFakeMetronome();
    const source = createFakeOnsetSource('mic');
    source.failNextStart('denied');
    const run = runRhythm(
      { metronome, source, compensation: () => ({ outputMs: 0, calibrationMs: 0 }) },
      OPTIONS,
    );
    await expect(run.done).rejects.toBeInstanceOf(OnsetSourceError);
    expect(metronome.startCalls).toBe(0);
  });
});
