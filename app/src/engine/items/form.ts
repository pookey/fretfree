import { parseTimeSignature } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

/**
 * Form items (T6: "pickups, repeats, first and second endings"; research/03
 * "find bar 1 of a pickup melody; follow repeat signs"). The tunes are
 * generated fresh for every prompt (research/02 rule 12), so a card is the
 * form, never one tune.
 *
 * - `pickup:4/4:1:bar`: a 4/4 tune opens with a 1-beat pickup; tap the bar
 *   asked for, counting from bar 1, the first full bar.
 * - `pickup:4/4:1:start`: on which beat of the bar that pickup starts (4),
 *   so the learner can count it in. The pickup is counted in the meter's
 *   bottom-number note: quarters in 4/4, eighths in 6/8.
 * - `form:repeat-inner:next`: a road map of repeat signs and endings; which
 *   bar comes after the one asked about.
 * - `form:repeat-inner:order`: tap every bar in the order it is played.
 *
 * The bars of each road map are in `drills/d-form-reading/forms.ts`.
 */

/** Road maps, from the plainest repeat to first and second endings. */
export const FORM_SHAPES = [
  'repeat-all',
  'repeat-inner',
  'repeat-tail',
  'repeat-from-start',
  'repeat-twice',
  'endings',
  'endings-inner',
  'endings-long',
  'endings-from-start',
] as const;

export type FormShape = (typeof FORM_SHAPES)[number];

export type PickupTask = 'bar' | 'start';
export type FormTask = 'next' | 'order';

declare module '../model' {
  interface ItemRefs {
    form:
      | { kind: 'pickup'; meter: string; beats: number; task: PickupTask }
      | { kind: 'form'; shape: FormShape; task: FormTask };
  }
}

type FormRef = ItemRefs['form'];

const PICKUP_ITEM = /^pickup:([1-9]\d*\/[1-9]\d*):([1-9]\d*):(bar|start)$/;
const FORM_ITEM = /^form:([a-z-]+):(next|order)$/;

/** True for a meter and a pickup shorter than its bar, in the bottom number's note. */
function isPickup(meter: string, beats: number): boolean {
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(meter) || !Number.isInteger(beats) || beats < 1) return false;
  try {
    // A bar holds `top` of the bottom number's note.
    return beats < parseTimeSignature(meter).top;
  } catch {
    return false;
  }
}

export function pickupItemId(meter: string, beats: number, task: PickupTask): string {
  if (!isPickup(meter, beats)) throw new RangeError(`Invalid pickup: ${beats} in ${meter}`);
  return `pickup:${meter}:${beats}:${task}`;
}

export function formItemId(shape: FormShape, task: FormTask): string {
  if (!FORM_SHAPES.includes(shape)) throw new RangeError(`Invalid form: ${shape}`);
  return `form:${shape}:${task}`;
}

export function parseFormItemId(id: string): FormRef | null {
  const p = PICKUP_ITEM.exec(id);
  if (p) {
    const meter = p[1] as string;
    const beats = Number(p[2]);
    return isPickup(meter, beats)
      ? { kind: 'pickup', meter, beats, task: p[3] as PickupTask }
      : null;
  }
  const f = FORM_ITEM.exec(id);
  if (!f || !(FORM_SHAPES as readonly string[]).includes(f[1] as string)) return null;
  return { kind: 'form', shape: f[1] as FormShape, task: f[2] as FormTask };
}

export default {
  kinds: ['pickup', 'form'],
  id: (ref) =>
    ref.kind === 'pickup'
      ? pickupItemId(ref.meter, ref.beats, ref.task)
      : formItemId(ref.shape, ref.task),
  parse: parseFormItemId,
} satisfies ItemKind<FormRef>;
