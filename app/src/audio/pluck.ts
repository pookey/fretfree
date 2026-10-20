/**
 * Pure Karplus–Strong synthesis (design §9): one plucked string rendered into
 * samples, so the guitar plays plain `AudioBuffer`s. No Web Audio here, and no
 * AudioWorklet anywhere: iOS Safari can refuse the blob URL a worklet loads
 * from, which left the old worklet-based pluck silent (M4-13).
 */

export interface PluckSpec {
  /** Hz. */
  frequency: number;
  /** Samples per second of the context that plays it. */
  sampleRate: number;
  /** Length of the rendered note. */
  seconds: number;
  /** Seconds for the fundamental to fall by 60 dB. Longer rings longer. */
  t60: number;
  /** 0–1: how much of the pick's noise burst gets through. Lower is darker and rounder. */
  brightness: number;
  /** Peak level of the rendered note, 0–1. */
  peak: number;
  /** Uniform in [0, 1), for the pick's noise burst. */
  rng: () => number;
}

/** Seconds of fade at the very end, so a note cut by the buffer's end doesn't click. */
const TAIL_FADE = 0.05;

function check(ok: boolean, what: string): void {
  if (!ok) throw new RangeError(what);
}

/**
 * Render one plucked note. A delay line one period long is filled with a
 * filtered noise burst and fed back through a two-point average (the string's
 * damping), a first-order allpass that tunes the fractional part of the period,
 * and a loss that sets the ring time.
 */
export function renderPluck(spec: PluckSpec): Float32Array {
  const { frequency, sampleRate, seconds, t60, brightness, peak, rng } = spec;
  check(sampleRate > 0, 'sampleRate must be positive');
  check(
    frequency > 0 && frequency < sampleRate / 4,
    'frequency must be below a quarter of sampleRate',
  );
  check(seconds > 0 && t60 > 0, 'seconds and t60 must be positive');
  check(brightness > 0 && brightness <= 1, 'brightness must be in (0, 1]');
  check(peak > 0 && peak <= 1, 'peak must be in (0, 1]');

  // Loop delay = n samples + 0.5 (the average) + d (the allpass) = one period.
  const period = sampleRate / frequency;
  let n = Math.floor(period - 0.5);
  let d = period - 0.5 - n;
  // An allpass tunes best with a delay between about 0.1 and 1.1 samples.
  if (d < 0.1) {
    n -= 1;
    d += 1;
  }
  const c = (1 - d) / (1 + d);
  // Loss per trip round the loop, so the fundamental falls 60 dB in t60.
  const loss = Math.pow(10, -3 / (t60 * frequency));

  // The pick: a noise burst, lowpassed for brightness, with its DC removed.
  const line = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += brightness * (rng() * 2 - 1 - lp);
    line[i] = lp;
  }
  const mean = line.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) line[i]! -= mean;

  const length = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(length);
  let at = 0;
  let prev = 0;
  let apIn = 0;
  let apOut = 0;
  let max = 0;
  for (let i = 0; i < length; i++) {
    const y = line[at]!;
    out[i] = y;
    max = Math.max(max, Math.abs(y));
    const avg = 0.5 * (y + prev);
    prev = y;
    apOut = c * avg + apIn - c * apOut;
    apIn = avg;
    line[at] = loss * apOut;
    at = at + 1 === n ? 0 : at + 1;
  }

  const gain = max > 0 ? peak / max : 0;
  const fade = Math.min(length, Math.round(TAIL_FADE * sampleRate));
  for (let i = 0; i < length; i++) {
    const left = length - i;
    out[i]! *= left <= fade ? (gain * (left - 1)) / fade : gain;
  }
  return out;
}

/** Hz of a MIDI note number (A4 = 69 = 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
