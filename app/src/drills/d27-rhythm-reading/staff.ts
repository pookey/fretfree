import type { StaffTuplet } from '../../components/staff';
import { eventStarts, fracDiv, fracToNumber, pulseLength, type RhythmEvent } from '../../theory';
import { signatureOf } from './logic';

/**
 * The bar as `<Staff>` draws it, pure: its tuplet brackets, the note the
 * click is on, and the meter's spoken name. Only the lazy view loads it.
 */

/** One bracket per tuplet group (`tupletStart`, or a run of one ratio): `3[8 8 8]` → `{ from, count: 3, inSpaceOf: 2 }`. */
export function staffTuplets(events: readonly RhythmEvent[]): StaffTuplet[] {
  const out: StaffTuplet[] = [];
  events.forEach((e, i) => {
    if (!e.tuplet) return;
    const prev = events[i - 1]?.tuplet;
    const last = out.at(-1);
    const same =
      prev && prev.num === e.tuplet.num && prev.inSpaceOf === e.tuplet.inSpaceOf && !e.tupletStart;
    if (same && last && last.from + last.count === i) last.count += 1;
    else out.push({ from: i, count: 1, inSpaceOf: e.tuplet.inSpaceOf });
  });
  return out;
}

/**
 * The event sounding at `pulse` of the bar (the last to start at or before
 * it), so a caret can follow the click; rests included. A pulse past the bar
 * is the last event's.
 */
export function eventAtPulse(events: readonly RhythmEvent[], meter: string, pulse: number): number {
  const pulseLen = pulseLength(signatureOf(meter));
  const starts = eventStarts(events).map((s) => fracToNumber(fracDiv(s, pulseLen)));
  let at = 0;
  starts.forEach((s, i) => {
    if (s <= pulse + 1e-6) at = i;
  });
  return at;
}

/** "4 4 time", for VoiceOver. */
export function spokenMeter(meter: string): string {
  return `${meter.replace('/', ' ')} time`;
}
