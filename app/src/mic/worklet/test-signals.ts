/**
 * Synthetic guitar-like signals for the detector's tests: a plucked string is
 * a stack of slightly sharp harmonics that decay at different rates, struck
 * with a noisy pick transient. Deterministic for a given `seed`.
 */

export interface PluckOptions {
  /** Fundamental, in Hz. */
  frequency: number;
  sampleRate: number;
  durationMs: number;
  /** Relative amplitude of harmonics 1, 2, 3, …; default a bright pluck. */
  harmonics?: readonly number[];
  /** String inharmonicity B: harmonic h sounds at h·f·√(1 + B·h²). */
  inharmonicity?: number;
  /** Fundamental's decay time constant, in ms; harmonic h decays h× faster. 0 = no decay. */
  decayMs?: number;
  /** Peak amplitude (full scale = 1). */
  amplitude?: number;
  /** White noise RMS, relative to full scale. */
  noise?: number;
  /** Length of the noisy pick transient, in ms. */
  attackMs?: number;
  /** Vibrato depth, in cents, at `vibratoHz`. */
  vibratoCents?: number;
  vibratoHz?: number;
  /** Extra gain for harmonic `h` (1-based) at `ms`, e.g. to drop the fundamental out. */
  gain?: (h: number, ms: number) => number;
  seed?: number;
}

export const BRIGHT = [1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1, 0.05] as const;
/** A thin fundamental under a loud 2nd harmonic: the classic octave-error trap. */
export const WEAK_FUNDAMENTAL = [0.25, 1, 0.6, 0.45, 0.3, 0.2] as const;

/** Mulberry32: a tiny seeded PRNG. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pluck(opts: PluckOptions): Float32Array {
  const {
    frequency,
    sampleRate,
    durationMs,
    harmonics = BRIGHT,
    inharmonicity = 0.0001,
    decayMs = 1500,
    amplitude = 0.5,
    noise = 0,
    attackMs = 0,
    vibratoCents = 0,
    vibratoHz = 5.5,
    gain,
    seed = 1,
  } = opts;
  const rng = seededRandom(seed);
  const n = Math.round((sampleRate * durationMs) / 1000);
  const out = new Float32Array(n);
  const total = harmonics.reduce((sum, a) => sum + a, 0);
  const phases = harmonics.map(() => rng() * 2 * Math.PI);
  const attack = Math.round((sampleRate * attackMs) / 1000);
  // Integrate the instantaneous frequency so vibrato stays phase-continuous.
  let cycles = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    const bend = 2 ** ((vibratoCents * Math.sin(2 * Math.PI * vibratoHz * t)) / 1200);
    cycles += (frequency * bend) / sampleRate;
    let sample = 0;
    harmonics.forEach((a, k) => {
      const h = k + 1;
      const stretch = h * Math.sqrt(1 + inharmonicity * h * h);
      const envelope = decayMs > 0 ? Math.exp((-t * 1000 * h) / decayMs) : 1;
      const extra = gain ? gain(h, t * 1000) : 1;
      sample +=
        a * extra * envelope * Math.sin(2 * Math.PI * stretch * cycles + (phases[k] as number));
    });
    sample = (amplitude * sample) / total;
    if (i < attack) sample += amplitude * (rng() * 2 - 1) * (1 - i / attack);
    if (noise > 0) sample += noise * gaussian(rng);
    out[i] = sample;
  }
  return out;
}

export function whiteNoise(sampleRate: number, durationMs: number, rms: number, seed = 1) {
  const rng = seededRandom(seed);
  const out = new Float32Array(Math.round((sampleRate * durationMs) / 1000));
  for (let i = 0; i < out.length; i += 1) out[i] = rms * gaussian(rng);
  return out;
}

export function concat(...parts: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Box–Muller. */
function gaussian(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}
