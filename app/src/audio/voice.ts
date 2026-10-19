/**
 * The plucked guitar (design §9): six Karplus–Strong voices, one per string,
 * through a soft lowpass into a master volume. It is built from the Tone
 * module passed in, so only the lazily loaded chunk ever touches Tone.
 */
import { AUDIO } from './config';

type ToneModule = typeof import('tone');

export interface Guitar {
  /** Master level and mute for everything the guitar plays. */
  output: InstanceType<ToneModule['Volume']>;
  /** Sound `note` on string `voice` at audio-context `time` for `duration` seconds. */
  pluck(note: string, time: number, duration: number, voice: number): void;
  /** Damp every string quickly, as a palm would. */
  damp(time: number): void;
}

/** How fast `damp` silences a string (seconds). */
const DAMP_SECONDS = 0.06;

export function createGuitar(Tone: ToneModule): Guitar {
  const output = new Tone.Volume(0).toDestination();
  const tone = new Tone.Filter({ type: 'lowpass', frequency: AUDIO.toneHz, rolloff: -12 }).connect(
    output,
  );
  const voices = Array.from({ length: AUDIO.voices }, () =>
    new Tone.PluckSynth({ ...AUDIO.pluck }).connect(tone),
  );
  return {
    output,
    pluck(note, time, duration, voice) {
      const v = voices[((voice % voices.length) + voices.length) % voices.length];
      v?.triggerAttackRelease(note, duration, time);
    },
    damp(time) {
      for (const v of voices) {
        const ring = v.release;
        v.release = DAMP_SECONDS;
        v.triggerRelease(time);
        v.release = ring;
      }
    },
  };
}
