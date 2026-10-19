/**
 * Pure strum timing (design §9). No Tone here: these turn a chord into which
 * string sounds when, and are unit-tested on their own.
 */
import { Note } from 'tonal';
import { AUDIO } from './config';

export type StrumDirection = 'down' | 'up';

export interface StrumOptions {
  direction?: StrumDirection;
  /** Seconds between neighbouring strings. */
  gap?: number;
  /** Strings an up-stroke catches, counted from the highest. */
  upStrings?: number;
}

export interface StrumHit {
  note: string;
  /** Seconds after the stroke starts. */
  offset: number;
  /** The voice (string) it sounds on: 0 is the lowest note of the chord. */
  voice: number;
}

/** Notes low to high by pitch. Unparseable names keep their place at the end. */
export function sortLowToHigh(notes: readonly string[]): string[] {
  const pitch = (n: string) => Note.midi(n) ?? Number.POSITIVE_INFINITY;
  return [...notes].sort((a, b) => pitch(a) - pitch(b));
}

/**
 * When each note of a strum sounds. A down-stroke runs low to high over every
 * note; an up-stroke runs high to low over the top `upStrings` only.
 */
export function strumHits(notes: readonly string[], opts: StrumOptions = {}): StrumHit[] {
  const gap = opts.gap ?? AUDIO.strum.gap;
  const sorted = sortLowToHigh(notes).map((note, voice) => ({ note, voice }));
  const order =
    opts.direction === 'up'
      ? sorted.slice(-Math.max(1, opts.upStrings ?? AUDIO.strum.upStrings)).reverse()
      : sorted;
  return order.map((h, i) => ({ ...h, offset: i * gap }));
}
