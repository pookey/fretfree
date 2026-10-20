import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO } from './config';
import { createGuitar } from './voice';

type Call = [string, ...number[]];

/** An AudioParam that records its automation. */
class FakeParam {
  value = 1;
  calls: Call[] = [];
  holds = true;
  setValueAtTime(v: number, t: number) {
    this.calls.push(['set', v, t]);
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.calls.push(['target', v, t, c]);
  }
  cancelScheduledValues(t: number) {
    this.calls.push(['cancel', t]);
  }
  get cancelAndHoldAtTime() {
    return this.holds ? (t: number) => this.calls.push(['hold', t]) : undefined;
  }
}

class FakeGain {
  gain = new FakeParam();
  disconnected = false;
  disconnect() {
    this.disconnected = true;
  }
}

class FakeSource {
  buffer: unknown = null;
  to: unknown = null;
  started: number[] = [];
  stopped: number[] = [];
  onended: (() => void) | null = null;
  refuseStop = false;
  connect(to: unknown) {
    this.to = to;
  }
  start(t: number) {
    this.started.push(t);
  }
  stop(t: number) {
    if (this.refuseStop) throw new Error('InvalidStateError');
    this.stopped.push(t);
  }
}

const ctx = {
  sampleRate: 8_000,
  buffers: [] as { length: number; rate: number; data: Float32Array }[],
  sources: [] as FakeSource[],
  gains: [] as FakeGain[],
  createBuffer(_channels: number, length: number, rate: number) {
    const b = { length, rate, data: new Float32Array(length) };
    this.buffers.push(b);
    return { ...b, getChannelData: () => b.data };
  },
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  },
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  },
};

const filter = { connect: () => filter };
const connections: [unknown, unknown][] = [];
const Tone = {
  getContext: () => ctx,
  Volume: class {
    toDestination() {
      return { volume: { value: 0 }, mute: false };
    }
  },
  Filter: class {
    constructor() {
      return filter;
    }
  },
  connect: (from: unknown, to: unknown) => connections.push([from, to]),
} as unknown as typeof import('tone');

const RELEASE = AUDIO.pluck.release;
const DAMP = 0.06;

beforeEach(() => {
  ctx.buffers.length = 0;
  ctx.sources.length = 0;
  ctx.gains.length = 0;
  connections.length = 0;
});

describe('the guitar voice', () => {
  it('plays a rendered note through a gain envelope into the tone filter', () => {
    const guitar = createGuitar(Tone, () => 0.3);
    guitar.pluck('A2', 5, 1, 0);
    const [source] = ctx.sources;
    const [gain] = ctx.gains;
    expect(ctx.buffers).toHaveLength(1);
    expect(ctx.buffers[0]).toMatchObject({
      length: Math.round(AUDIO.pluck.seconds * 8_000),
      rate: 8_000,
    });
    expect(ctx.buffers[0]!.data.some((v) => v !== 0)).toBe(true);
    expect(source?.to).toBe(gain);
    expect(connections).toEqual([[gain, filter]]);
    expect(gain?.gain.value).toBe(0);
    expect(gain?.gain.calls).toEqual([
      ['set', 1, 5],
      ['target', 0, 6, RELEASE / 4],
    ]);
    expect(source?.started).toEqual([5]);
    expect(source?.stopped).toEqual([6 + RELEASE]);
  });

  it('renders each note once and reuses it', () => {
    const guitar = createGuitar(Tone, () => 0.3);
    guitar.pluck('A2', 0, 1, 0);
    guitar.pluck('A2', 1, 1, 1);
    guitar.pluck('E3', 2, 1, 2);
    expect(ctx.buffers).toHaveLength(2);
    expect(ctx.sources[0]?.buffer).toBe(ctx.sources[1]?.buffer);
  });

  it('keeps the most recently played notes and renders a dropped one again', () => {
    const guitar = createGuitar(Tone, () => 0.3);
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const note = (n: number) => `${names[n % 12]}${Math.floor(n / 12) + 2}`;
    // One more distinct note than the cache holds: the first is dropped.
    for (let n = 0; n <= AUDIO.cachedNotes; n++) guitar.pluck(note(n), 0, 1, n);
    expect(ctx.buffers).toHaveLength(AUDIO.cachedNotes + 1);
    guitar.pluck(note(AUDIO.cachedNotes), 0, 1, 0);
    expect(ctx.buffers).toHaveLength(AUDIO.cachedNotes + 1);
    guitar.pluck(note(0), 0, 1, 0);
    expect(ctx.buffers).toHaveLength(AUDIO.cachedNotes + 2);
  });

  it('damps the last note on a string when it is plucked again', () => {
    const guitar = createGuitar(Tone, () => 0.3);
    guitar.pluck('A2', 0, 2, 0);
    guitar.pluck('B2', 0.5, 2, 6); // Six strings: voice 6 is string 0 again.
    guitar.pluck('E3', 0.5, 2, 1);
    const [first, , third] = ctx.gains;
    expect(first?.gain.calls.slice(2)).toEqual([
      ['hold', 0.5],
      ['target', 0, 0.5, DAMP / 4],
    ]);
    expect(ctx.sources[0]?.stopped.at(-1)).toBe(0.5 + DAMP);
    expect(third?.gain.calls).toHaveLength(2);
  });

  it('wraps negative voices onto the strings', () => {
    const guitar = createGuitar(Tone, () => 0.3);
    guitar.pluck('A2', 0, 1, 5);
    guitar.pluck('B2', 1, 1, -1);
    expect(ctx.gains[0]?.gain.calls[2]).toEqual(['hold', 1]);
  });

  it('damps every ringing string, and skips strings that have ended', () => {
    const guitar = createGuitar(Tone, () => 0.3);
    guitar.pluck('A2', 0, 1, 0);
    guitar.pluck('E3', 0, 1, 1);
    ctx.sources[1]?.onended?.();
    expect(ctx.gains[1]?.disconnected).toBe(true);
    guitar.damp(0.2);
    expect(ctx.sources[0]?.stopped.at(-1)).toBe(0.2 + DAMP);
    expect(ctx.sources[1]?.stopped).toEqual([1 + RELEASE]);
  });

  it('holds the envelope by hand where cancelAndHoldAtTime is missing', () => {
    const guitar = createGuitar(Tone, () => 0.3);
    guitar.pluck('A2', 0, 1, 0);
    const gain = ctx.gains[0]!;
    gain.gain.holds = false;
    gain.gain.value = 0.4;
    guitar.damp(0.3);
    expect(gain.gain.calls.slice(2)).toEqual([
      ['cancel', 0.3],
      ['set', 0.4, 0.3],
      ['target', 0, 0.3, DAMP / 4],
    ]);
  });

  it('tolerates a source that has already stopped', () => {
    const guitar = createGuitar(Tone, () => 0.3);
    guitar.pluck('A2', 0, 1, 0);
    ctx.sources[0]!.refuseStop = true;
    expect(() => guitar.damp(0.1)).not.toThrow();
  });

  it('ignores a note it cannot name', () => {
    const guitar = createGuitar(Tone, () => 0.3);
    guitar.pluck('H9', 0, 1, 0);
    expect(ctx.sources).toHaveLength(0);
  });

  it('uses Math.random for the pick by default', () => {
    const random = vi.spyOn(Math, 'random');
    createGuitar(Tone).pluck('A2', 0, 1, 0);
    expect(random).toHaveBeenCalled();
    random.mockRestore();
  });
});
