import type { RhythmPattern } from '../../engine/items/rhythm-pattern';

/**
 * D20's rhythms: one bar of 4/4 on an eighth-note grid. Step 0 is "1",
 * step 1 its "&", up to step 7, the "&" of 4. A pulse is a quarter, so
 * step s sits at pulse s / 2.
 */

export const STEPS_PER_BAR = 8;
export const STEPS_PER_PULSE = 2;

/** What each step is counted as. */
export const COUNTS = ['1', '&', '2', '&', '3', '&', '4', '&'] as const;

export interface PatternInfo {
  /** The steps that are played, ascending. */
  hits: readonly number[];
  /** What the prompt calls it. */
  name: string;
  /** How to hear or feel it, shown under the prompt. */
  hint: string;
}

export const PATTERNS = {
  quarters: { hits: [0, 2, 4, 6], name: 'Every beat', hint: 'Tap with every click.' },
  'half-notes': {
    hits: [0, 4],
    name: 'Beats 1 and 3',
    hint: 'Tap on 1 and 3, and count 2 and 4 in your head.',
  },
  backbeat: {
    hits: [2, 6],
    name: 'The backbeat: 2 and 4',
    hint: 'Tap where the snare drum goes, on 2 and 4. Feel 1 and 3 without tapping.',
  },
  eighths: {
    hits: [0, 1, 2, 3, 4, 5, 6, 7],
    name: 'Eighth notes',
    hint: 'Two even taps per click: one on the beat, one on the “&” halfway to the next.',
  },
  offbeats: {
    hits: [1, 3, 5, 7],
    name: 'Only the “&”s',
    hint: 'Tap exactly halfway between the clicks. Count the beats, tap the “&”s.',
  },
  'quarter-eighths': {
    hits: [0, 2, 3, 4, 6, 7],
    name: '1, 2 &, 3, 4 &',
    hint: 'One tap on 1 and 3, two on 2 and 4.',
  },
  charleston: {
    hits: [0, 3],
    name: 'The Charleston: 1, and the “&” of 2',
    hint: 'The second tap comes just before beat 3, on the “&” of 2.',
  },
  tresillo: {
    hits: [0, 3, 6],
    name: 'Tresillo: 3 + 3 + 2',
    hint: 'Three taps spaced 3, 3 and 2 eighths apart: 1, the “&” of 2, and 4.',
  },
  'push-4': {
    hits: [0, 2, 4, 7],
    name: '1, 2, 3, and the “&” of 4',
    hint: 'The last tap pushes ahead, on the “&” just before the next bar.',
  },
  'down-quarters': {
    hits: [0, 2, 4, 6],
    name: 'Down strums on every beat',
    hint: 'One down strum with each click. Bring the hand back up between them.',
  },
  'down-up-eighths': {
    hits: [0, 1, 2, 3, 4, 5, 6, 7],
    name: 'Down-up eighths',
    hint: 'Down on every beat, up on every “&”, evenly spaced.',
  },
  'd-du-udu': {
    hits: [0, 2, 3, 5, 6, 7],
    name: 'Down, down-up, up-down-up',
    hint: 'Keep the arm moving down and up all bar. On beat 3 it moves down but misses the strings.',
  },
} as const satisfies Record<RhythmPattern, PatternInfo>;

/** Strokes of a strumming pattern: down on a beat, up on an "&" (the arm never stops). */
export function strokeAt(step: number): 'down' | 'up' {
  return step % STEPS_PER_PULSE === 0 ? 'down' : 'up';
}
