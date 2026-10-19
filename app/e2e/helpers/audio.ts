import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __audioTap?: { contexts: number; level(): number };
  }
}

/**
 * Listen to what the app sends to the speakers. Every connection to an
 * AudioContext's destination is mirrored into an analyser, so a spec can tell
 * whether anything is sounding without knowing how the app builds its graph.
 * Call before the page loads.
 */
export async function tapAudioOutput(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect as (
      this: AudioNode,
      dest: AudioNode,
      ...rest: number[]
    ) => AudioNode;
    const taps = new Map<BaseAudioContext, AnalyserNode>();
    window.__audioTap = {
      contexts: 0,
      level() {
        let peak = 0;
        for (const analyser of taps.values()) {
          const frame = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(frame);
          for (const s of frame) peak = Math.max(peak, Math.abs(s));
        }
        return peak;
      },
    };
    AudioNode.prototype.connect = function (this: AudioNode, dest: AudioNode, ...rest: number[]) {
      if (dest instanceof AudioDestinationNode) {
        let analyser = taps.get(dest.context);
        if (!analyser) {
          analyser = dest.context.createAnalyser();
          analyser.fftSize = 2048;
          // A silent path to the speakers keeps the analyser pulled.
          const sink = dest.context.createGain();
          sink.gain.value = 0;
          connect.call(analyser, sink);
          connect.call(sink, dest);
          taps.set(dest.context, analyser);
          window.__audioTap!.contexts = taps.size;
        }
        connect.call(this, analyser);
      }
      return connect.call(this, dest, ...rest);
    } as typeof AudioNode.prototype.connect;
  });
}

/** How many audio contexts have connected to the speakers. */
export function audioContexts(page: Page): Promise<number> {
  return page.evaluate(() => window.__audioTap?.contexts ?? 0);
}

/** The loudest sample in the analyser's current frame, 0–1. */
export function audioLevel(page: Page): Promise<number> {
  return page.evaluate(() => window.__audioTap?.level() ?? 0);
}
