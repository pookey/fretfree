import { parseTimeSignature } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

/** What a meter card asks about a time signature (T1, T2). */
export type MeterFact = 'feltBeats' | 'beatUnit' | 'kind' | 'fromBeats';

export const METER_FACTS: readonly MeterFact[] = ['feltBeats', 'beatUnit', 'kind', 'fromBeats'];

declare module '../model' {
  interface ItemRefs {
    meter: { kind: 'meter'; meter: string; fact: MeterFact };
  }
}

const METER_ITEM = /^meter:([1-9]\d*\/[1-9]\d*):(feltBeats|beatUnit|kind|fromBeats)$/;

/** True for a plain `top/bottom` meter that `theory/meter.ts` accepts. */
function isMeter(meter: string): boolean {
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(meter)) return false;
  try {
    parseTimeSignature(meter);
    return true;
  } catch {
    return false;
  }
}

/**
 * `meter:6/8:feltBeats`: how many beats a listener feels in a bar of 6/8 (2).
 * The other facts about the same time signature are their own cards
 * (research/02 rule 1):
 *
 * - `meter:6/8:beatUnit`: what note one felt beat lasts (a dotted quarter);
 * - `meter:6/8:kind`: simple or compound (compound);
 * - `meter:6/8:fromBeats`: the other direction, which time signature has
 *   2 dotted-quarter beats in a bar (6/8).
 *
 * The meter is written `top/bottom`, without a grouping: odd meters (T7)
 * need one, and get their own items.
 */
export function meterItemId(meter: string, fact: MeterFact): string {
  if (!isMeter(meter)) throw new RangeError(`Invalid meter: ${meter}`);
  return `meter:${meter}:${fact}`;
}

export function parseMeterItemId(id: string): { meter: string; fact: MeterFact } | null {
  const m = METER_ITEM.exec(id);
  if (!m || !isMeter(m[1] as string)) return null;
  return { meter: m[1] as string, fact: m[2] as MeterFact };
}

export default {
  kinds: ['meter'],
  id: (ref) => meterItemId(ref.meter, ref.fact),
  parse(id) {
    const ref = parseMeterItemId(id);
    return ref && { kind: 'meter', ...ref };
  },
} satisfies ItemKind<ItemRefs['meter']>;
