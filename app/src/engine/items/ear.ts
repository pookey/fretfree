import {
  PROGRESSIONS,
  isChordKind,
  isIntervalName,
  type ChordKind,
  type IntervalName,
} from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

/**
 * Ear items (I6, D14 "Hear it → identify"): one card per sound to name.
 *
 * - `ear-interval:M3:up`: two notes, the second a M3 above the first.
 *   `:down` plays the M3 falling, `:together` both notes at once. Each
 *   direction is its own card (research/02 rule 1): hearing an interval fall
 *   is a different skill from hearing it rise.
 * - `ear-chord:minor`: one strummed chord, named by its quality.
 * - `prog:I-V-vi-IV:ear`: a catalogue progression, named by ear (design
 *   §3.1). It shares C9's `prog:` prefix; `items/progression.ts` owns the
 *   `build` and `transpose` tasks, this file the `ear` one.
 *
 * The pitch, root or key varies per prompt, so a card is the sound's shape,
 * not one recording of it (rule 12).
 */
export type EarDirection = 'up' | 'down' | 'together';

export const EAR_DIRECTIONS: readonly EarDirection[] = ['up', 'down', 'together'];

declare module '../model' {
  interface ItemRefs {
    ear:
      | { kind: 'ear-interval'; interval: IntervalName; direction: EarDirection }
      | { kind: 'ear-chord'; chord: ChordKind }
      | { kind: 'progression-ear'; progression: string };
  }
}

export type EarRef = ItemRefs['ear'];

const INTERVAL_ITEM = /^ear-interval:([A-Za-z0-9]+):(up|down|together)$/;
const CHORD_ITEM = /^ear-chord:([A-Za-z0-9]+)$/;
const PROGRESSION_ITEM = /^prog:([A-Za-z0-9-]+):ear$/;

function isProgressionId(id: string): boolean {
  return PROGRESSIONS.some((p) => p.id === id);
}

export function earIntervalItemId(interval: IntervalName, direction: EarDirection): string {
  // Unison is no interval to hear: two of the same note.
  if (!isIntervalName(interval) || interval === 'P1') {
    throw new RangeError(`Invalid interval: ${String(interval)}`);
  }
  if (!EAR_DIRECTIONS.includes(direction)) {
    throw new RangeError(`Invalid direction: ${String(direction)}`);
  }
  return `ear-interval:${interval}:${direction}`;
}

export function earChordItemId(chord: ChordKind): string {
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  return `ear-chord:${chord}`;
}

export function progressionEarItemId(progression: string): string {
  if (!isProgressionId(progression)) throw new RangeError(`Unknown progression: ${progression}`);
  return `prog:${progression}:ear`;
}

export function parseEarItemId(id: string): EarRef | null {
  let m = INTERVAL_ITEM.exec(id);
  if (m) {
    const interval = m[1] as string;
    if (!isIntervalName(interval) || interval === 'P1') return null;
    return { kind: 'ear-interval', interval, direction: m[2] as EarDirection };
  }
  m = CHORD_ITEM.exec(id);
  if (m) {
    const chord = m[1] as string;
    return isChordKind(chord) ? { kind: 'ear-chord', chord } : null;
  }
  m = PROGRESSION_ITEM.exec(id);
  if (m && isProgressionId(m[1] as string)) {
    return { kind: 'progression-ear', progression: m[1] as string };
  }
  return null;
}

export function earItemId(ref: EarRef): string {
  switch (ref.kind) {
    case 'ear-interval':
      return earIntervalItemId(ref.interval, ref.direction);
    case 'ear-chord':
      return earChordItemId(ref.chord);
    case 'progression-ear':
      return progressionEarItemId(ref.progression);
  }
}

export default {
  kinds: ['ear-interval', 'ear-chord', 'progression-ear'],
  id: earItemId,
  parse: parseEarItemId,
} satisfies ItemKind<EarRef>;
