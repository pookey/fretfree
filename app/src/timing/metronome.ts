/**
 * The metronome (design §12): clicks on the Tone Transport, accented per
 * meter, with a count-in, live tempo changes and click fading. Tone loads
 * lazily through `audio/audio.ts`, and the Transport is claimed from the
 * progression player (`audio/transport.ts`), so the two never fight over it.
 *
 * The click grid's tempo map (`tempo.ts`) is the source of truth: it sets the
 * Transport's tempo, and `timeAtPulse` reads target times back from it for
 * grading. A tempo change lands on the first whole pulse the Transport hasn't
 * scheduled yet, so the grid never jumps.
 */
import { getAudioOutput, isAudioUnlocked, loadTone, unlockAudio, volumeToDb } from '../audio/audio';
import { claimTransport, type TransportLease } from '../audio/transport';
import { NO_FADE, isAudible, type ClickFade } from './fade';
import type { Accent, ClickMeter } from './meter';
import type { Unsubscribe } from './onsets';
import {
  changeTempo,
  checkBpm,
  checkLayout,
  clickAt,
  countInPulses,
  pulseAtTime,
  tempoMap,
  timeAtPulse,
  type ClickInfo,
  type ClickLayout,
  type TempoMap,
} from './tempo';

type ToneModule = typeof import('tone');

/** One click as scheduled: when it sounds and whether it is heard. */
export interface Click extends ClickInfo {
  /** When it sounds, in audio-clock ms. */
  readonly at: number;
  /** False for a click the fade dropped: it is on the grid, but silent. */
  readonly audible: boolean;
}

/** Which clicks sound: a fade step, or any rule over the click. */
export type ClickRule = ClickFade | ((click: ClickInfo) => boolean);

export interface MetronomeOptions {
  meter: ClickMeter;
  /** Pulses per minute. */
  bpm: number;
  /** Clicks per pulse, 1–4. Default 1. */
  subdivide?: number;
  /** Bars of count-in. Default 1. */
  countInBars?: number;
  /** Default: every click sounds. */
  fade?: ClickRule;
}

export interface Metronome {
  readonly running: boolean;
  /** The current run's grid; `null` when stopped. */
  readonly layout: ClickLayout | null;
  /** The current run's tempo map; empty when stopped. */
  readonly tempo: TempoMap;
  /**
   * Starts a run, stopping any progression. Call it from a tap: it unlocks
   * audio. False if audio stays locked, or a later start or a stop won.
   */
  start(options: MetronomeOptions): Promise<boolean>;
  stop(): void;
  /** Change tempo from the next unscheduled pulse; returns that pulse, or `null` when stopped. */
  setTempo(bpm: number): number | null;
  /** Change which clicks sound, from the next scheduled click. */
  setFade(rule: ClickRule): void;
  /** When `pulse` of the current run sounds, in audio-clock ms; `null` when stopped. */
  timeAtPulse(pulse: number): number | null;
  /** The pulse sounding at audio-clock `ms`; `null` when stopped. */
  pulseAtTime(ms: number): number | null;
  /** Each click as the Transport schedules it, ahead of time; `at` is when it sounds. */
  onClick(listener: (click: Click) => void): Unsubscribe;
  /** Each click on the animation frame it sounds on: for beat lights. */
  onBeat(listener: (click: Click) => void): Unsubscribe;
  /** The run ended: `stop()`, or the Transport was claimed by something else. */
  onStop(listener: () => void): Unsubscribe;
}

/** Pitch (Hz) and velocity of each accent: a bright tick, loudest on the bar. */
export const CLICK_VOICE: Record<Accent, { hz: number; velocity: number }> = {
  bar: { hz: 1568, velocity: 1 },
  group: { hz: 1175, velocity: 0.8 },
  pulse: { hz: 880, velocity: 0.6 },
  sub: { hz: 660, velocity: 0.35 },
};

/** Seconds a click rings. */
const CLICK_SECONDS = 0.03;
/** Seconds after the scheduler's horizon that the first click (or a tempo change) lands. */
const MARGIN_SECONDS = 0.05;

function ruleOf(rule: ClickRule): (click: ClickInfo) => boolean {
  return typeof rule === 'function' ? rule : (click) => isAudible(click, rule);
}

function listeners<T>() {
  const set = new Set<(value: T) => void>();
  return {
    add(listener: (value: T) => void): Unsubscribe {
      set.add(listener);
      return () => set.delete(listener);
    },
    emit(value: T) {
      set.forEach((l) => l(value));
    },
  };
}

