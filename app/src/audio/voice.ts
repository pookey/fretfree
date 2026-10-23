/**
 * The guitar (design §9): six strings, each playing a recorded nylon-guitar
 * note (M4-15, `samples.ts`) once `loadSamples` has decoded it, and until then
 * a Karplus–Strong note rendered into an `AudioBuffer` (`pluck.ts`) through a
 * soft lowpass. Both go through a gentle limiter into a master volume. Only
 * native buffer-source and gain nodes sound: no AudioWorklet, so nothing
 * depends on a blob URL that iOS Safari may refuse. It is built from the Tone
 * module passed in, so only the lazily loaded chunk ever touches Tone.
 */
import { Note } from 'tonal';
import { AUDIO } from './config';
import { midiToHz, renderPluck } from './pluck';
import { sampleFor, sampleNotes, velocityGain } from './samples';

type ToneModule = typeof import('tone');

export interface Guitar {
  /** Master level and mute for everything the guitar plays. */
  output: InstanceType<ToneModule['Volume']>;
  /** Sound `note` on string `voice` at audio-context `time` for `duration` seconds. */
  pluck(note: string, time: number, duration: number, voice: number, dynamics?: Dynamics): void;
  /** Damp every string quickly, as a palm would. */
  damp(time: number): void;
  /**
   * Fetch and decode every sample. A note whose sample fails stays on the
   * plucked voice. Later calls return the first one's promise.
   */
  loadSamples(fetchSample: (midi: number) => Promise<ArrayBuffer>): Promise<void>;
}

export interface Dynamics {
  /** 0–1: how hard the string is struck. Default 1. */
  velocity?: number;
  /** Gain on top, such as a chord's trim. Default 1. */
  level?: number;
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
  const limiter = new Tone.Compressor(AUDIO.limiter).connect(output);
  const tone = new Tone.Filter({ type: 'lowpass', frequency: AUDIO.toneHz, rolloff: -12 }).connect(
    limiter,
  );
  const strings: (Ringing | null)[] = Array.from({ length: AUDIO.voices }, () => null);
  /** Rendered notes by MIDI number, least recently played first. */
  const buffers = new Map<number, AudioBuffer>();
  /** Decoded samples by MIDI number. */
  const samples = new Map<number, AudioBuffer>();
  let loading: Promise<void> | null = null;

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
    pluck(note, time, duration, voice, dynamics = {}) {
      const midi = Note.midi(note);
      if (midi === null) return;
      const i = ((voice % strings.length) + strings.length) % strings.length;
      // A string sounds one note at a time: a new pluck damps the last.
      const last = strings[i];
      if (last) silence(last, time, DAMP_SECONDS);

      const source = context.createBufferSource();
      const gain = context.createGain();
      let level = (dynamics.level ?? 1) * velocityGain(dynamics.velocity ?? 1);
      let release: number = AUDIO.pluck.release;
      let end = time + duration;
      let stop = end + release;
      const choice = sampleFor(midi);
      const sample = samples.get(choice.midi);
      if (sample) {
        source.buffer = sample;
        source.playbackRate.value = choice.rate;
        level *= AUDIO.samples.gain;
        release = AUDIO.samples.release;
        // The recording ends on its own: fade out before it does.
        const length = sample.duration / choice.rate;
        end = Math.min(end, time + Math.max(0, length - release));
        stop = Math.min(end + release, time + length);
      } else {
        source.buffer = bufferFor(midi);
      }
      gain.gain.value = 0;
      gain.gain.setValueAtTime(level, time);
      gain.gain.setTargetAtTime(0, end, release / 4);
      source.connect(gain);
      // The lowpass only takes the edge off the synthesised pick.
      Tone.connect(gain, sample ? limiter : tone);
      const string: Ringing = { source, gain };
      strings[i] = string;
      source.onended = () => {
        gain.disconnect();
        if (strings[i] === string) strings[i] = null;
      };
      source.start(time);
      source.stop(stop);
    },
    damp(time) {
      for (const s of strings) if (s) silence(s, time, DAMP_SECONDS);
    },
    loadSamples(fetchSample) {
      return (loading ??= Promise.all(
        sampleNotes().map(async (m) => {
          try {
            samples.set(m, await context.decodeAudioData(await fetchSample(m)));
          } catch {
            /* That note stays on the plucked voice. */
          }
        }),
      ).then(() => undefined));
    },
  };
}
