/**
 * Minimal note playback (design §9). Tone.js is loaded lazily so it stays out
 * of the first-load bundle, and the AudioContext is unlocked on the first tap
 * (an iOS requirement).
 */

type ToneModule = typeof import('tone');
type Synth = import('tone').PolySynth;

let tonePromise: Promise<ToneModule> | null = null;
let synth: Synth | null = null;
let unlocked = false;

export function loadTone(): Promise<ToneModule> {
  return (tonePromise ??= import('tone'));
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export async function unlockAudio(): Promise<void> {
  if (unlocked) return;
  const Tone = await loadTone();
  await Tone.start();
  unlocked = true;
}

/** Unlock audio on the first pointer or key press anywhere in the app. */
export function installAudioUnlock(
  target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document,
) {
  const handler = () => {
    target.removeEventListener('pointerdown', handler, true);
    target.removeEventListener('keydown', handler, true);
    void unlockAudio().catch(() => {
      /* Audio stays silent if the browser refuses; the app still works. */
    });
  };
  target.addEventListener('pointerdown', handler, true);
  target.addEventListener('keydown', handler, true);
  return handler;
}

async function getSynth(): Promise<Synth> {
  if (synth) return synth;
  const Tone = await loadTone();
  // A plucked-string-like envelope on a polyphonic triangle synth.
  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle8' },
    envelope: { attack: 0.004, decay: 0.6, sustain: 0.08, release: 0.8 },
  }).toDestination();
  return synth;
}

export interface PlayOptions {
  /** 0–1. */
  volume?: number;
  muted?: boolean;
  /** Seconds between successive notes; 0 plays them together. */
  gap?: number;
  duration?: number;
}

/** Linear 0–1 volume to decibels for Tone. */
export function volumeToDb(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v === 0 ? -Infinity : 20 * Math.log10(v);
}

export async function playNotes(notes: readonly string[], opts: PlayOptions = {}): Promise<void> {
  if (opts.muted || notes.length === 0 || !unlocked) return;
  const Tone = await loadTone();
  const s = await getSynth();
  s.volume.value = volumeToDb(opts.volume ?? 0.8);
  const now = Tone.now();
  const gap = opts.gap ?? 0.45;
  notes.forEach((n, i) => s.triggerAttackRelease(n, opts.duration ?? 0.9, now + i * gap));
}
