/**
 * The AudioWorklet half of the detector. It runs on the audio thread, so it is
 * bundled separately (`?worker&url` in `../detector.ts`) and keeps to the
 * worklet global scope: no DOM, no clock but the context's.
 */
import { createPitchAnalyzer } from './analyzer';
import { PITCH_PROCESSOR } from './protocol';

interface WorkletProcessor {
  readonly port: MessagePort;
}

// AudioWorkletGlobalScope; TypeScript's audioworklet lib can't sit beside DOM.
interface WorkletScope {
  AudioWorkletProcessor: new () => WorkletProcessor;
  registerProcessor(name: string, processor: new () => WorkletProcessor): void;
  readonly sampleRate: number;
  readonly currentTime: number;
}

const scope = globalThis as unknown as WorkletScope;

export class PitchProcessor extends scope.AudioWorkletProcessor {
  private readonly analyzer = createPitchAnalyzer(scope.sampleRate);

  process(inputs: Float32Array[][]): boolean {
    // Mono: the node downmixes its input to one channel.
    const channel = inputs[0]?.[0];
    if (channel) {
      for (const frame of this.analyzer.push(channel, scope.currentTime)) {
        this.port.postMessage(frame);
      }
    }
    return true;
  }
}

scope.registerProcessor(PITCH_PROCESSOR, PitchProcessor);
