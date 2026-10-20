/**
 * Fade the click (design §12, D31): the metronome drops clicks as accuracy
 * improves, so the learner builds an internal pulse (guidance hypothesis).
 * A dropped click still happens on the grid, and is still graded; it just
 * doesn't sound. The count-in always sounds.
 */
import { ENGINE_CONFIG } from '../engine/config';
import type { ClickMeter } from './meter';
import { clickAt, type ClickInfo, type ClickLayout } from './tempo';

/**
 * Which clicks sound:
 * - `all`: every click, subdivisions included;
 * - `pulses`: every pulse, no subdivisions;
 * - `accents`: the first pulse of each felt beat (one per bar in a simple meter);
 * - `bars`: the downbeat only, of every `everyBars`th bar (default every bar);
 * - `none`: silence after the count-in.
 */
export interface ClickFade {
  keep: 'all' | 'pulses' | 'accents' | 'bars' | 'none';
  /** With `bars`: sound only bars 0, n, 2n, … */
  everyBars?: number;
}

export const NO_FADE: ClickFade = { keep: 'all' };

export function isAudible(click: ClickInfo, fade: ClickFade): boolean {
  if (click.countIn) return true;
  switch (fade.keep) {
    case 'all':
      return true;
    case 'pulses':
      return click.accent !== 'sub';
    case 'accents':
      return click.accent === 'bar' || click.accent === 'group';
    case 'bars': {
      const every = Math.max(1, Math.floor(fade.everyBars ?? 1));
      return click.accent === 'bar' && click.bar % every === 0;
    }
    case 'none':
      return false;
  }
}

/** Every step of the fade, fullest first, before dropping the steps a meter can't tell apart. */
export const CLICK_FADE_STEPS: readonly ClickFade[] = [
  { keep: 'all' },
  { keep: 'pulses' },
  { keep: 'accents' },
  { keep: 'bars' },
  { keep: 'bars', everyBars: 2 },
  { keep: 'bars', everyBars: 4 },
  { keep: 'none' },
];

/**
 * The fade ladder for a meter and subdivision: `CLICK_FADE_STEPS` without the
 * steps that would sound exactly like the one before (no subdivisions makes
 * `pulses` the same as `all`; one group makes `accents` the same as `bars`).
 * Compared over four bars, the longest cycle in the ladder.
 */
export function fadeLadder(meter: ClickMeter, subdivide = 1): ClickFade[] {
  const layout: ClickLayout = { meter, subdivide, countInBars: 0 };
  const perBar = meter.groups.reduce((sum, g) => sum + g, 0);
  const clicks = Array.from({ length: 4 * perBar * subdivide }, (_, i) => clickAt(layout, i));
  const signature = (fade: ClickFade) => clicks.map((c) => (isAudible(c, fade) ? 1 : 0)).join('');
  const ladder: ClickFade[] = [];
  let last = '';
  for (const step of CLICK_FADE_STEPS) {
    const sig = signature(step);
    if (sig !== last) ladder.push(step);
    last = sig;
  }
  return ladder;
}

/**
 * The next rung for a ladder of `rungs` steps, from the on-time share of the
 * last few bars: up (less click) when it is high, down (more click) when it
 * is low, otherwise stay (research/02 rule 5: hold accuracy at 80–90%).
 */
export function fadeStep(
  current: number,
  rungs: number,
  onTimeRate: number,
  cfg: { promoteAt: number; demoteBelow: number } = ENGINE_CONFIG.timing.fade,
): number {
  const top = Math.max(0, rungs - 1);
  const at = Math.min(top, Math.max(0, current));
  if (onTimeRate >= cfg.promoteAt) return Math.min(top, at + 1);
  if (onTimeRate < cfg.demoteBelow) return Math.max(0, at - 1);
  return at;
}
