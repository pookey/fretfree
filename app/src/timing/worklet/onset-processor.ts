/**
 * The AudioWorklet half of the mic onset source. It runs on the audio thread,
 * so it is bundled separately (`?worker&url` in `../mic-onsets.ts`) and keeps
 * to the worklet global scope: no DOM, no clock but the context's.
 */
import { createOnsetDetector } from './onset-detector';
import { ONSET_PROCESSOR } from './protocol';

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

export class OnsetProcessor extends scope.AudioWorkletProcessor {
  private readonly detector = createOnsetDetector(scope.sampleRate);

  process(inputs: Float32Array[][]): boolean {
    // Mono: the node downmixes its input to one channel.
    const channel = inputs[0]?.[0];
    if (channel) {
      for (const onset of this.detector.push(channel, scope.currentTime)) {
        this.port.postMessage(onset);
      }
    }
    return true;
  }
}

scope.registerProcessor(ONSET_PROCESSOR, OnsetProcessor);
