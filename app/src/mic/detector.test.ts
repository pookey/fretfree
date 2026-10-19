import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIC_CONSTRAINTS,
  createWorkletPitchDriver,
  installPitchDetector,
  mediaError,
  type DetectorGlobals,
} from './detector';
import { createPitchSource, getPitchSource, setPitchSourceFactory } from './source';
import type { NoteEnd, PitchFrame, StableNote } from './types';
import { PITCH_PROCESSOR, type PitchMessage } from './worklet/protocol';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const noop = () => undefined;

function domError(name: string, msg = name): Error {
  const err = new Error(msg);
  err.name = name;
  return err;
}

/** Fake Web Audio and media APIs that record what the driver did with them. */
function fakeBrowser() {
  const log: string[] = [];
  const contexts: FakeContext[] = [];
  const nodes: FakeNode[] = [];
  const tracks: { stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
  const behaviour = {
    media: null as (() => Promise<MediaStream>) | null,
    addModule: null as (() => Promise<void>) | null,
    resume: null as (() => Promise<void>) | null,
    construct: null as (() => void) | null,
  };

  class FakeContext {
    readonly destination = { name: 'destination' };
    readonly options: unknown;
    readonly close = vi.fn(() => Promise.resolve());
    state: AudioContextState | 'interrupted' = 'running';
    onstatechange: (() => void) | null = null;
    readonly input = { connect: vi.fn(), disconnect: vi.fn() };
    readonly audioWorklet = {
      addModule: vi.fn((url: string) => {
        log.push(`addModule ${url}`);
        return behaviour.addModule?.() ?? Promise.resolve();
      }),
    };

    constructor(options: unknown) {
      behaviour.construct?.();
      log.push('context');
      this.options = options;
      contexts.push(this);
    }

    resume() {
      log.push('resume');
      return behaviour.resume?.() ?? Promise.resolve();
    }

    createMediaStreamSource(stream: MediaStream) {
      log.push(`source ${stream.id}`);
      return this.input;
    }
  }

  class FakeNode {
    readonly port: { onmessage: ((e: { data: PitchMessage }) => void) | null } = {
      onmessage: null,
    };
    readonly connect = vi.fn();
    readonly disconnect = vi.fn();

    constructor(
      readonly context: FakeContext,
      readonly name: string,
      readonly options: AudioWorkletNodeOptions,
    ) {
      nodes.push(this);
    }

    post(message: PitchMessage) {
      this.port.onmessage?.({ data: message });
    }
  }

  const getUserMedia = vi.fn((constraints: MediaStreamConstraints) => {
    log.push('getUserMedia');
    void constraints;
    if (behaviour.media) return behaviour.media();
    const track = { stop: vi.fn(), onended: null };
    tracks.push(track);
    return Promise.resolve({ id: `stream${tracks.length}`, getTracks: () => [track] } as never);
  });

  const globals: DetectorGlobals = {
    mediaDevices: { getUserMedia },
    AudioContext: FakeContext as unknown as typeof AudioContext,
    AudioWorkletNode: FakeNode as unknown as typeof AudioWorkletNode,
  };
  return { globals, log, contexts, nodes, tracks, behaviour, getUserMedia };
}

function driverFor(browser: ReturnType<typeof fakeBrowser>, workletUrl = '/pitch.js') {
  return createWorkletPitchDriver({ globals: () => browser.globals, workletUrl });
}

afterEach(() => {
  setPitchSourceFactory(null);
});

describe('installPitchDetector', () => {
  it('asks for nothing until the learner starts mic mode', async () => {
    const browser = fakeBrowser();
    installPitchDetector({ globals: () => browser.globals, workletUrl: '/pitch.js' });
    const source = getPitchSource();
    expect(source.state).toBe('idle');
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(browser.contexts).toHaveLength(0);

    const started = source.start();
    // Synchronously, inside the gesture: the prompt and the AudioContext.
    expect(browser.log).toEqual(['context', 'getUserMedia', 'resume', 'addModule /pitch.js']);
    expect(browser.getUserMedia).toHaveBeenCalledWith(MIC_CONSTRAINTS);
    await started;
    expect(source.state).toBe('running');
  });

  it('streams frames on the AudioContext clock and finds stable notes', async () => {
    const browser = fakeBrowser();
    installPitchDetector({ globals: () => browser.globals, workletUrl: '/pitch.js' });
    const source = getPitchSource();
    const frames: PitchFrame[] = [];
    const notes: StableNote[] = [];
    const ends: NoteEnd[] = [];
    source.onFrame((f) => frames.push(f));
    source.onNote((n) => notes.push(n));
    source.onNoteEnd((e) => ends.push(e));
    await source.start();

    const node = browser.nodes[0]!;
    for (let i = 0; i <= 10; i += 1)
      node.post({ frequency: 110, clarity: 0.97, time: 2 + i / 100 });
    expect(frames[0]).toEqual({ frequency: 110, clarity: 0.97, at: 2000 });
    expect(notes).toMatchObject([{ name: 'A2', startedAt: 2000, stableAt: 2080 }]);

    // The detector's overlapping windows get a longer dropout than the contract's 50ms.
    node.post({ frequency: 110, clarity: 0.97, time: 2.19 });
    expect(ends).toEqual([]);
    node.post({ frequency: 0, clarity: 0, time: 2.3 });
    expect(ends).toMatchObject([{ endedAt: 2190 }]);
  });
});

describe('createWorkletPitchDriver', () => {
  it('builds a mono graph: mic → pitch worklet → destination', async () => {
    const browser = fakeBrowser();
    await driverFor(browser).start(noop, noop);
    const [context] = browser.contexts;
    const [node] = browser.nodes;
    expect(context?.options).toEqual({ latencyHint: 'interactive' });
    expect(node?.name).toBe(PITCH_PROCESSOR);
    expect(node?.options).toMatchObject({ channelCount: 1, channelCountMode: 'explicit' });
    expect(context?.input.connect).toHaveBeenCalledWith(node);
    expect(node?.connect).toHaveBeenCalledWith(context?.destination);
    expect(browser.log).toContain('source stream1');
  });

  it('defaults to the bundled worklet', async () => {
    const browser = fakeBrowser();
    await createWorkletPitchDriver({ globals: () => browser.globals }).start(noop, noop);
    expect(browser.contexts[0]?.audioWorklet.addModule).toHaveBeenCalledWith(
      expect.stringContaining('pitch-processor'),
    );
  });

  it('releases the microphone and the context on stop, and can start again', async () => {
    const browser = fakeBrowser();
    const driver = driverFor(browser);
    const emit = vi.fn();
    await driver.start(emit, noop);
    const node = browser.nodes[0]!;
    driver.stop();
    expect(browser.tracks[0]?.stop).toHaveBeenCalled();
    expect(browser.contexts[0]?.close).toHaveBeenCalled();
    expect(browser.contexts[0]?.input.disconnect).toHaveBeenCalled();
    expect(node.disconnect).toHaveBeenCalled();
    // A late message from the audio thread goes nowhere.
    node.post({ frequency: 110, clarity: 1, time: 1 });
    expect(emit).not.toHaveBeenCalled();
    driver.stop();
    expect(browser.contexts[0]?.close).toHaveBeenCalledTimes(1);

    await driver.start(emit, noop);
    expect(browser.contexts).toHaveLength(2);
    browser.nodes[1]!.post({ frequency: 220, clarity: 0.95, time: 0.5 });
    expect(emit).toHaveBeenCalledWith({ frequency: 220, clarity: 0.95, at: 500 });
  });

  it.each([
    ['the track ends', (b: ReturnType<typeof fakeBrowser>) => b.tracks[0]?.onended?.()],
    [
      'iOS interrupts the context',
      (b: ReturnType<typeof fakeBrowser>) => {
        const context = b.contexts[0]!;
        context.state = 'interrupted';
        context.onstatechange?.();
      },
    ],
  ])('reports a lost input when %s, and stops listening once stopped', async (_, lose) => {
    const browser = fakeBrowser();
    const driver = driverFor(browser);
    const fail = vi.fn();
    await driver.start(noop, fail);
    browser.contexts[0]!.onstatechange?.(); // still running: nothing lost
    expect(fail).not.toHaveBeenCalled();
    lose(browser);
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ reason: 'lost' }));
    driver.stop();
    expect(browser.tracks[0]?.onended).toBeNull();
    expect(browser.contexts[0]?.onstatechange).toBeNull();
  });

  it('fails the start when the track has already ended by the time it is wired', async () => {
    const browser = fakeBrowser();
    const track = { stop: vi.fn(), onended: null, readyState: 'ended' };
    browser.behaviour.media = () =>
      Promise.resolve({ id: 'dead', getTracks: () => [track] } as never);
    const source = createPitchSource(driverFor(browser));
    await expect(source.start()).rejects.toMatchObject({ reason: 'lost' });
    expect(source.state).toBe('error');
    expect(track.stop).toHaveBeenCalled();
    expect(browser.contexts[0]?.close).toHaveBeenCalled();
  });

  it('turns a lost input into an error state, ready to restart', async () => {
    const browser = fakeBrowser();
    const source = createPitchSource(driverFor(browser));
    await source.start();
    browser.tracks[0]?.onended?.();
    expect(source.state).toBe('error');
    expect(source.error?.reason).toBe('lost');
    expect(browser.tracks[0]?.stop).toHaveBeenCalled();
    expect(browser.contexts[0]?.close).toHaveBeenCalled();
    await source.start();
    expect(source.state).toBe('running');
    expect(browser.contexts).toHaveLength(2);
  });

  it('does nothing on stop before a start', () => {
    const browser = fakeBrowser();
    expect(() => driverFor(browser).stop()).not.toThrow();
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['NotReadableError', 'failed'],
    ['AbortError', 'failed'],
  ])('maps a getUserMedia %s to %s and closes the context', async (name, reason) => {
    const browser = fakeBrowser();
    browser.behaviour.media = () => Promise.reject(domError(name, `mic ${name}`));
    await expect(driverFor(browser).start(noop, noop)).rejects.toMatchObject({
      name: 'PitchSourceError',
      reason,
      message: `mic ${name}`,
    });
    expect(browser.contexts[0]?.close).toHaveBeenCalled();
    expect(browser.nodes).toHaveLength(0);
  });

  it('maps a getUserMedia that throws synchronously', async () => {
    const browser = fakeBrowser();
    browser.behaviour.media = () => {
      throw domError('SecurityError');
    };
    await expect(driverFor(browser).start(noop, noop)).rejects.toMatchObject({
      reason: 'denied',
    });
  });

  it.each([
    ['mediaDevices', { mediaDevices: undefined }],
    ['AudioContext', { AudioContext: undefined }],
    ['AudioWorkletNode', { AudioWorkletNode: undefined }],
  ])('reports unsupported without %s, before prompting', async (_, missing) => {
    const browser = fakeBrowser();
    const driver = createWorkletPitchDriver({
      globals: () => ({ ...browser.globals, ...missing }),
    });
    await expect(driver.start(noop, noop)).rejects.toMatchObject({ reason: 'unsupported' });
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(browser.contexts).toHaveLength(0);
  });

  it('reports unsupported in a browser without the APIs (jsdom)', async () => {
    await expect(createWorkletPitchDriver().start(noop, noop)).rejects.toMatchObject({
      reason: 'unsupported',
    });
  });

  it('fails, releasing the mic, when the worklet does not load', async () => {
    const browser = fakeBrowser();
    browser.behaviour.addModule = () => Promise.reject(new Error('worklet 404'));
    await expect(driverFor(browser).start(noop, noop)).rejects.toMatchObject({
      reason: 'failed',
      message: 'worklet 404',
    });
    expect(browser.tracks[0]?.stop).toHaveBeenCalled();
    expect(browser.contexts[0]?.close).toHaveBeenCalled();
  });

  it('fails when the context will not resume', async () => {
    const browser = fakeBrowser();
    browser.behaviour.resume = () => Promise.reject('blocked');
    await expect(driverFor(browser).start(noop, noop)).rejects.toMatchObject({
      reason: 'failed',
      message: 'blocked',
    });
    expect(browser.tracks[0]?.stop).toHaveBeenCalled();
  });

  it.each([
    ['resume', 'Starting audio timed out after 30ms'],
    ['addModule', 'Loading the pitch worklet timed out after 30ms'],
  ] as const)('fails, releasing the mic, when %s never settles', async (step, msg) => {
    const browser = fakeBrowser();
    browser.behaviour[step] = () => new Promise<void>(() => undefined);
    const driver = createWorkletPitchDriver({
      globals: () => browser.globals,
      workletUrl: '/pitch.js',
      startTimeoutMs: 30,
    });
    await expect(driver.start(noop, noop)).rejects.toMatchObject({
      reason: 'failed',
      message: msg,
    });
    expect(browser.tracks[0]?.stop).toHaveBeenCalled();
    expect(browser.contexts[0]?.close).toHaveBeenCalled();
  });

  it('gives the learner all the time they need to answer the prompt', async () => {
    const browser = fakeBrowser();
    const media = deferred<MediaStream>();
    browser.behaviour.media = () => media.promise;
    const driver = createWorkletPitchDriver({
      globals: () => browser.globals,
      workletUrl: '/pitch.js',
      startTimeoutMs: 10,
    });
    const started = driver.start(noop, noop);
    await new Promise((r) => setTimeout(r, 40));
    media.resolve({ id: 'slow', getTracks: () => [{ stop: vi.fn() }] } as never);
    await expect(started).resolves.toBeUndefined();
  });

  it('fails when the AudioContext cannot be built', async () => {
    const browser = fakeBrowser();
    browser.behaviour.construct = () => {
      throw new Error('too many contexts');
    };
    await expect(driverFor(browser).start(noop, noop)).rejects.toMatchObject({
      reason: 'failed',
      message: 'too many contexts',
    });
    expect(browser.getUserMedia).not.toHaveBeenCalled();
  });

  it('fails when the worklet node cannot be built', async () => {
    const browser = fakeBrowser();
    const Throwing = class {
      constructor() {
        throw new Error('no such processor');
      }
    };
    const driver = createWorkletPitchDriver({
      globals: () => ({
        ...browser.globals,
        AudioWorkletNode: Throwing as unknown as typeof AudioWorkletNode,
      }),
    });
    await expect(driver.start(noop, noop)).rejects.toMatchObject({
      reason: 'failed',
      message: 'no such processor',
    });
    expect(browser.tracks[0]?.stop).toHaveBeenCalled();
  });

  it('is released when the learner stops before permission is granted', async () => {
    const browser = fakeBrowser();
    const media = deferred<MediaStream>();
    browser.behaviour.media = () => media.promise;
    const source = createPitchSource(driverFor(browser));
    const started = source.start();
    source.stop();
    const track = { stop: vi.fn(), onended: null };
    media.resolve({ id: 'late', getTracks: () => [track] } as never);
    await started;
    expect(source.state).toBe('idle');
    expect(track.stop).toHaveBeenCalled();
    expect(browser.contexts[0]?.close).toHaveBeenCalled();
  });
});

describe('mediaError', () => {
  it('treats anything unrecognised as a failure', () => {
    expect(mediaError('weird')).toMatchObject({ reason: 'failed', message: 'weird' });
    expect(mediaError(new TypeError('bad constraints'))).toMatchObject({ reason: 'failed' });
  });
});
