/**
 * Click accents per meter (design §12): which pulses of a bar the metronome
 * stresses. A meter here is only what the click needs, the grouping of its
 * pulses; time-signature theory (felt beats, beat units, beaming) is
 * `theory/meter.ts` (M8-04).
 *
 * A pulse is the counted unit, the one the tempo is given in: quarters in
 * 4/4, eighths in 6/8 and 7/8. Groups split a bar into its felt beats:
 * `[3, 3]` is 6/8, `[2, 2, 3]` is 7/8 counted 2+2+3.
 */

/** How strongly a click sounds, loudest first. */
export type Accent = 'bar' | 'group' | 'pulse' | 'sub';

export interface ClickMeter {
  /** Pulses per felt beat, in order. Their sum is the pulses in a bar. */
  groups: readonly number[];
  /** The note value of a pulse: 4 = quarter, 8 = eighth. Display only; tempo is in pulses. */
  unit: 2 | 4 | 8 | 16;
}

/** Pulses in a bar. */
export function pulsesPerBar(meter: ClickMeter): number {
  return meter.groups.reduce((sum, g) => sum + g, 0);
}

/** Throws unless every group is a positive whole number of pulses. */
export function checkMeter(meter: ClickMeter): ClickMeter {
  if (meter.groups.length === 0 || meter.groups.some((g) => !Number.isInteger(g) || g < 1))
    throw new RangeError('A meter needs one or more groups of whole pulses');
  return meter;
}

/**
 * The accent of each pulse in a bar: the downbeat is `bar`, the first pulse of
 * every later group is `group`, the rest are `pulse`. A simple meter is one
 * group (`[4]` for 4/4), so only its downbeat is stressed, as on a classic
 * metronome; compound and odd meters stress each felt beat.
 */
export function accentPattern(meter: ClickMeter): Accent[] {
  checkMeter(meter);
  const out: Accent[] = [];
  meter.groups.forEach((size, g) => {
    for (let p = 0; p < size; p += 1) out.push(p > 0 ? 'pulse' : g === 0 ? 'bar' : 'group');
  });
  return out;
}

/** "3+2", "2+2+3"; one group is just its size. */
export function groupingLabel(meter: ClickMeter): string {
  return meter.groups.join('+');
}

/**
 * Presets for the metronome and the meter drills: simple, compound, and odd
 * groupings. Keys are what a learner reads (`7/8 (2+2+3)`).
 */
export const METER_PRESETS = {
  '2/4': { groups: [2], unit: 4 },
  '3/4': { groups: [3], unit: 4 },
  '4/4': { groups: [4], unit: 4 },
  '5/4 (3+2)': { groups: [3, 2], unit: 4 },
  '6/8': { groups: [3, 3], unit: 8 },
  '9/8': { groups: [3, 3, 3], unit: 8 },
  '12/8': { groups: [3, 3, 3, 3], unit: 8 },
  '5/8 (3+2)': { groups: [3, 2], unit: 8 },
  '5/8 (2+3)': { groups: [2, 3], unit: 8 },
  '7/8 (2+2+3)': { groups: [2, 2, 3], unit: 8 },
  '7/8 (3+2+2)': { groups: [3, 2, 2], unit: 8 },
} as const satisfies Record<string, ClickMeter>;

export type MeterPresetName = keyof typeof METER_PRESETS;
