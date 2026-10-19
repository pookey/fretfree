/**
 * Audio output (design §9): a plucked guitar for single notes, strummed
 * chords and whole progressions on the Tone Transport, with a master volume
 * and silent mode. Tone.js is loaded lazily so it stays out of the first-load
 * bundle, and the AudioContext is unlocked on a tap (an iOS requirement).
 */
import { AUDIO } from './config';
import {
  beatSeconds,
  planProgression,
  type ProgressionChord,
  type ProgressionTiming,
} from './progression';
import { strumHits, type StrumOptions } from './strum';
import { createGuitar, type Guitar } from './voice';

export type { ProgressionChord, StrumPattern, StrumPatternName } from './progression';
export { STRUM_PATTERNS } from './progression';
export type { StrumDirection } from './strum';

type ToneModule = typeof import('tone');

let tonePromise: Promise<ToneModule> | null = null;
let toneModule: ToneModule | null = null;
let unlockPromise: Promise<void> | null = null;
let unlocked = false;
let guitar: Guitar | null = null;
let nextVoice = 0;
let output: AudioOutput = { volume: AUDIO.defaultVolume, muted: false };
let current: Playback | null = null;
/** Bumped by every start and stop, so a start still waiting on `ready` can tell it was overtaken. */
let generation = 0;

