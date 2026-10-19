/**
 * Design §9 input: the real pitch detector. getUserMedia feeds an AudioWorklet
 * running pitchy (`worklet/pitch-processor.ts`), whose {frequency, clarity}
 * frames go to `createPitchSource` for stable-note tracking.
 *
 * Nothing here touches the microphone until `PitchSource.start()`, which the
 * app calls only when the learner enables mic mode.
 */
import workletUrl from './worklet/pitch-processor.ts?worker&url';
import { DETECTOR_TRACKER } from './worklet/config';
import { PITCH_PROCESSOR, type PitchMessage } from './worklet/protocol';
import { createPitchSource, setPitchSourceFactory } from './source';
import { PitchSourceError, type PitchDriver, type PitchFrame } from './types';

/** The browser APIs the driver needs; injectable for tests. */
export interface DetectorGlobals {
  readonly mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
  readonly AudioContext?: typeof AudioContext;
  readonly AudioWorkletNode?: typeof AudioWorkletNode;
}

export interface DetectorOptions {
  /** Default: the browser's own. Read on every start. */
  globals?: () => DetectorGlobals;
  /** The worklet module; default the bundled `pitch-processor`. */
  workletUrl?: string;
}

/**
 * Raw guitar, not speech: browser voice processing smears pitch, and
 * automatic gain makes the decay of a note pump.
 */
export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
  video: false,
};

function browserGlobals(): DetectorGlobals {
  return {
    mediaDevices: globalThis.navigator?.mediaDevices,
    AudioContext: globalThis.AudioContext,
    AudioWorkletNode: globalThis.AudioWorkletNode,
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Maps a getUserMedia rejection to the source's error reasons. */
export function mediaError(err: unknown): PitchSourceError {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new PitchSourceError('denied', message(err));
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new PitchSourceError('no-device', message(err));
  }
  return new PitchSourceError('failed', message(err));
}

/** Turns a synchronous throw into a rejection. */
function attempt<T>(call: () => Promise<T>): Promise<T> {
  try {
    return call();
  } catch (err) {
    return Promise.reject(err);
  }
}

/** Settles to the error (or null) so a rejection nobody awaits yet isn't unhandled. */
function settle(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (err: unknown) => err ?? new Error('Unknown error'),
  );
}

interface Graph {
  context: AudioContext;
  stream: MediaStream;
  input: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
}

/** Releases the microphone and the audio thread. */
function release(context: AudioContext, stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
  void context.close().catch(() => undefined);
}

export function createWorkletPitchDriver(options: DetectorOptions = {}): PitchDriver {
  const url = options.workletUrl ?? workletUrl;
  let graph: Graph | null = null;

  return {
    start(emit: (frame: PitchFrame) => void) {
      const g = (options.globals ?? browserGlobals)();
      const { mediaDevices, AudioContext: Context, AudioWorkletNode: WorkletNode } = g;
      if (!mediaDevices?.getUserMedia || !Context || !WorkletNode) {
        return Promise.reject(
          new PitchSourceError('unsupported', 'This browser has no microphone or AudioWorklet'),
        );
      }

      // The context, the permission request and resume() all happen now, inside
      // the learner's tap: iOS grants the microphone and lets an AudioContext
      // run only within a user gesture.
      let context: AudioContext;
      try {
        context = new Context({ latencyHint: 'interactive' });
      } catch (err) {
        return Promise.reject(new PitchSourceError('failed', message(err)));
      }
      const media = attempt(() => mediaDevices.getUserMedia(MIC_CONSTRAINTS));
      const resumed = settle(attempt(() => context.resume()));
      const loaded = settle(attempt(() => context.audioWorklet.addModule(url)));

      return (async () => {
        let stream: MediaStream | null = null;
        try {
          stream = await media.catch((err: unknown) => {
            throw mediaError(err);
          });
          const loadError = await loaded;
          if (loadError) throw new PitchSourceError('failed', message(loadError));
          const resumeError = await resumed;
          if (resumeError) throw new PitchSourceError('failed', message(resumeError));

          const input = context.createMediaStreamSource(stream);
          const node = new WorkletNode(context, PITCH_PROCESSOR, {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            channelCount: 1,
            channelCountMode: 'explicit',
            channelInterpretation: 'speakers',
          });
          node.port.onmessage = ({ data }: MessageEvent<PitchMessage>) => {
            emit({ frequency: data.frequency, clarity: data.clarity, at: data.time * 1000 });
          };
          input.connect(node);
          // The node outputs silence; connecting it keeps every browser pulling it.
          node.connect(context.destination);
          graph = { context, stream, input, node };
        } catch (err) {
          release(context, stream);
          throw err instanceof PitchSourceError
            ? err
            : new PitchSourceError('failed', message(err));
        }
      })();
    },
    stop() {
      if (!graph) return;
      const { context, stream, input, node } = graph;
      graph = null;
      node.port.onmessage = null;
      input.disconnect();
      node.disconnect();
      release(context, stream);
    },
  };
}

/**
 * Makes the app's pitch source the real detector. Building the source is
 * lazy and asks for nothing; the permission prompt waits for `start()`.
 */
export function installPitchDetector(options: DetectorOptions = {}): void {
  setPitchSourceFactory(() =>
    createPitchSource(createWorkletPitchDriver(options), DETECTOR_TRACKER),
  );
}
