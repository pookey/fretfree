/**
 * The mic onset source (design §12): getUserMedia feeds an AudioWorklet
 * running the spectral-flux detector (`worklet/onset-processor.ts`). It reuses
 * the M5 mic plumbing (raw-guitar constraints, error mapping) but runs on
 * Tone's AudioContext, not a context of its own, so onset times share the
 * metronome's clock with no mapping between them.
 *
 * Nothing touches the microphone until `start()`, which must be called from
 * the learner's tap (design §9: permission only when they enable the mic).
 */
import { loadTone, unlockAudio } from '../audio/audio';
import { MIC_CONSTRAINTS, mediaError } from '../mic/detector';
import { DETECTOR_DRIVER } from '../mic/worklet/config';
import { createOnsetSource, OnsetSourceError, type OnsetDriver, type OnsetSource } from './onsets';
import workletUrl from './worklet/onset-processor.ts?worker&url';
import { ONSET_PROCESSOR, type OnsetMessage } from './worklet/protocol';

interface Connectable {
  connect(destination: never): unknown;
  disconnect(): void;
}

/** As much of Tone's Context as the driver uses; injectable for tests. */
export interface OnsetContext {
  readonly rawContext: {
    readonly state: string;
    readonly destination: unknown;
    readonly audioWorklet?: { addModule(url: string): Promise<void> };
    addEventListener(type: 'statechange', listener: () => void): void;
    removeEventListener(type: 'statechange', listener: () => void): void;
  };
  createMediaStreamSource(stream: MediaStream): Connectable;
  createAudioWorkletNode(
    name: string,
    options: Partial<AudioWorkletNodeOptions>,
  ): Connectable & { port: { onmessage: ((e: MessageEvent<OnsetMessage>) => void) | null } };
}

export interface MicOnsetOptions {
  /** Default: the browser's. */
  mediaDevices?: () => Pick<MediaDevices, 'getUserMedia'> | undefined;
  /**
   * The context onsets are timed on. Default: Tone's, unlocked first. Called
   * synchronously from `start()`, inside the learner's tap.
   */
  context?: () => Promise<OnsetContext>;
  /** The worklet module; default the bundled `onset-processor`. */
  workletUrl?: string;
  /** Default: the pitch detector's (`DETECTOR_DRIVER.startTimeoutMs`). */
  startTimeoutMs?: number;
}

async function toneContext(): Promise<OnsetContext> {
  await unlockAudio();
  const Tone = await loadTone();
  return Tone.getContext() as unknown as OnsetContext;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Resolves or rejects with `promise`, or rejects after `ms`. */
function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Turns a synchronous throw into a rejection. */
function attempt<T>(call: () => Promise<T>): Promise<T> {
  try {
    return call();
  } catch (err) {
    return Promise.reject(err);
  }
}

interface Graph {
  context: OnsetContext;
  stream: MediaStream;
  input: Connectable;
  node: ReturnType<OnsetContext['createAudioWorkletNode']>;
  watch: () => void;
}

export function createMicOnsetDriver(options: MicOnsetOptions = {}): OnsetDriver {
  const url = options.workletUrl ?? workletUrl;
  const timeoutMs = options.startTimeoutMs ?? DETECTOR_DRIVER.startTimeoutMs;
  const loaded = new WeakSet<object>();
  let graph: Graph | null = null;

  const release = (g: Graph) => {
    g.context.rawContext.removeEventListener('statechange', g.watch);
    g.stream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    g.node.port.onmessage = null;
    g.input.disconnect();
    g.node.disconnect();
  };

  return {
    start(emit, fail) {
      const devices = (options.mediaDevices ?? (() => globalThis.navigator?.mediaDevices))();
      if (!devices?.getUserMedia) {
        return Promise.reject(
          new OnsetSourceError('unsupported', 'This browser has no microphone'),
        );
      }
      // Both now, inside the tap: iOS grants the mic and resumes audio only in a gesture.
      const media = attempt(() => devices.getUserMedia(MIC_CONSTRAINTS));
      const ready = attempt(options.context ?? toneContext);
      // A refused mic is reported first; don't leave this rejection unhandled meanwhile.
      ready.catch(() => undefined);

      return (async () => {
        let stream: MediaStream | null = null;
        try {
          stream = await media.catch((err: unknown) => {
            const e = mediaError(err);
            throw new OnsetSourceError(e.reason, e.message);
          });
          if (stream.getTracks().some((track) => track.readyState === 'ended')) {
            throw new OnsetSourceError('lost', 'The microphone was disconnected');
          }
          const context = await within(ready, timeoutMs, 'Starting audio');
          const raw = context.rawContext;
          if (!raw.audioWorklet) throw new OnsetSourceError('unsupported', 'No AudioWorklet');
          // Straight to the raw context: Tone's own loader keeps only its first module.
          if (!loaded.has(raw)) {
            await within(raw.audioWorklet.addModule(url), timeoutMs, 'Loading the onset worklet');
            loaded.add(raw);
          }
          const input = context.createMediaStreamSource(stream);
          const node = context.createAudioWorkletNode(ONSET_PROCESSOR, {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            channelCount: 1,
            channelCountMode: 'explicit',
            channelInterpretation: 'speakers',
          });
          node.port.onmessage = ({ data }) => {
            emit({ at: data.time * 1000, kind: 'mic', strength: data.strength });
          };
          input.connect(node as never);
          // The node outputs silence; connecting it keeps every browser pulling it.
          node.connect(raw.destination as never);
          const lost = (why: string) => {
            if (graph?.node === node) fail(new OnsetSourceError('lost', why));
          };
          const watch = () => {
            if (raw.state !== 'running') lost(`Audio is ${raw.state}`);
          };
          graph = { context, stream, input, node, watch };
          raw.addEventListener('statechange', watch);
          for (const track of stream.getTracks()) {
            track.onended = () => lost('The microphone was disconnected');
          }
        } catch (err) {
          stream?.getTracks().forEach((track) => track.stop());
          throw err instanceof OnsetSourceError
            ? err
            : new OnsetSourceError('failed', message(err));
        }
      })();
    },
    stop() {
      if (!graph) return;
      const g = graph;
      graph = null;
      // Tone's context stays open: the metronome and the guitar still play on it.
      release(g);
    },
  };
}

export function createMicOnsetSource(options: MicOnsetOptions = {}): OnsetSource {
  return createOnsetSource('mic', createMicOnsetDriver(options));
}