export function loadTone(): Promise<ToneModule> {
  return (tonePromise ??= import('tone').then((Tone) => (toneModule = Tone)));
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export function unlockAudio(): Promise<void> {
  if (unlocked) return Promise.resolve();
  if (unlockPromise) return unlockPromise;
  // Once Tone is loaded, resume inside the gesture itself: Safari needs that.
  const start = toneModule ? toneModule.start() : loadTone().then((Tone) => Tone.start());
  return (unlockPromise = start
    .then(() => {
      unlocked = true;
    })
    .finally(() => {
      unlockPromise = null;
    }));
}

/**
 * Unlock audio on a pointer or key press anywhere in the app. It stays
 * installed: iOS suspends the context when the app is backgrounded, and the
 * next tap resumes it from inside the gesture, where Safari allows it.
 */
export function installAudioUnlock(
  target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document,
) {
  const handler = () => {
    if (toneModule) {
      if (toneModule.getContext().state === 'running') return;
      unlocked = false;
    }
    void unlockAudio().catch(() => {
      /* Audio stays silent if the browser refuses; the app still works. */
    });
  };
  target.addEventListener('pointerdown', handler, true);
  target.addEventListener('keydown', handler, true);
  return handler;
}

export interface AudioOutput {
  /** 0–1. */
  volume: number;
  /** Silent mode: nothing sounds. A progression still runs, so its chord cues still fire. */
  muted: boolean;
}

/** Linear 0–1 volume to decibels for Tone. */
export function volumeToDb(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v === 0 ? -Infinity : 20 * Math.log10(v);
}

export function getAudioOutput(): AudioOutput {
  return output;
}

/** Change the master volume or silent mode. It applies at once, mid-progression too. */
export function setAudioOutput(next: Partial<AudioOutput>): void {
  output = { ...output, ...next };
  if (!guitar) return;
  guitar.output.volume.value = volumeToDb(output.volume);
  guitar.output.mute = output.muted;
}

/** Anything shaped like the app store: the output follows `soundOn` and `volume`. */
export interface SoundSettingsSource {
  getState(): { settings: { soundOn: boolean; volume: number } };
  subscribe(
    listener: (state: { settings: { soundOn: boolean; volume: number } }) => void,
  ): () => void;
}

/** Keep the master output in step with the learner's sound settings. Returns an unsubscribe. */
export function syncAudioOutput(source: SoundSettingsSource): () => void {
  let last: { soundOn: boolean; volume: number } | null = null;
  const apply = ({ settings }: { settings: { soundOn: boolean; volume: number } }) => {
    if (last && last.soundOn === settings.soundOn && last.volume === settings.volume) return;
    last = { soundOn: settings.soundOn, volume: settings.volume };
    setAudioOutput({ volume: settings.volume, muted: !settings.soundOn });
  };
  apply(source.getState());
  return source.subscribe(apply);
}

interface SoundOptions {
  /** 0–1. Sets the master volume, as the settings do. */
  volume?: number;
  /** Silence this call. Silent mode (`setAudioOutput`) silences every call. */
  muted?: boolean;
}

/** Tone and the guitar, once the context is unlocked; `null` while it isn't. */
async function ready(opts: SoundOptions): Promise<{ Tone: ToneModule; guitar: Guitar } | null> {
  // The first tap starts the unlock and may also be the tap that plays a note.
  if (!unlocked && unlockPromise) await unlockPromise.catch(() => undefined);
  if (!unlocked) return null;
  const Tone = await loadTone();
  guitar ??= createGuitar(Tone);
  setAudioOutput(opts.volume === undefined ? {} : { volume: opts.volume });
  return { Tone, guitar };
}

export interface PlayOptions extends SoundOptions {
  /** Seconds between successive notes; 0 plays them together. */
  gap?: number;
  /** Seconds each note rings before release. */
  duration?: number;
}

/** Pluck notes one after another (or together, with `gap: 0`). */
export async function playNotes(notes: readonly string[], opts: PlayOptions = {}): Promise<void> {
  if (opts.muted || output.muted || notes.length === 0) return;
  const audio = await ready(opts);
  if (!audio) return;
  const now = audio.Tone.now();
  const gap = opts.gap ?? AUDIO.notes.gap;
  const duration = opts.duration ?? AUDIO.notes.duration;
  notes.forEach((n, i) => {
    // Notes played together need a string each; a melody moves across strings.
    const voice = gap === 0 ? i : nextVoice++;
    audio.guitar.pluck(n, now + i * gap, duration, voice);
  });
}

export interface StrumChordOptions extends SoundOptions, StrumOptions {
  /** Seconds the chord rings before release. */
  duration?: number;
}

/** Strum a chord: a down-stroke runs low to high, an up-stroke catches the top strings. */
export async function strum(notes: readonly string[], opts: StrumChordOptions = {}): Promise<void> {
  if (opts.muted || output.muted || notes.length === 0) return;
  const audio = await ready(opts);
  if (!audio) return;
  const now = audio.Tone.now();
  const duration = opts.duration ?? AUDIO.strum.duration;
  for (const hit of strumHits(notes, opts)) {
    audio.guitar.pluck(hit.note, now + hit.offset, duration, hit.voice);
  }
}

export interface ProgressionOptions
  extends ProgressionTiming, Omit<StrumOptions, 'direction'>, Pick<SoundOptions, 'volume'> {
  bpm?: number;
  /** Repeat until stopped. */
  loop?: boolean;
  /** Called (on an animation frame) as each chord starts, rests included. */
  onChord?: (index: number) => void;
  /** Called once when the progression ends or is stopped. */
  onEnd?: () => void;
}

export interface Playback {
  /** False when audio isn't unlocked yet, or there was nothing to play. */
  started: boolean;
  stop(): void;
  /** Settles when the progression ends or is stopped. */
  done: Promise<void>;
}

const NOT_STARTED: Playback = { started: false, stop: () => undefined, done: Promise.resolve() };

/** Stop the playing progression, if any, cancel one still starting, and damp every string. */
export function stopAudio(): void {
  generation++;
  current?.stop();
  if (guitar && toneModule) guitar.damp(toneModule.now());
}

/**
 * Play a chord progression on the Tone Transport, strummed in a pattern.
 * Starting one stops the one before. Times are in Transport ticks, so the
 * strokes stay on the beat however the clock jitters.
 */
export async function playProgression(
  chords: readonly ProgressionChord[],
  opts: ProgressionOptions = {},
): Promise<Playback> {
  const plan = planProgression(chords, opts);
  const bpm = opts.bpm ?? AUDIO.progression.bpm;
  beatSeconds(bpm); // Validates the tempo before anything starts.
  const mine = ++generation;
  current?.stop();
  if (plan.totalBeats === 0) return NOT_STARTED;
  const audio = await ready(opts);
  // A later start or a stop while this one waited (on the unlock, say) wins.
  if (!audio || mine !== generation) return NOT_STARTED;
  const { Tone, guitar: g } = audio;
  const transport = Tone.getTransport();
  const draw = Tone.getDraw();
  const at = (beat: number) => `${Math.round(beat * transport.PPQ)}i`;
  const strumOpts = { gap: opts.gap, upStrings: opts.upStrings };

  let finished = false;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  transport.stop();
  transport.position = 0;
  transport.bpm.value = bpm;
  const ids: number[] = [];
  for (const e of plan.events) {
    const notes = chords[e.chord]?.notes ?? [];
    ids.push(
      transport.schedule((time) => {
        const ring = e.length * beatSeconds(transport.bpm.value);
        for (const hit of strumHits(notes, { ...strumOpts, direction: e.direction })) {
          g.pluck(hit.note, time + hit.offset, ring, hit.voice);
        }
      }, at(e.beat)),
    );
  }
  plan.chordStarts.forEach((beat, i) => {
    ids.push(
      transport.schedule(
        // The cue waits for an animation frame, by which time the progression may have stopped.
        (time) =>
          draw.schedule(() => {
            if (!finished) opts.onChord?.(i);
          }, time),
        at(beat),
      ),
    );
  });

  /** Release the Transport and settle `done`. False if it had already finished. */
  const finish = (damp: boolean, time?: number) => {
    if (finished) return false;
    finished = true;
    for (const id of ids) transport.clear(id);
    transport.stop(time);
    transport.loop = false;
    // Damping cancels the resonance of strokes the Transport has already queued
    // ahead of the audio clock, so nothing rings on after a stop.
    if (damp) g.damp(Tone.now());
    if (current === playback) current = null;
    resolve();
    return true;
  };
  const playback: Playback = {
    started: true,
    stop: () => {
      if (finish(true)) opts.onEnd?.();
    },
    done,
  };

  if (opts.loop) {
    transport.loopStart = 0;
    transport.loopEnd = at(plan.totalBeats);
    transport.loop = true;
  } else {
    transport.loop = false;
    // The Transport is released on its own clock, which keeps running in a
    // hidden tab; only the UI's `onEnd` waits for an animation frame.
    ids.push(
      transport.schedule((time) => {
        if (finish(false, time)) draw.schedule(() => opts.onEnd?.(), time);
      }, at(plan.totalBeats)),
    );
  }
  current = playback;
  transport.start(`+${AUDIO.progression.leadIn}`);
  return playback;
}
