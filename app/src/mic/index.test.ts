import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIC_CONFIG,
  PitchSourceError,
  centsOff,
  createFakePitchSource,
  createNoteTracker,
  createPitchSource,
  frequencyToMidi,
  getPitchSource,
  midiToFrequency,
  pitchMatches,
  setPitchSourceFactory,
  type NoteEnd,
  type PitchDriver,
  type PitchFrame,
  type StableNote,
  type TrackerEvent,
} from '.';

const A2 = 110;

function frames(
  frequency: number,
  from: number,
  to: number,
  step = 20,
  clarity = 0.98,
): PitchFrame[] {
  const out: PitchFrame[] = [];
  for (let at = from; at <= to; at += step) out.push({ frequency, clarity, at });
  return out;
}

function feed(tracker: ReturnType<typeof createNoteTracker>, input: PitchFrame[]): TrackerEvent[] {
  return input.flatMap((f) => tracker.push(f));
}

function record(source: ReturnType<typeof createFakePitchSource>) {
  const notes: StableNote[] = [];
  const ends: NoteEnd[] = [];
  const frameLog: PitchFrame[] = [];
  source.onNote((n) => notes.push(n));
  source.onNoteEnd((e) => ends.push(e));
  source.onFrame((f) => frameLog.push(f));
  return { notes, ends, frames: frameLog };
}

describe('pitch maths', () => {
  it('converts between frequency and MIDI', () => {
    expect(frequencyToMidi(440)).toBe(69);
    expect(frequencyToMidi(A2)).toBeCloseTo(45);
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(40)).toBeCloseTo(82.41, 2);
    expect(frequencyToMidi(432, 432)).toBe(69);
  });

  it('measures cents from a note', () => {
    expect(centsOff(440, 69)).toBe(0);
    expect(centsOff(midiToFrequency(69.1), 69)).toBeCloseTo(10);
    expect(centsOff(midiToFrequency(68.8), 69)).toBeCloseTo(-20);
  });

  it('matches pitches per drill mode', () => {
    expect(pitchMatches(45, 45, 'exact')).toBe(true);
    expect(pitchMatches(57, 45, 'exact')).toBe(false);
    expect(pitchMatches(57, 45, 'octave')).toBe(true);
    expect(pitchMatches(33, 45, 'octave')).toBe(true);
    expect(pitchMatches(69, 45, 'octave')).toBe(false);
    expect(pitchMatches(69, 45, 'pitch-class')).toBe(true);
    expect(pitchMatches(46, 45, 'pitch-class')).toBe(false);
    expect(pitchMatches(46, 45, 'octave')).toBe(false);
  });
});

