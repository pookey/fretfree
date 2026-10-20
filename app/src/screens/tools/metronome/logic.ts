/**
 * The metronome tool's pure logic (design §7 Tools): tempo limits, tap tempo,
 * and the click meter for a preset and accent style. The click itself is the
 * timing engine's (`timing/metronome.ts`); nothing here reads the clock.
 */
import {
  METER_PRESETS,
  accentPattern,
  pulsesPerBar,
  type Accent,
  type ClickMeter,
  type MeterPresetName,
} from '../../../timing/meter';
import { METRONOME_CONFIG } from './config';

/** A tempo rounded to a whole BPM and held to the metronome's range. */
export function clampBpm(bpm: number, cfg = METRONOME_CONFIG): number {
  if (!Number.isFinite(bpm)) return cfg.defaultBpm;
  return Math.min(cfg.maxBpm, Math.max(cfg.minBpm, Math.round(bpm)));
}

export type TapConfig = { resetMs: number; maxTaps: number };

/**
 * The tap times (ms, any monotonic clock) after a tap at `at`. A tap after a
 * long pause, or one that isn't later than the last, starts a new count; only
 * the latest `maxTaps` are kept.
 */
export function addTap(
  taps: readonly number[],
  at: number,
  cfg: TapConfig = METRONOME_CONFIG.tapTempo,
): number[] {
  const last = taps[taps.length - 1];
  const fresh = last === undefined || at <= last || at - last > cfg.resetMs;
  return [...(fresh ? [] : taps), at].slice(-cfg.maxTaps);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The tempo the taps beat, from the median interval so one stray tap doesn't
 * move it; `null` until there are two taps. Rounded and held to the range.
 */
export function tapTempo(taps: readonly number[], cfg = METRONOME_CONFIG): number | null {
  if (taps.length < 2) return null;
  const intervals = taps.slice(1).map((t, i) => t - taps[i]!);
  return clampBpm(60_000 / median(intervals), cfg);
}

/**
 * Which pulses are stressed: each felt beat of the preset (3+2, 2+2+3…), the
 * downbeat only, or every pulse of the bar.
 */
export type AccentStyle = 'beats' | 'downbeat' | 'every';

export const ACCENT_LABELS: Record<AccentStyle, string> = {
  beats: 'Felt beats',
  downbeat: 'Downbeat',
  every: 'Every beat',
};

export const METER_NAMES = Object.keys(METER_PRESETS) as MeterPresetName[];

/** The accent styles that differ for a meter: a one-group meter has no felt beats beyond its downbeat. */
export function accentStyles(meter: MeterPresetName): AccentStyle[] {
  return METER_PRESETS[meter].groups.length > 1
    ? ['beats', 'downbeat', 'every']
    : ['downbeat', 'every'];
}

/** `style`, or the meter's first style when it doesn't apply (felt beats on a one-group meter). */
export function accentFor(meter: MeterPresetName, style: AccentStyle): AccentStyle {
  const styles = accentStyles(meter);
  return styles.includes(style) ? style : styles[0]!;
}

/** The click meter for a preset with an accent style. */
export function clickMeter(name: MeterPresetName, style: AccentStyle): ClickMeter {
  const preset = METER_PRESETS[name];
  const pulses = pulsesPerBar(preset);
  switch (accentFor(name, style)) {
    case 'beats':
      return preset;
    case 'downbeat':
      return { groups: [pulses], unit: preset.unit };
    case 'every':
      return { groups: Array.from({ length: pulses }, () => 1), unit: preset.unit };
  }
}

/** One pulse of the beat indicator. */
export interface BeatCell {
  /** The pulse within the bar, from 0. */
  pulse: number;
  accent: Exclude<Accent, 'sub'>;
  /** The first pulse of a felt beat: the indicator leaves a gap before it. */
  groupStart: boolean;
}

/** The beat indicator's cells for a meter: one per pulse, grouped as the click stresses them. */
export function beatCells(name: MeterPresetName, style: AccentStyle): BeatCell[] {
  const meter = clickMeter(name, style);
  const accents = accentPattern(meter);
  const starts = new Set<number>();
  let at = 0;
  for (const size of meter.groups) {
    starts.add(at);
    at += size;
  }
  return accents.map((accent, pulse) => ({
    pulse,
    accent: accent === 'sub' ? 'pulse' : accent,
    groupStart: starts.has(pulse),
  }));
}

/**
 * Whether `pathname` is in the Tools section (`/tools` or `/tools/<tool>`),
 * under the app's `base` path.
 */
export function inTools(pathname: string, base = '/'): boolean {
  const root = `${base.replace(/\/$/, '')}/tools`;
  return pathname === root || pathname.startsWith(`${root}/`);
}
