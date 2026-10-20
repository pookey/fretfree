import { describe, expect, it, vi } from 'vitest';
import { MIC_CONSTRAINTS } from '../mic/detector';
import { createMicOnsetDriver, createMicOnsetSource, type OnsetContext } from './mic-onsets';
import type { Onset } from './onsets';
import { ONSET_PROCESSOR, type OnsetMessage } from './worklet/protocol';

function domError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

/** Tone's context and the media APIs, faked, recording what the driver did. */
function fakeAudio() {
  const log: string[] = [];
  const statechange = new Set<() => void>();
  const tracks: { stop: ReturnType<typeof vi.fn>; onended: (() => void) | null; readyState: string }[] = [];
  const behaviour = {
    media: null as (() => Promise<MediaStream>) | null,
    addModule: null as (() => Promise<void>) | null,
    noWorklet: false,
  };
  const input = { connect: vi.fn(), disconnect: vi.fn() };
  const nodes: {
    port: { onmessage: ((e: MessageEvent<OnsetMessage>) => void) | null };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    name: string;
  }[] = [];
  const raw = {
    state: 'running',
    destination: { name: 'destination' },
    get audioWorklet() {
      return behaviour.noWorklet
        ? undefined
        : {
            addModule: (url: string) => {
              log.push(`addModule ${url}`);
              return behaviour.addModule?.() ?? Promise.resolve();
            },
          };
    },
    addEventListener: (_: string, l: () => void) => statechange.add(l),
    removeEventListener: (_: string, l: () => void) => statechange.delete(l),
  };
  const context: OnsetContext = {
    rawContext: raw,
    createMediaStreamSource: (stream) => {
      log.push(`source ${stream.id}`);
      return input;
    },
    createAudioWorkletNode: (name) => {
      const node = { port: { onmessage: null }, connect: vi.fn(), disconnect: vi.fn(), name };
      nodes.push(node);
      return node;
    },
  };
  const getUserMedia = vi.fn(() => {
    log.push('getUserMedia');
    if (behaviour.media) return behaviour.media();
    const track = { stop: vi.fn(), onended: null, readyState: 'live' };
    tracks.push(track);
    return Promise.resolve({ id: `stream${tracks.length}`, getTracks: () => [track] } as never);
  });
  const contextCalls = vi.fn(() => {
    log.push('context');
    return Promise.resolve(context);
  });
  const options = {
    mediaDevices: () => ({ getUserMedia }),
    context: contextCalls,
    workletUrl: '/onset.js',
    startTimeoutMs: 50,
  };
  const setState = (state: string) => {
    raw.state = state;
    statechange.forEach((l) => l());
  };
  return { log, tracks, nodes, input, behaviour, options, getUserMedia, contextCalls, setState, statechange };
}

describe('createMicOnsetDriver', () => {
  it('asks for the raw-guitar mic and the context inside the tap, then wires the worklet', async () => {
    const audio = fakeAudio();
    const source = createMicOnsetSource(audio.options);
    const seen: Onset[] = [];
    source.onOnset((o) => seen.push(o));
    const started = source.start();
    // Synchronously, before any await: the iOS gesture rule.
    expect(audio.log).toEqual(['getUserMedia', 'context']);
    expect(audio.getUserMedia).toHaveBeenCalledWith(MIC_CONSTRAINTS);
    await started;
    expect(source.state).toBe('running');
    expect(audio.log).toEqual(['getUserMedia', 'context', 'addModule /onset.js', 'source stream1']);
    const node = audio.nodes[0]!;
    expect(node.name).toBe(ONSET_PROCESSOR);
    expect(audio.input.connect).toHaveBeenCalledWith(node);
    expect(node.connect).toHaveBeenCalledWith({ name: 'destination' });
    node.port.onmessage?.({ data: { time: 2.5, strength: 0.3 } } as MessageEvent<OnsetMessage>);
    expect(seen).toEqual([{ at: 2500, kind: 'mic', strength: 0.3 }]);
  });

  it('releases the mic but leaves the shared context running on stop, and loads the module once', async () => {
    const audio = fakeAudio();
    const source = createMicOnsetSource(audio.options);
    await source.start();
    source.stop();
    expect(audio.tracks[0]!.stop).toHaveBeenCalled();
    expect(audio.nodes[0]!.disconnect).toHaveBeenCalled();
    expect(audio.input.disconnect).toHaveBeenCalled();
    expect(audio.nodes[0]!.port.onmessage).toBeNull();
    expect(audio.statechange.size).toBe(0);
    await source.start();
    expect(audio.log.filter((l) => l.startsWith('addModule'))).toHaveLength(1);
    expect(audio.nodes).toHaveLength(2);
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['AbortError', 'failed'],
  ])('maps a %s from getUserMedia to %s', async (name, reason) => {
    const audio = fakeAudio();
    audio.behaviour.media = () => Promise.reject(domError(name));
    await expect(createMicOnsetSource(audio.options).start()).rejects.toMatchObject({ reason });
  });

  it('is unsupported without getUserMedia or an AudioWorklet', async () => {
    const none = createMicOnsetSource({ mediaDevices: () => undefined });
    await expect(none.start()).rejects.toMatchObject({ reason: 'unsupported' });
    const audio = fakeAudio();
    audio.behaviour.noWorklet = true;
    await expect(createMicOnsetSource(audio.options).start()).rejects.toMatchObject({
      reason: 'unsupported',
    });
    expect(audio.tracks[0]!.stop).toHaveBeenCalled();
  });

  it('fails, releasing the mic, when the worklet never loads', async () => {
    const audio = fakeAudio();
    audio.behaviour.addModule = () => new Promise(() => undefined);
    await expect(createMicOnsetSource(audio.options).start()).rejects.toMatchObject({
      reason: 'failed',
      message: expect.stringMatching(/timed out/),
    });
    expect(audio.tracks[0]!.stop).toHaveBeenCalled();
  });

  it('reports a track that ended before it was wired as lost', async () => {
    const audio = fakeAudio();
    audio.behaviour.media = () => {
      const track = { stop: vi.fn(), onended: null, readyState: 'ended' };
      audio.tracks.push(track);
      return Promise.resolve({ id: 's', getTracks: () => [track] } as never);
    };
    await expect(createMicOnsetSource(audio.options).start()).rejects.toMatchObject({ reason: 'lost' });
  });

  it('is lost when the mic is unplugged or audio is suspended', async () => {
    for (const lose of ['unplug', 'suspend'] as const) {
      const audio = fakeAudio();
      const source = createMicOnsetSource(audio.options);
      await source.start();
      if (lose === 'unplug') audio.tracks[0]!.onended?.();
      else audio.setState('suspended');
      expect(source.state).toBe('error');
      expect(source.error?.reason).toBe('lost');
      expect(audio.tracks[0]!.stop).toHaveBeenCalled();
    }
  });

  it('ignores a running context, and losses after a stop', async () => {
    const audio = fakeAudio();
    const driver = createMicOnsetDriver(audio.options);
    const fail = vi.fn();
    await driver.start(vi.fn(), fail);
    audio.setState('running');
    const ended = audio.tracks[0]!.onended;
    driver.stop();
    driver.stop();
    ended?.();
    expect(fail).not.toHaveBeenCalled();
  });

  it('wraps an unexpected error', async () => {
    const audio = fakeAudio();
    const source = createMicOnsetSource({
      ...audio.options,
      context: () => Promise.reject(new Error('no context')),
    });
    await expect(source.start()).rejects.toMatchObject({ reason: 'failed', message: 'no context' });
  });
});