describe('createNoteTracker', () => {
  it('reports a note only once it has held for 80ms', () => {
    const t = createNoteTracker();
    expect(feed(t, frames(A2, 0, 60))).toEqual([]);
    const events = t.push({ frequency: A2, clarity: 0.98, at: 80 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'note',
      note: { midi: 45, name: 'A2', chroma: 9, startedAt: 0, stableAt: 80 },
    });
    // Sustaining does not re-report it.
    expect(feed(t, frames(A2, 100, 400))).toEqual([]);
  });

  it('uses the configured threshold of 80ms by default', () => {
    expect(MIC_CONFIG.tracker.minStableMs).toBe(80);
  });

  it('reports the median frequency and its cents offset', () => {
    const t = createNoteTracker();
    const sharp = midiToFrequency(45.1);
    const events = feed(t, [
      { frequency: A2, clarity: 0.95, at: 0 },
      { frequency: sharp, clarity: 0.95, at: 40 },
      { frequency: sharp, clarity: 0.95, at: 80 },
    ]);
    const note = (events[0] as Extract<TrackerEvent, { type: 'note' }>).note;
    expect(note.frequency).toBeCloseTo(sharp);
    expect(note.cents).toBeCloseTo(10);

    const even = createNoteTracker({ minStableMs: 60 });
    const [e] = feed(even, [
      { frequency: 109, clarity: 1, at: 0 },
      { frequency: 110, clarity: 1, at: 20 },
      { frequency: 111, clarity: 1, at: 40 },
      { frequency: 112, clarity: 1, at: 60 },
    ]);
    expect((e as Extract<TrackerEvent, { type: 'note' }>).note.frequency).toBe(110.5);
  });

  it('ignores low-clarity and out-of-range frames', () => {
    const t = createNoteTracker();
    expect(feed(t, frames(A2, 0, 200, 20, 0.5))).toEqual([]);
    expect(feed(t, frames(30, 220, 400))).toEqual([]);
    expect(feed(t, frames(3000, 420, 600))).toEqual([]);
  });

  it('restarts the clock when the pitch changes before it is stable', () => {
    const t = createNoteTracker();
    // A pick transient one semitone off, then the real note.
    expect(feed(t, frames(midiToFrequency(46), 0, 40))).toEqual([]);
    expect(feed(t, frames(A2, 60, 120))).toEqual([]);
    expect(t.push({ frequency: A2, clarity: 0.98, at: 140 })[0]).toMatchObject({
      type: 'note',
      note: { midi: 45, startedAt: 60 },
    });
  });

  it('holds a note through slight detuning (hysteresis)', () => {
    const t = createNoteTracker();
    feed(t, frames(A2, 0, 100));
    // 60 cents sharp would round to A#2, but stays within holdCents of A2.
    expect(feed(t, frames(midiToFrequency(45.6), 120, 300))).toEqual([]);
  });

  it('ends a note when a different pitch takes over', () => {
    const t = createNoteTracker();
    feed(t, frames(A2, 0, 100));
    const events = feed(t, frames(midiToFrequency(48), 120, 200));
    expect(events.map((e) => e.type)).toEqual(['note-end', 'note']);
    expect(events[0]).toMatchObject({
      type: 'note-end',
      end: { note: { midi: 45 }, endedAt: 100 },
    });
    expect(events[1]).toMatchObject({ type: 'note', note: { midi: 48, startedAt: 120 } });
  });

  it('survives a short dropout but ends on a longer silence', () => {
    const t = createNoteTracker();
    feed(t, frames(A2, 0, 100));
    expect(t.push({ frequency: 0, clarity: 0, at: 120 })).toEqual([]);
    expect(t.push({ frequency: 0, clarity: 0, at: 140 })).toEqual([]);
    expect(feed(t, frames(A2, 150, 200))).toEqual([]);
    expect(feed(t, frames(0, 220, 240, 20, 0))).toEqual([]);
    expect(t.push({ frequency: 0, clarity: 0, at: 260 })).toEqual([
      {
        type: 'note-end',
        end: expect.objectContaining({ endedAt: 190 }) as unknown as NoteEnd,
      },
    ]);
    expect(t.push({ frequency: 0, clarity: 0, at: 280 })).toEqual([]);
  });

  it('counts the same note again after a gap (re-picked)', () => {
    const t = createNoteTracker();
    feed(t, frames(A2, 0, 100));
    // No unvoiced frames arrived, but the gap is longer than dropoutMs.
    const events = feed(t, frames(A2, 200, 280));
    expect(events.map((e) => e.type)).toEqual(['note-end', 'note']);
    expect(events[1]).toMatchObject({ note: { startedAt: 200, stableAt: 280 } });
  });

  it('discards an unstable candidate silently', () => {
    const t = createNoteTracker();
    feed(t, frames(A2, 0, 40));
    expect(feed(t, frames(0, 60, 200, 20, 0))).toEqual([]);
    expect(t.flush()).toEqual([]);
  });

  it('flushes a sounding note', () => {
    const t = createNoteTracker();
    feed(t, frames(A2, 0, 100));
    expect(t.flush()).toEqual([
      { type: 'note-end', end: expect.objectContaining({ endedAt: 100 }) as unknown as NoteEnd },
    ]);
    expect(t.flush()).toEqual([]);
  });

  it('does not split a sustained note on an octave glitch', () => {
    const t = createNoteTracker();
    const input = [
      ...frames(A2, 0, 180),
      { frequency: 2 * A2, clarity: 0.98, at: 200 },
      ...frames(A2, 220, 300),
      { frequency: 2 * A2, clarity: 0.98, at: 320 },
      { frequency: 2 * A2, clarity: 0.98, at: 340 },
      ...frames(A2, 360, 400),
    ];
    const events = feed(t, input);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'note', note: { midi: 45, startedAt: 0 } });
    expect(feed(t, frames(0, 420, 480, 20, 0))).toEqual([
      { type: 'note-end', end: expect.objectContaining({ endedAt: 400 }) as unknown as NoteEnd },
    ]);
  });

  it('ends a note when a challenger becomes stable within the dropout window', () => {
    const t = createNoteTracker({ dropoutMs: 200 });
    feed(t, frames(A2, 0, 100));
    const c3 = midiToFrequency(48);
    expect(feed(t, frames(c3, 120, 180))).toEqual([]);
    expect(t.push({ frequency: c3, clarity: 0.98, at: 200 })).toEqual([
      { type: 'note-end', end: expect.objectContaining({ endedAt: 100 }) as unknown as NoteEnd },
      { type: 'note', note: expect.objectContaining({ midi: 48, startedAt: 120, stableAt: 200 }) },
    ]);
  });

  it('replaces a challenger that changes pitch', () => {
    const t = createNoteTracker({ dropoutMs: 200 });
    feed(t, frames(A2, 0, 100));
    feed(t, frames(midiToFrequency(48), 120, 160));
    expect(feed(t, frames(midiToFrequency(50), 180, 240))).toEqual([]);
    expect(t.push({ frequency: midiToFrequency(50), clarity: 0.98, at: 260 })).toEqual([
      { type: 'note-end', end: expect.objectContaining({ endedAt: 100 }) as unknown as NoteEnd },
      { type: 'note', note: expect.objectContaining({ midi: 50, startedAt: 180 }) },
    ]);
  });

  it('drops a stale challenger when the note ends in silence', () => {
    const t = createNoteTracker();
    feed(t, frames(A2, 0, 100));
    feed(t, [{ frequency: midiToFrequency(48), clarity: 0.98, at: 120 }]);
    expect(feed(t, frames(0, 140, 180, 20, 0))).toEqual([
      { type: 'note-end', end: expect.objectContaining({ endedAt: 100 }) as unknown as NoteEnd },
    ]);
    // C3 starts afresh rather than continuing from 120.
    expect(feed(t, frames(midiToFrequency(48), 200, 280))[0]).toMatchObject({
      note: { midi: 48, startedAt: 200 },
    });
  });

  it('accepts custom options', () => {
    const t = createNoteTracker({ minStableMs: 200, minClarity: 0.5 });
    expect(feed(t, frames(A2, 0, 180, 20, 0.6))).toEqual([]);
    expect(t.push({ frequency: A2, clarity: 0.6, at: 200 })).toHaveLength(1);
  });
});

