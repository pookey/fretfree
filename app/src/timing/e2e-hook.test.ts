import { describe, expect, it } from 'vitest';
import { FAKE_ONSETS_KEY, fakeOnsetsForE2E, type FakeOnsetsHook } from './e2e-hook';
import { createFakeMetronome } from './fake-metronome';
import { METER_PRESETS } from './meter';

const on = () => ({ getItem: (key: string) => (key === FAKE_ONSETS_KEY ? '1' : null) });

describe('fakeOnsetsForE2E', () => {
  it('is off unless the key is set, and when storage throws', () => {
    const target: { fretworkFakeOnsets?: FakeOnsetsHook } = {};
    const metronome = createFakeMetronome();
    expect(fakeOnsetsForE2E('tap', target, () => ({ getItem: () => null }), metronome)).toBeNull();
    const throwing = () => {
      throw new Error('blocked');
    };
    expect(fakeOnsetsForE2E('tap', target, throwing, metronome)).toBeNull();
    expect(fakeOnsetsForE2E('tap', target, () => undefined, metronome)).toBeNull();
    expect(target.fretworkFakeOnsets).toBeUndefined();
  });

  it('installs one fake per input, and echoes each click at the set offset', async () => {
    const target: { fretworkFakeOnsets?: FakeOnsetsHook } = {};
    const metronome = createFakeMetronome({ startMs: 0 });
    const tap = fakeOnsetsForE2E('tap', target, on, metronome)!;
    expect(fakeOnsetsForE2E('tap', target, on, metronome)).toBe(tap);
    const mic = fakeOnsetsForE2E('mic', target, on, metronome)!;
    expect(mic.kind).toBe('mic');
    const heard: number[] = [];
    tap.onOnset((o) => heard.push(o.at));
    await tap.start();
    await metronome.start({ meter: METER_PRESETS['4/4'], bpm: 120, countInBars: 0 });
    metronome.tick();
    target.fretworkFakeOnsets!.echo = 25;
    metronome.tick();
    target.fretworkFakeOnsets!.echo = null;
    metronome.tick();
    // Tone isn't loaded here, so there is no output latency to add.
    expect(heard).toEqual([525]);
  });

  it('echoes with a strength per click when set (D31’s accents)', async () => {
    const target: { fretworkFakeOnsets?: FakeOnsetsHook } = {};
    const metronome = createFakeMetronome({ startMs: 0 });
    const tap = fakeOnsetsForE2E('tap', target, on, metronome)!;
    const heard: number[] = [];
    tap.onOnset((o) => heard.push(o.strength));
    await tap.start();
    await metronome.start({ meter: METER_PRESETS['4/4'], bpm: 120, countInBars: 0 });
    target.fretworkFakeOnsets!.echo = 0;
    metronome.tick();
    target.fretworkFakeOnsets!.strength = (c) => (c.accent === 'bar' ? 1 : 0.5);
    metronome.tick();
    metronome.tick();
    expect(heard).toEqual([1, 0.5, 0.5]);
  });
});
