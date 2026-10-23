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
  /**
   * Uniform in [0, 1). Given one, each string is struck a little harder or
   * softer and the gaps between strings vary, as a hand's do. Without it,
   * every string is struck alike.
   */
  rng?: () => number;
}

export interface StrumHit {
  note: string;
  /** Seconds after the stroke starts. */
  offset: number;
  /** The voice (string) it sounds on: 0 is the lowest note of the chord. */
  voice: number;
  /** 0–1: how hard the string is struck. */
  velocity: number;
  /** Gain for the size of the chord, so a full strum isn't louder than a single note. */
  level: number;
}

/** Notes low to high by pitch. Unparseable names keep their place at the end. */
export function sortLowToHigh(notes: readonly string[]): string[] {
  const pitch = (n: string) => Note.midi(n) ?? Number.POSITIVE_INFINITY;
  return [...notes].sort((a, b) => pitch(a) - pitch(b));
}

/** Gain for a chord of `notes` strings: √(chordNotes / notes), never above 1. */
export function chordLevel(notes: number): number {
  return notes <= 0 ? 1 : Math.min(1, Math.sqrt(AUDIO.dynamics.chordNotes / notes));
}

/**
 * When each note of a strum sounds. A down-stroke runs low to high over every
 * note; an up-stroke runs high to low over the top `upStrings` only, a little
 * lighter.
 */
export function strumHits(notes: readonly string[], opts: StrumOptions = {}): StrumHit[] {
  const gap = opts.gap ?? AUDIO.strum.gap;
  const { rng } = opts;
  const { strumVelocity, upStroke, gapJitter } = AUDIO.dynamics;
  const up = opts.direction === 'up';
  const sorted = sortLowToHigh(notes).map((note, voice) => ({ note, voice }));
  const order = up
    ? sorted.slice(-Math.max(1, opts.upStrings ?? AUDIO.strum.upStrings)).reverse()
    : sorted;
  const level = chordLevel(order.length);
  const [soft, hard] = strumVelocity;
  let jittered = 0;
  return order.map((h, i) => {
    if (rng && i > 0) jittered += gap * (1 + gapJitter * (2 * rng() - 1));
    const struck = rng ? soft + (hard - soft) * rng() : hard;
    return {
      ...h,
      offset: rng ? jittered : i * gap,
      velocity: Math.max(0, struck - (up ? upStroke : 0)),
      level,
    };
  });
}
