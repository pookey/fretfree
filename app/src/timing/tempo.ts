/**
 * The click grid and its tempo map, pure. Positions are in pulses from the
 * first beat after the count-in (pulse 0), so count-in pulses are negative.
 * Times are ms on the audio clock. The metronome drives the Tone Transport
 * from this map, and grading reads target times back from it, so the two
 * always agree, through tempo changes too.
 */
import { accentPattern, checkMeter, pulsesPerBar, type Accent, type ClickMeter } from './meter';

/** From `pulse` on, the tempo is `bpm` pulses per minute; `pulse` sounds at `atMs`. */
export interface TempoSegment {
  readonly pulse: number;
  readonly atMs: number;
  readonly bpm: number;
}

/** Tempo segments in pulse order. The first holds before it too. */
export type TempoMap = readonly TempoSegment[];

export function checkBpm(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('bpm must be a positive number');
  return bpm;
}

/** ms per pulse at a tempo. */
export function pulseMs(bpm: number): number {
  return 60_000 / checkBpm(bpm);
}

/** A steady tempo with `pulse` sounding at `atMs`. */
export function tempoMap(bpm: number, atMs: number, pulse = 0): TempoMap {
  return [{ pulse, atMs, bpm: checkBpm(bpm) }];
}

function segmentAt<K extends 'pulse' | 'atMs'>(map: TempoMap, key: K, value: number): TempoSegment {
  let seg = map[0];
  if (!seg) throw new RangeError('A tempo map needs a segment');
  for (const s of map) if (s[key] <= value) seg = s;
  return seg;
}

/** When `pulse` sounds, in audio-clock ms. */
export function timeAtPulse(map: TempoMap, pulse: number): number {
  const s = segmentAt(map, 'pulse', pulse);
  return s.atMs + (pulse - s.pulse) * pulseMs(s.bpm);
}

/** The (fractional) pulse sounding at `ms`. */
export function pulseAtTime(map: TempoMap, ms: number): number {
  const s = segmentAt(map, 'atMs', ms);
  return s.pulse + (ms - s.atMs) / pulseMs(s.bpm);
}

/** The map with the tempo changed to `bpm` from `pulse` on; later changes are dropped. */
export function changeTempo(map: TempoMap, pulse: number, bpm: number): TempoMap {
  const kept = map.filter((s, i) => i === 0 || s.pulse < pulse);
  return [...kept, { pulse, atMs: timeAtPulse(kept, pulse), bpm: checkBpm(bpm) }];
}

/** The click grid: what one run of the metronome sounds. */
export interface ClickLayout {
  meter: ClickMeter;
  /** Clicks per pulse: 1, or 2–4 to sound the subdivisions too (accent `sub`). */
  subdivide: number;
  /** Whole bars of count-in before pulse 0. */
  countInBars: number;
}

export interface ClickInfo {
  /** Clicks since the first one of the run, count-in included. */
  readonly index: number;
  /** Pulses from pulse 0; negative in the count-in, fractional on a subdivision. */
  readonly pulse: number;
  /** Bar number: the first bar after the count-in is 0, count-in bars are negative. */
  readonly bar: number;
  /** Pulse within its bar, from 0 (fractional on a subdivision). */
  readonly pulseInBar: number;
  readonly accent: Accent;
  readonly countIn: boolean;
}

export function checkLayout(layout: ClickLayout): ClickLayout {
  checkMeter(layout.meter);
  if (!Number.isInteger(layout.subdivide) || layout.subdivide < 1 || layout.subdivide > 4)
    throw new RangeError('subdivide must be 1, 2, 3 or 4');
  if (!Number.isInteger(layout.countInBars) || layout.countInBars < 0)
    throw new RangeError('countInBars must be a whole number, zero or more');
  return layout;
}

/** Pulses of count-in before pulse 0. */
export function countInPulses(layout: ClickLayout): number {
  return layout.countInBars * pulsesPerBar(layout.meter);
}

/** The pulse of click `index` of a run. */
export function pulseOfClick(layout: ClickLayout, index: number): number {
  return index / layout.subdivide - countInPulses(layout);
}

/** Click `index` of a run, from its first count-in click. */
export function clickAt(layout: ClickLayout, index: number): ClickInfo {
  const perBar = pulsesPerBar(layout.meter);
  const sub = index % layout.subdivide;
  const pulse = pulseOfClick(layout, index);
  // Whole pulses in integers, so a third of a pulse never rounds into the next bar.
  const whole = (index - sub) / layout.subdivide - countInPulses(layout);
  const bar = Math.floor(whole / perBar);
  const inBar = whole - bar * perBar;
  return {
    index,
    pulse,
    bar,
    pulseInBar: inBar + sub / layout.subdivide,
    accent: sub > 0 ? 'sub' : (accentPattern(layout.meter)[inBar] as Accent),
    countIn: pulse < 0,
  };
}
