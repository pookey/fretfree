import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeMetronome, type FakeMetronome } from '../../../timing/fake-metronome';
import { METRONOME_CONFIG } from './config';
import { createMetronomeController, type MetronomeController } from './controller';

let metronome: FakeMetronome;
let path: string;
let latency: number;
let controller: MetronomeController;

beforeEach(() => {
  vi.useFakeTimers();
  metronome = createFakeMetronome();
  path = '/tools/metronome';
  latency = 0;
  controller = createMetronomeController({
    metronome,
    outputLatencyMs: () => latency,
    pathname: () => path,
    base: '/',
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as number),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as number),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const state = () => controller.getState();

/** Ticks the next click and lets its beat light show. */
function tick() {
  const click = metronome.tick();
  vi.advanceTimersByTime(latency);
  return click;
}

describe('the metronome tool controller', () => {
  it('starts and stops the shared click with its settings', async () => {
    controller.set({ bpm: 90, meter: '7/8 (2+2+3)', accent: 'beats', countInBars: 2 });
    expect(await controller.start()).toBe(true);
    expect(state().running).toBe(true);
    expect(metronome.layout).toEqual({
      meter: { groups: [2, 2, 3], unit: 8 },
      subdivide: 1,
      countInBars: 2,
    });
    expect(metronome.tempo[0]!.bpm).toBe(90);

    controller.stop();
    expect(metronome.running).toBe(false);
    expect(state()).toMatchObject({ running: false, beat: null });
  });

  it('notifies subscribers', async () => {
    const listener = vi.fn();
    const off = controller.subscribe(listener);
    await controller.start();
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    controller.stop();
    expect(listener).not.toHaveBeenCalled();
  });

  it('toggles', async () => {
    controller.toggle();
    await vi.waitFor(() => expect(metronome.running).toBe(true));
    controller.toggle();
    expect(metronome.running).toBe(false);
  });

  it('reports a start that audio refused', async () => {
    metronome.refuseNextStart();
    expect(await controller.start()).toBe(false);
    expect(state().running).toBe(false);
  });

  it('stops a start still unlocking audio', async () => {
    const pending = controller.start();
    expect(state().running).toBe(true);
    controller.stop();
    expect(await pending).toBe(false);
    expect(state().running).toBe(false);
    expect(metronome.running).toBe(false);
  });

  it('lights each pulse once it is heard, not when it is scheduled', async () => {
    latency = 40;
    controller.set({ countInBars: 1, meter: '3/4' });
    await controller.start();
    metronome.tick();
    expect(state().beat).toBeNull();
    vi.advanceTimersByTime(39);
    expect(state().beat).toBeNull();
    vi.advanceTimersByTime(1);
    expect(state().beat).toMatchObject({ pulse: 0, bar: -1, countIn: true });
    tick();
    tick();
    tick();
    expect(state().beat).toMatchObject({ pulse: 0, bar: 0, countIn: false });
  });

  it('keeps the light on the pulse through its subdivisions', async () => {
    controller.set({ subdivide: 2, countInBars: 0 });
    await controller.start();
    tick();
    tick();
    expect(state().beat).toMatchObject({ pulse: 0 });
    tick();
    expect(state().beat).toMatchObject({ pulse: 1 });
  });

  it('drops a beat light still pending at a stop', async () => {
    latency = 50;
    await controller.start();
    metronome.tick();
    controller.stop();
    vi.advanceTimersByTime(50);
    expect(state().beat).toBeNull();
  });

  it('changes the tempo of a running click in place', async () => {
    controller.set({ countInBars: 0 });
    await controller.start();
    tick();
    controller.set({ bpm: 150 });
    expect(metronome.startCalls).toBe(1);
    expect(metronome.tempo.at(-1)).toMatchObject({ bpm: 150, pulse: 1 });
  });

  it('holds the tempo to its range', () => {
    controller.set({ bpm: 500 });
    expect(state().bpm).toBe(METRONOME_CONFIG.maxBpm);
    controller.set({ bpm: 1 });
    expect(state().bpm).toBe(METRONOME_CONFIG.minBpm);
  });

  it('restarts for a new meter, accent or subdivision, without a second count-in', async () => {
    controller.set({ countInBars: 2 });
    await controller.start();
    controller.set({ meter: '6/8' });
    await vi.waitFor(() => expect(metronome.startCalls).toBe(2));
    expect(metronome.layout).toMatchObject({ meter: { groups: [3, 3] }, countInBars: 0 });
    expect(state().running).toBe(true);

    controller.set({ accent: 'downbeat' });
    await vi.waitFor(() => expect(metronome.startCalls).toBe(3));
    controller.set({ subdivide: 3 });
    await vi.waitFor(() => expect(metronome.startCalls).toBe(4));
    expect(metronome.layout).toMatchObject({ subdivide: 3 });
    // The count-in setting is for the next start.
    controller.set({ countInBars: 1 });
    expect(metronome.startCalls).toBe(4);
  });

  it('keeps felt beats for the next meter that has them', async () => {
    controller.set({ meter: '4/4', countInBars: 0 });
    await controller.start();
    // Felt beats and the downbeat are one grid in 4/4: no restart.
    controller.set({ accent: 'downbeat' });
    controller.set({ accent: 'beats' });
    expect(metronome.startCalls).toBe(1);
    controller.set({ meter: '5/4 (3+2)' });
    await vi.waitFor(() => expect(metronome.startCalls).toBe(2));
    expect(metronome.layout?.meter.groups).toEqual([3, 2]);
  });

  it('sets the tempo from taps', async () => {
    controller.tap(1000);
    expect(state().bpm).toBe(METRONOME_CONFIG.defaultBpm);
    controller.tap(1500);
    expect(state().bpm).toBe(120);
    await controller.start();
    controller.tap(1900);
    controller.tap(2300);
    // Intervals 500, 400, 400.
    expect(state().bpm).toBe(150);
    expect(metronome.tempo.at(-1)!.bpm).toBe(150);
  });

  it('lets go when something else takes the click', async () => {
    await controller.start();
    await metronome.start({ meter: { groups: [4], unit: 4 }, bpm: 60 });
    expect(state().running).toBe(false);
    // The other run's beats aren't ours to show.
    metronome.tick();
    vi.advanceTimersByTime(1);
    expect(state().beat).toBeNull();
    // And stopping the tool doesn't stop the other run.
    controller.stop();
    expect(metronome.running).toBe(true);
  });

  describe('where the click keeps going', () => {
    it('keeps time while the learner moves around Tools', async () => {
      const close = controller.openView();
      expect(state().viewOpen).toBe(true);
      await controller.start();
      path = '/tools/tuner';
      close();
      expect(state().viewOpen).toBe(false);
      vi.advanceTimersByTime(METRONOME_CONFIG.routeCheckMs * 4);
      path = '/tools';
      vi.advanceTimersByTime(METRONOME_CONFIG.routeCheckMs * 4);
      expect(state().running).toBe(true);
      expect(metronome.running).toBe(true);
    });

    it('stops when the view closes outside Tools', async () => {
      const close = controller.openView();
      await controller.start();
      path = '/';
      close();
      expect(metronome.running).toBe(false);
      expect(state().running).toBe(false);
    });

    it('stops soon after the learner leaves Tools from another tool', async () => {
      const close = controller.openView();
      await controller.start();
      path = '/tools/tuner';
      close();
      path = '/learn';
      vi.advanceTimersByTime(METRONOME_CONFIG.routeCheckMs);
      expect(metronome.running).toBe(false);
    });

    it('runs everywhere once pinned', async () => {
      const close = controller.openView();
      controller.set({ pinned: true });
      await controller.start();
      path = '/';
      close();
      vi.advanceTimersByTime(METRONOME_CONFIG.routeCheckMs * 4);
      expect(metronome.running).toBe(true);
    });

    it('stops at once if unpinned outside Tools', async () => {
      controller.set({ pinned: true });
      await controller.start();
      path = '/progress';
      controller.set({ pinned: false });
      expect(metronome.running).toBe(false);
    });

    it('watches again when unpinned inside Tools', async () => {
      controller.set({ pinned: true });
      await controller.start();
      controller.set({ pinned: false });
      expect(metronome.running).toBe(true);
      path = '/today';
      vi.advanceTimersByTime(METRONOME_CONFIG.routeCheckMs);
      expect(metronome.running).toBe(false);
    });

    it('does nothing on closing the view when stopped', () => {
      const close = controller.openView();
      path = '/';
      close();
      expect(metronome.startCalls).toBe(0);
      expect(state().running).toBe(false);
    });
  });
});
