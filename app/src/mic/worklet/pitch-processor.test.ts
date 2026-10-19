import { afterEach, describe, expect, it, vi } from 'vitest';
import { PITCH_PROCESSOR, type PitchMessage } from './protocol';
import { pluck } from './test-signals';

interface Processor {
  port: { postMessage: (message: PitchMessage) => void };
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
  await import('./pitch-processor');
  return { registered, scope };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'currentTime');
});

describe('pitch-processor', () => {
  it('registers under the shared name and posts frames on the context clock', async () => {
    const { registered, scope } = await loadProcessor(48000);
    const Ctor = registered.get(PITCH_PROCESSOR);
    expect(Ctor).toBeDefined();
    const processor = new Ctor!();

    const signal = pluck({ frequency: 196, sampleRate: 48000, durationMs: 200 });
    const start = 12.5;
    for (let i = 0; i + 128 <= signal.length; i += 128) {
      scope.currentTime = start + i / 48000;
      expect(processor.process([[signal.subarray(i, i + 128)]])).toBe(true);
    }
    const posted = vi.mocked(processor.port.postMessage).mock.calls.map(([m]) => m);
    expect(posted.length).toBeGreaterThan(5);
    expect(posted[0]?.time).toBeCloseTo(start + 2048 / 48000, 6);
    expect(posted.every((m) => Math.abs(m.frequency - 196) < 1 && m.clarity > 0.9)).toBe(true);
  });

  it('keeps running with no input connected', async () => {
    const { registered } = await loadProcessor(44100);
    const processor = new (registered.get(PITCH_PROCESSOR)!)();
    expect(processor.process([])).toBe(true);
    expect(processor.process([[]])).toBe(true);
    expect(processor.port.postMessage).not.toHaveBeenCalled();
  });
});