describe('createPitchSource', () => {
  /** A driver whose starts settle when the test says; `resolve`/`reject` act on the latest start. */
  function controllableDriver() {
    const calls: {
      emit: (f: PitchFrame) => void;
      resolve: () => void;
      reject: (e: unknown) => void;
    }[] = [];
    const log: string[] = [];
    const driver = {
      start: vi.fn((emit: (f: PitchFrame) => void) => {
        log.push(`start${calls.length}`);
        return new Promise<void>((resolve, reject) => {
          calls.push({ emit, resolve, reject });
        });
      }),
      stop: vi.fn(() => {
        log.push('stop');
      }),
    } satisfies PitchDriver;
    const call = (i?: number) => calls[i ?? calls.length - 1];
    return {
      driver,
      log,
      emit: (f: PitchFrame, i?: number) => call(i)?.emit(f),
      resolve: (i?: number) => call(i)?.resolve(),
      reject: (e: unknown, i?: number) => call(i)?.reject(e),
    };
  }

  const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0));

  it('calls the driver synchronously, inside the user gesture', () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    void source.start();
    expect(c.driver.start).toHaveBeenCalledTimes(1);
  });

  it('restarting while a cancelled start is pending never stops the live session', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    const seen = vi.fn();
    source.onFrame(seen);
    const first = source.start();
    source.stop();
    const second = source.start();
    expect(source.state).toBe('starting');
    // The second driver start waits for the first to settle.
    expect(c.driver.start).toHaveBeenCalledTimes(1);
    c.resolve(0);
    await first;
    await flushMicrotasks();
    expect(c.log).toEqual(['start0', 'stop', 'start1']);
    c.resolve(1);
    await second;
    expect(source.state).toBe('running');
    expect(c.driver.stop).toHaveBeenCalledTimes(1);
    c.emit({ frequency: A2, clarity: 1, at: 0 }, 1);
    c.emit({ frequency: A2, clarity: 1, at: 0 }, 0);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('restarts cleanly when the cancelled start fails', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    const first = source.start();
    source.stop();
    const second = source.start();
    c.reject(new PitchSourceError('denied'), 0);
    await expect(first).resolves.toBeUndefined();
    await flushMicrotasks();
    expect(c.log).toEqual(['start0', 'start1']);
    expect(source.state).toBe('starting');
    expect(source.error).toBeNull();
    c.resolve(1);
    await second;
    expect(source.state).toBe('running');
    expect(c.driver.stop).not.toHaveBeenCalled();
  });

  it('reports a failure of the restarted start', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    void source.start();
    source.stop();
    const second = source.start();
    c.resolve(0);
    await flushMicrotasks();
    c.reject(new PitchSourceError('no-device'), 1);
    await expect(second).rejects.toMatchObject({ reason: 'no-device' });
    expect(source.state).toBe('error');
  });

  it('skips a queued start that was itself cancelled', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    void source.start();
    source.stop();
    const second = source.start();
    source.stop();
    c.resolve(0);
    await second;
    await flushMicrotasks();
    expect(c.log).toEqual(['start0', 'stop']);
    expect(source.state).toBe('idle');
  });

  it('wraps a driver that throws synchronously', async () => {
    const source = createPitchSource({
      start: () => {
        throw new Error('no AudioWorklet');
      },
      stop: () => undefined,
    });
    await expect(source.start()).rejects.toMatchObject({
      reason: 'failed',
      message: 'no AudioWorklet',
    });
  });

  it('moves idle → starting → running → idle and reports state changes', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    const states: string[] = [];
    source.onStateChange((s) => states.push(s));
    expect(source.state).toBe('idle');
    const p = source.start();
    expect(source.state).toBe('starting');
    expect(source.start()).toBe(p);
    c.resolve();
    await p;
    expect(source.state).toBe('running');
    await source.start();
    expect(c.driver.start).toHaveBeenCalledTimes(1);
    source.stop();
    source.stop();
    expect(c.driver.stop).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['starting', 'running', 'idle']);
  });

  it('drops frames that arrive before it is running', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    const seen = vi.fn();
    source.onFrame(seen);
    const p = source.start();
    c.emit({ frequency: A2, clarity: 1, at: 0 });
    c.resolve();
    await p;
    c.emit({ frequency: A2, clarity: 1, at: 20 });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('discards a start that completes after stop', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    const p = source.start();
    source.stop();
    expect(source.state).toBe('idle');
    c.resolve();
    await p;
    expect(source.state).toBe('idle');
    expect(c.driver.stop).toHaveBeenCalledTimes(1);
  });

  it('ignores a failure that arrives after stop', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    const p = source.start();
    source.stop();
    c.reject(new PitchSourceError('denied'));
    await expect(p).resolves.toBeUndefined();
    expect(source.state).toBe('idle');
    expect(source.error).toBeNull();
  });

  it('wraps unknown driver errors as failed, and can retry', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    const p = source.start();
    c.reject(new Error('worklet 404'));
    await expect(p).rejects.toMatchObject({ reason: 'failed', message: 'worklet 404' });
    expect(source.state).toBe('error');
    source.stop();
    expect(source.state).toBe('error');

    const q = source.start();
    expect(source.error).toBeNull();
    c.reject('boom');
    await expect(q).rejects.toMatchObject({ reason: 'failed', message: 'boom' });

    const r = source.start();
    c.resolve();
    await r;
    expect(source.state).toBe('running');
  });

  it('stops delivering to unsubscribed listeners', async () => {
    const c = controllableDriver();
    const source = createPitchSource(c.driver);
    const seen = vi.fn();
    const off = source.onFrame(seen);
    const p = source.start();
    c.resolve();
    await p;
    c.emit({ frequency: A2, clarity: 1, at: 0 });
    off();
    c.emit({ frequency: A2, clarity: 1, at: 20 });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('createFakePitchSource', () => {
  it('starts without a microphone and counts permission prompts', async () => {
    const source = createFakePitchSource();
    expect(source.startCalls).toBe(0);
    await source.start();
    expect(source.state).toBe('running');
    expect(source.startCalls).toBe(1);
  });

  it('emits frames and a stable note for a played note', async () => {
    const source = createFakePitchSource();
    const log = record(source);
    await source.start();
    source.play('A2');
    expect(source.now).toBe(300);
    expect(log.frames).toHaveLength(15);
    expect(log.frames[0]).toEqual({
      frequency: expect.closeTo(110, 5) as number,
      clarity: 0.98,
      at: 0,
    });
    expect(log.notes).toHaveLength(1);
    expect(log.notes[0]).toMatchObject({ midi: 45, name: 'A2', startedAt: 0, stableAt: 80 });
  });

  it('does not count a note shorter than 80ms', async () => {
    const source = createFakePitchSource();
    const log = record(source);
    await source.start();
    source.play(45, { durationMs: 60 });
    source.silence(200);
    expect(log.notes).toEqual([]);
  });

  it('plays a sequence, with note ends between', async () => {
    const source = createFakePitchSource();
    const log = record(source);
    await source.start();
    source.play('E2');
    source.play('G#2', { cents: -15 });
    source.silence(100);
    source.play('E2');
    expect(log.notes.map((n) => n.name)).toEqual(['E2', 'G#2', 'E2']);
    expect(log.notes[1]?.cents).toBeCloseTo(-15);
    expect(log.ends.map((e) => e.note.name)).toEqual(['E2', 'G#2']);
    source.stop();
    expect(log.ends.map((e) => e.note.name)).toEqual(['E2', 'G#2', 'E2']);
  });

  it('is deaf while not running, but its clock moves', async () => {
    const source = createFakePitchSource({ startAt: 1000, frameMs: 10 });
    const log = record(source);
    source.play('A2', { durationMs: 100 });
    expect(source.now).toBe(1100);
    expect(log.frames).toEqual([]);
    await source.start();
    source.frame(A2);
    source.frame(A2, 0.2);
    expect(log.frames.map((f) => [f.at, f.clarity])).toEqual([
      [1100, 0.98],
      [1110, 0.2],
    ]);
    source.stop();
    source.play('A2');
    expect(log.frames).toHaveLength(2);
  });

  it('honours clarity and tracker options', async () => {
    const source = createFakePitchSource({ tracker: { minStableMs: 200 } });
    const log = record(source);
    await source.start();
    source.play('A2', { clarity: 0.5 });
    source.play('A2', { durationMs: 150 });
    expect(log.notes).toEqual([]);
    source.play('A2', { durationMs: 300 });
    expect(log.notes).toHaveLength(1);
  });

  it('can be told to fail the next start', async () => {
    const source = createFakePitchSource();
    source.failNextStart('denied');
    await expect(source.start()).rejects.toBeInstanceOf(PitchSourceError);
    expect(source.state).toBe('error');
    expect(source.error?.reason).toBe('denied');
    await source.start();
    expect(source.state).toBe('running');
    expect(source.startCalls).toBe(2);
  });

  it('rejects an invalid note name', async () => {
    const source = createFakePitchSource();
    await source.start();
    expect(() => source.play('H9x')).toThrow('Invalid note');
  });
});

describe('getPitchSource', () => {
  afterEach(() => setPitchSourceFactory(null));

  it('reports unsupported until a detector is installed', async () => {
    const source = getPitchSource();
    expect(getPitchSource()).toBe(source);
    await expect(source.start()).rejects.toMatchObject({ reason: 'unsupported' });
    source.stop();
  });

  it('builds one shared source from the installed factory and stops it on replacement', async () => {
    const fake = createFakePitchSource();
    const factory = vi.fn(() => fake);
    setPitchSourceFactory(factory);
    expect(getPitchSource()).toBe(fake);
    expect(getPitchSource()).toBe(fake);
    expect(factory).toHaveBeenCalledTimes(1);
    await fake.start();
    setPitchSourceFactory(null);
    expect(fake.state).toBe('idle');
    expect(getPitchSource()).not.toBe(fake);
  });

  it('carries a readable error', () => {
    const err = new PitchSourceError('no-device');
    expect(err.name).toBe('PitchSourceError');
    expect(err.message).toBe('Pitch source no-device');
    expect(err).toBeInstanceOf(Error);
  });
});
