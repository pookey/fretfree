import { useSyncExternalStore } from 'react';
import type { FretRange } from '../theory';

/**
 * Width-based size classes (design §7), so Split View and Stage Manager
 * windows just work. Very short windows (an iPhone in landscape) are treated
 * as compact too: a sidebar plus a full neck can't fit 400pt of height.
 */
export type SizeClass = 'regular-wide' | 'regular' | 'compact';

export const REGULAR_WIDE_MIN = 1024;
export const REGULAR_MIN = 744;
export const COMPACT_HEIGHT_MAX = 500;

export function sizeClassFor(width: number, height: number): SizeClass {
  if (width < REGULAR_MIN || height < COMPACT_HEIGHT_MAX) return 'compact';
  if (width < REGULAR_WIDE_MIN) return 'regular';
  return 'regular-wide';
}

/**
 * The visible neck for a size class (design §7 session layout): the full
 * 15-fret neck on regular-wide, 12 frets on regular, and a 5-fret window that
 * slides with the item on compact.
 */
export function neckWindow(sizeClass: SizeClass, focusFret: number): FretRange {
  if (sizeClass === 'regular-wide') return { from: 0, to: 15 };
  if (sizeClass === 'regular') return focusFret > 12 ? { from: 3, to: 15 } : { from: 0, to: 12 };
  const from = Math.max(0, Math.min(focusFret - 2, 15 - 4));
  return { from, to: from + 4 };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

function snapshot(): SizeClass {
  return sizeClassFor(window.innerWidth, window.innerHeight);
}

export function useSizeClass(): SizeClass {
  return useSyncExternalStore(subscribe, snapshot, () => 'regular-wide');
}