interface ClickSynth {
  play(accent: Accent, time: number): void;
}

function createClickSynth(Tone: ToneModule): ClickSynth {
  const out = new Tone.Volume(0).toDestination();
  const synth = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: CLICK_SECONDS, sustain: 0, release: 0.01 },
  }).connect(out);
  return {
    play(accent, time) {
      const { volume, muted } = getAudioOutput();
      if (muted) return;
      out.volume.value = volumeToDb(volume);
      const v = CLICK_VOICE[accent];
      synth.triggerAttackRelease(v.hz, CLICK_SECONDS, time, v.velocity);
    },
  };
}

interface Run {
  Tone: ToneModule;
  layout: ClickLayout;
  map: TempoMap;
  lease: TransportLease;
  repeat: number;
}

export function createMetronome(): Metronome {
  const clicks = listeners<Click>();
  const beats = listeners<Click>();
  const stops = listeners<void>();
  let run: Run | null = null;
  let audible = ruleOf(NO_FADE);
  let synth: ClickSynth | null = null;
  /** Bumped by every start and stop, so a start still unlocking can tell it was overtaken. */
  let generation = 0;

  const end = () => {
    if (!run) return;
    const { Tone, lease, repeat } = run;
    run = null;
    const transport = Tone.getTransport();
    transport.clear(repeat);
    transport.stop();
    lease.release();
    stops.emit();
  };

  const metronome: Metronome = {
    get running() {
      return run !== null;
    },
    get layout() {
      return run?.layout ?? null;
    },
    get tempo() {
      return run?.map ?? [];
    },
    async start(options) {
      const layout = checkLayout({
        meter: options.meter,
        subdivide: options.subdivide ?? 1,
        countInBars: options.countInBars ?? 1,
      });
      const bpm = checkBpm(options.bpm);
      const mine = ++generation;
      end();
      if (!isAudioUnlocked()) await unlockAudio().catch(() => undefined);
      if (!isAudioUnlocked() || mine !== generation) return false;
      const Tone = await loadTone();
      if (mine !== generation) return false;
      synth ??= createClickSynth(Tone);
      const voice = synth;
      audible = ruleOf(options.fade ?? NO_FADE);

      const lease = claimTransport('metronome', () => end());
      const transport = Tone.getTransport();
      const draw = Tone.getDraw();
      transport.stop();
      transport.loop = false;
      transport.position = 0;
      transport.bpm.cancelScheduledValues(0);
      transport.bpm.value = bpm;
      const startAt = Tone.now() + MARGIN_SECONDS;
      const map = tempoMap(bpm, startAt * 1000, -countInPulses(layout));
      let index = 0;
      const repeat = transport.scheduleRepeat(
        (time) => {
          const info = clickAt(layout, index);
          index += 1;
          const click: Click = { ...info, at: time * 1000, audible: audible(info) };
          if (click.audible) voice.play(click.accent, time);
          clicks.emit(click);
          draw.schedule(() => {
            if (run?.repeat === repeat) beats.emit(click);
          }, time);
        },
        `${Math.round(transport.PPQ / layout.subdivide)}i`,
        0,
      );
      run = { Tone, layout, map, lease, repeat };
      transport.start(startAt);
      return true;
    },
    stop() {
      generation += 1;
      end();
    },
    setTempo(bpm) {
      checkBpm(bpm);
      if (!run) return null;
      const { Tone } = run;
      // Tone.now() is the scheduler's horizon: clicks before it are already queued.
      const horizon = (Tone.now() + MARGIN_SECONDS) * 1000;
      const pulse = Math.max(run.map[0]!.pulse, Math.ceil(pulseAtTime(run.map, horizon)));
      run.map = changeTempo(run.map, pulse, bpm);
      Tone.getTransport().bpm.setValueAtTime(bpm, timeAtPulse(run.map, pulse) / 1000);
      return pulse;
    },
    setFade(rule) {
      audible = ruleOf(rule);
    },
    timeAtPulse(pulse) {
      return run ? timeAtPulse(run.map, pulse) : null;
    },
    pulseAtTime(ms) {
      return run ? pulseAtTime(run.map, ms) : null;
    },
    onClick: clicks.add,
    onBeat: beats.add,
    onStop: (listener) => stops.add(listener),
  };
  return metronome;
}

let shared: Metronome | null = null;

/** The app's metronome: one click, shared by the Tools metronome, timing drills and calibration. */
export function getMetronome(): Metronome {
  return (shared ??= createMetronome());
}
