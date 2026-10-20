import { afterEach, describe, expect, it, vi } from 'vitest';
import { pluck } from '../../mic/worklet/test-signals';
import { ONSET_PROCESSOR, type OnsetMessage } from './protocol';

interface Processor {
  port: { postMessage: (message: OnsetMessage) => void };
  process(inputs: Float32Array[][]): boolean;
}

/** Loads the processor module into a stand-in AudioWorkletGlobalScope. */
async function loadProcessor(sampleRate: number) {
  const registered = new Map<string, new () => Processor>();
  const scope = { currentTime: 0 };
  vi.stubGlobal('sampleRate', sampleRate);
  vi.stubGlobal(
    'AudioWorkletProcessor',
    class {
      readonly port = { postMessage: vi.fn() };
    },
  );
  vi.stubGlobal('registerProcessor', (name: string, ctor: new () => Processor) => {
    registered.set(name, ctor);
  });
  Object.defineProperty(globalThis, 'currentTime', {
    configurable: true,
    get: () => scope.currentTime,
  });
  vi.resetModules();
  await import('./onset-processor');
  return { registered, scope };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'currentTime');
});

describe('onset-processor', () => {
  it('registers under the shared name and posts onsets on the context clock', async () => {
    const { registered, scope } = await loadProcessor(48000);
    const processor = new (registered.get(ONSET_PROCESSOR)!)();
    const signal = new Float32Array(48000);
    signal.set(pluck({ frequency: 196, sampleRate: 48000, durationMs: 700, attackMs: 3 }), 14400);
    const start = 3;
    for (let i = 0; i + 128 <= signal.length; i += 128) {
      scope.currentTime = start + i / 48000;
      expect(processor.process([[signal.subarray(i, i + 128)]])).toBe(true);
    }
    const posted = vi.mocked(processor.port.postMessage).mock.calls.map(([m]) => m);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.time).toBeCloseTo(start + 0.3, 2);
  });

  it('keeps running with no input connected', async () => {
    const { registered } = await loadProcessor(44100);
    const processor = new (registered.get(ONSET_PROCESSOR)!)();
    expect(processor.process([])).toBe(true);
    expect(processor.process([[]])).toBe(true);
    expect(processor.port.postMessage).not.toHaveBeenCalled();
  });
});
