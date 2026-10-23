import type { ItemKind, ItemRefs } from '../model';

/**
 * Meter-by-ear items (T4, T7; D30 "Hear the meter"; design §12): one card
 * per meter to name from a strummed or drummed clip, `meter-ear:6/8`.
 *
 * The clip's tempo, chord, sound and (for 5/4 and 7/8) grouping vary per
 * prompt, so a card is the meter's feel, not one recording of it
 * (research/02 rule 12).
 */
export const EAR_METERS = ['3/4', '4/4', '6/8', '12/8', '5/4', '7/8'] as const;

export type EarMeter = (typeof EAR_METERS)[number];

/**
 * The answer sets D30 offers, in display order, as `items/ear.ts` groups do
 * for D14. Two partitions of the six meters, each a set of buttons any of
 * whose members could be the answer:
 *
 * - **by kind**, the narrowest scope: count the beats. 3/4 or 4/4, 6/8 or
 *   12/8, 5/4 or 7/8.
 * - **by bar**, the confusable pairs (design §12, research/02 rule 6): the
 *   same bar split another way. 3/4 or 6/8 (six eighths: three beats of two,
 *   or two of three), 4/4 or 12/8 (four beats: split in two, or in three, the
 *   shuffle), and the odd pair again.
 */
export interface MeterSet {
  readonly id: string;
  readonly members: readonly EarMeter[];
}

export const METER_SETS_BY_KIND: readonly MeterSet[] = [
  { id: 'simple', members: ['3/4', '4/4'] },
  { id: 'compound', members: ['6/8', '12/8'] },
  { id: 'odd', members: ['5/4', '7/8'] },
];

export const METER_SETS_BY_BAR: readonly MeterSet[] = [
  { id: 'six-eighths', members: ['3/4', '6/8'] },
  { id: 'four-beats', members: ['4/4', '12/8'] },
  { id: 'odd', members: ['5/4', '7/8'] },
];

export function isEarMeter(meter: string): meter is EarMeter {
  return (EAR_METERS as readonly string[]).includes(meter);
}

declare module '../model' {
  interface ItemRefs {
    'meter-ear': { kind: 'meter-ear'; meter: EarMeter };
  }
}

type MeterEarRef = ItemRefs['meter-ear'];

const ITEM = /^meter-ear:([1-9]\d*\/[1-9]\d*)$/;

/** `meter-ear:3/4`: hear a clip, name its meter (T4, T7; D30). */
export function meterEarItemId(meter: EarMeter): string {
  if (!isEarMeter(meter)) throw new RangeError(`Invalid ear meter: ${String(meter)}`);
  return `meter-ear:${meter}`;
}

export function parseMeterEarItemId(id: string): MeterEarRef | null {
  const m = ITEM.exec(id);
  const meter = m?.[1];
  return meter && isEarMeter(meter) ? { kind: 'meter-ear', meter } : null;
}

export default {
  kinds: ['meter-ear'],
  id: (ref) => meterEarItemId(ref.meter),
  parse: parseMeterEarItemId,
} satisfies ItemKind<MeterEarRef>;
