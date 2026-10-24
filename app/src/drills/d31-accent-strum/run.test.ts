import { describe, expect, it, vi } from 'vitest';
import { fadeLadder } from '../../timing/fade';
import { createFakeMetronome, type FakeMetronome } from '../../timing/fake-metronome';
import type { Compensation } from '../../timing/latency';
import { METER_PRESETS } from '../../timing/meter';
import { createFakeOnsetSource, OnsetSourceError, type FakeOnsetSource } from '../../timing/onsets';
import { runAccents, type AccentRunOptions } from './run';

const flush = () => new Promise((r) => setTimeout(r, 0));

const METER = METER_PRESETS['4/4'];
// [all, beat 1, every 2nd bar, every 4th bar, none]
const LADDER = fadeLadder(METER, 1);

// 120 BPM: a pulse is 500 ms. The fake starts the count-in at 1000 ms, so pulse 0 is at 3000.
const OPTIONS: AccentRunOptions = {
  meter: METER,
  stepsPerPulse: 1,
  bpm: 120,
  countInBars: 1,
  bars: 4,
  pulses: Array.from({ length: 16 }, (_, i) => i),
  ladder: LADDER,
  startRung: 0,
  rateBar: () => 1,
};

function setup(
  options: Partial<AccentRunOptions> = {},
  compensation: () => Compensation = () => ({ outputMs: 0, calibrationMs: 0 }),
) {
  const metronome: FakeMetronome = createFakeMetronome();
  const source: FakeOnsetSource = createFakeOnsetSource('tap');
  const run = runAccents({ metronome, source, compensation }, { ...OPTIONS, ...options });
  return { metronome, source, run };
}

/** Ticks until the run ends, playing each stroke on time; returns every click. */
function playAll(metronome: FakeMetronome, source: FakeOnsetSource, strength = 1) {
  const clicks = [];
  while (metronome.running) {
    const c = metronome.tick()!;
    clicks.push(c);
    if (!c.countIn && c.pulse < 16) source.emit(c.at + 10, strength);
  }
  return clicks;
}

describe('runAccents', () => {
  it('counts in, then hands back targets, onsets with strengths and each bar’s rung', async () => {
    const onBar = vi.fn<NonNullable<AccentRunOptions['onBar']>>();
    const { metronome, source, run } = setup({ settleMs: 200, onBar });
    await flush();
    expect(source.state).toBe('running');
    expect(metronome.layout).toMatchObject({ subdivide: 1, countInBars: 1 });
    const clicks = playAll(metronome, source, 0.5);
    const take = (await run.done)!;
    expect(take.targetsMs).toEqual(OPTIONS.pulses.map((p) => 3000 + p * 500));
    expect(take.onsets[0]).toEqual({ at: 3010, strength: 0.5 });
    expect(take.onsets).toHaveLength(16);
    // Bar 0 is scored on bar 1's first beat, which already had its rung: the
    // step lands on bar 2, the next bar not started. The click changes on a downbeat.
    expect(take.rungs).toEqual([0, 0, 1, 2]);
    expect(onBar.mock.calls.slice(0, 4)).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 2],
    ]);
    // The count-in always sounds; bar 2 keeps only its downbeat; bar 3 none (every 2nd bar: bar 2 only).
    expect(clicks.filter((c) => c.countIn).every((c) => c.audible)).toBe(true);
    const audible = (bar: number) => clicks.filter((c) => c.bar === bar && c.audible).length;
    expect([0, 1, 2, 3].map(audible)).toEqual([4, 4, 1, 0]);
    // Nothing past the bars sounds.
    expect(clicks.filter((c) => c.pulse >= 16).every((c) => !c.audible)).toBe(true);
    expect(metronome.running).toBe(false);
    expect(source.state).toBe('idle');
  });

  it('steps the next bar at once when a bar is scored before it starts', async () => {
    const { metronome, source, run } = setup();
    await flush();
    playAll(metronome, source);
    expect((await run.done)!.rungs).toEqual([0, 1, 2, 3]);
  });

  it('brings the click back when the strokes slip, and never past the ladder’s ends', async () => {
    const down = setup({ startRung: 2, rateBar: () => 0 });
    await flush();
    playAll(down.metronome, down.source);
    expect((await down.run.done)!.rungs).toEqual([2, 1, 0, 0]);
    const up = setup({ startRung: 9 });
    await flush();
    playAll(up.metronome, up.source);
    expect((await up.run.done)!.rungs).toEqual([4, 4, 4, 4]);
  });

  it('scores each bar from its own targets and the onsets so far', async () => {
    const rateBar = vi.fn<AccentRunOptions['rateBar']>(() => 0.8);
    const { metronome, source, run } = setup({ rateBar });
    await flush();
    playAll(metronome, source);
    await run.done;
    // The last bar's score could change nothing.
    expect(rateBar).toHaveBeenCalledTimes(3);
    expect(rateBar.mock.calls[1]![0]).toBe(1);
    expect(rateBar.mock.calls[1]![1]).toEqual([5000, 5500, 6000, 6500]);
    expect(rateBar.mock.calls[1]![2].length).toBeGreaterThanOrEqual(8);
  });

  it('waits for the last stroke’s onset past the latency before it ends', async () => {
    const { metronome, source, run } = setup({ settleMs: 150 }, () => ({
      outputMs: 300,
      calibrationMs: 200,
    }));
    await flush();
    metronome.tickUntil(17);
    // The last stroke (pulse 15, 10 500 ms) is due by 11 150: pulse 17 is at 11 500.
    expect(await Promise.race([run.done.then(() => 'done'), flush().then(() => 'pending')])).toBe(
      'pending',
    );
    metronome.tick();
    await expect(run.done).resolves.not.toBeNull();
    void source;
  });

  it('hands back nothing when cancelled, stopped, refused or the input is lost', async () => {
    const cancelled = setup();
    await flush();
    cancelled.metronome.tickUntil(2);
    cancelled.run.cancel();
    await expect(cancelled.run.done).resolves.toBeNull();
    expect(cancelled.metronome.running).toBe(false);

    const stopped = setup();
    await flush();
    stopped.metronome.stop();
    await expect(stopped.run.done).resolves.toBeNull();

    const metronome = createFakeMetronome();
    metronome.refuseNextStart();
    const refused = runAccents(
      {
        metronome,
        source: createFakeOnsetSource('tap'),
        compensation: () => ({ outputMs: 0, calibrationMs: 0 }),
      },
      OPTIONS,
    );
    await expect(refused.done).resolves.toBeNull();

    const lost = setup();
    await flush();
    lost.source.loseInput();
    await expect(lost.run.done).resolves.toBeNull();
    expect(lost.metronome.running).toBe(false);
  });

  it('rejects when the input won’t start, and starts no click', async () => {
    const metronome = createFakeMetronome();
    const source = createFakeOnsetSource('mic');
    source.failNextStart('denied');
    const run = runAccents(
      { metronome, source, compensation: () => ({ outputMs: 0, calibrationMs: 0 }) },
      OPTIONS,
    );
    await expect(run.done).rejects.toBeInstanceOf(OnsetSourceError);
    expect(metronome.startCalls).toBe(0);
  });

  it('starts no click when cancelled while the input is starting', async () => {
    const { metronome, run } = setup();
    run.cancel();
    await flush();
    await expect(run.done).resolves.toBeNull();
    expect(metronome.startCalls).toBe(0);
  });
});
