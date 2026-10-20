/**
 * The plucked guitar (design §9): six strings, each playing Karplus–Strong
 * notes rendered once into `AudioBuffer`s (`pluck.ts`), through a soft lowpass
 * into a master volume. Only native buffer-source and gain nodes sound: no
 * AudioWorklet, so nothing depends on a blob URL that iOS Safari may refuse.
 * It is built from the Tone module passed in, so only the lazily loaded chunk
 * ever touches Tone.
 */
import { Note } from 'tonal';
import { AUDIO } from './config';
import { midiToHz, renderPluck } from './pluck';

type ToneModule = typeof import('tone');

export interface Guitar {
  /** Master level and mute for everything the guitar plays. */
  output: InstanceType<ToneModule['Volume']>;
  /** Sound `note` on string `voice` at audio-context `time` for `duration` seconds. */
  pluck(note: string, time: number, duration: number, voice: number): void;
  /** Damp every string quickly, as a palm would. */
  damp(time: number): void;
}

/** How fast `damp`, or the next note on the same string, silences a string (seconds). */
const DAMP_SECONDS = 0.06;

interface Ringing {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Freeze a ramping parameter at `time`, so a new ramp starts from where it is. */
function hold(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
  } else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
}

/** Fade a string out over `seconds` from `time`, then stop it. */
function silence(string: Ringing, time: number, seconds: number): void {
  hold(string.gain.gain, time);
  string.gain.gain.setTargetAtTime(0, time, seconds / 4);
  try {
    string.source.stop(time + seconds);
  } catch {
    /* Already stopped. */
  }
}

export function createGuitar(Tone: ToneModule, rng: () => number = Math.random): Guitar {
  const context = Tone.getContext();
  const output = new Tone.Volume(0).toDestination();
  const tone = new Tone.Filter({ type: 'lowpass', frequency: AUDIO.toneHz, rolloff: -12 }).connect(
    output,
  );
  const strings: (Ringing | null)[] = Array.from({ length: AUDIO.voices }, () => null);
  /** Rendered notes by MIDI number, least recently played first. */
  const buffers = new Map<number, AudioBuffer>();

  const render = (midi: number): AudioBuffer => {
    const { seconds, t60, brightness, peak } = AUDIO.pluck;
    const samples = renderPluck({
      frequency: midiToHz(midi),
      sampleRate: context.sampleRate,
      seconds,
      t60,
      brightness,
      peak,
      rng,
    });
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  const bufferFor = (midi: number): AudioBuffer => {
    const buffer = buffers.get(midi) ?? render(midi);
    buffers.delete(midi);
    buffers.set(midi, buffer);
    if (buffers.size > AUDIO.cachedNotes) buffers.delete(buffers.keys().next().value!);
    return buffer;
  };

  return {
    output,
    pluck(note, time, duration, voice) {
      const midi = Note.midi(note);
      if (midi === null) return;
      const i = ((voice % strings.length) + strings.length) % strings.length;
      // A string sounds one note at a time: a new pluck damps the last.
      const last = strings[i];
      if (last) silence(last, time, DAMP_SECONDS);

      const source = context.createBufferSource();
      source.buffer = bufferFor(midi);
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.gain.setValueAtTime(1, time);
      gain.gain.setTargetAtTime(0, time + duration, AUDIO.pluck.release / 4);
      source.connect(gain);
      Tone.connect(gain, tone);
      const string: Ringing = { source, gain };
      strings[i] = string;
      source.onended = () => {
        gain.disconnect();
        if (strings[i] === string) strings[i] = null;
      };
      source.start(time);
      source.stop(time + duration + AUDIO.pluck.release);
    },
    damp(time) {
      for (const s of strings) if (s) silence(s, time, DAMP_SECONDS);
    },
  };
}
