import { useSyncExternalStore } from 'react';
import { computeGeometry, minScale } from '../components/fretboard/geometry';
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

/** The highest fret a neck window reaches (the full neck is 0–15). */
const NECK_TOP_FRET = 15;

/** The compact neck window in portrait: about 5 frets (design §7 iPhone). */
export const COMPACT_WINDOW_FRETS = 5;

/**
 * Horizontal space a session spends beside the neck on compact: the screen's
 * side padding (2 × 1.5rem), D2's two slide buttons (2 × 44pt) and the gaps
 * between them (2 × 0.5rem).
 */
export const COMPACT_NECK_CHROME = 152;

export function sizeClassFor(width: number, height: number): SizeClass {
  if (width < REGULAR_MIN || height < COMPACT_HEIGHT_MAX) return 'compact';
  if (width < REGULAR_WIDE_MIN) return 'regular';
  return 'regular-wide';
}

/** A phone on its side: compact because it is short, not because it is narrow. */
export function isShortLandscape(width: number, height: number): boolean {
  return height < COMPACT_HEIGHT_MAX && width > height;
}

/**
 * How many frets the compact neck window shows. Portrait keeps the zoomed
 * 5-fret window. A short landscape phone can't fit a tall 5-fret window, so
 * the neck is letterboxed to the height there; that leaves width spare, so the
 * window grows to the most frets whose neck still fits the width at its
 * minimum hit size wherever the window sits (`width` excludes safe areas).
 */
export function compactWindowFrets(width: number, height: number, stringCount = 6): number {
  if (!isShortLandscape(width, height)) return COMPACT_WINDOW_FRETS;
  const room = width - COMPACT_NECK_CHROME;
  const fits = (frets: number) => {
    for (let from = 0; from + frets - 1 <= NECK_TOP_FRET; from++) {
      const g = computeGeometry({
        fretRange: { from, to: from + frets - 1 },
        stringCount,
        handedness: 'right',
      });
      if (g.width * minScale(g) > room) return false;
    }
    return true;
  };
  let frets = COMPACT_WINDOW_FRETS;
  while (frets <= NECK_TOP_FRET && fits(frets + 1)) frets++;
  return frets;
}

/**
 * The visible neck for a size class (design §7 session layout): the full
 * 15-fret neck on regular-wide, 12 frets on regular, and on compact a window
 * of `compactFrets` (see `compactWindowFrets`) that slides with the item.
 */
export function neckWindow(
  sizeClass: SizeClass,
  focusFret: number,
  compactFrets = COMPACT_WINDOW_FRETS,
): FretRange {
  if (sizeClass === 'regular-wide') return { from: 0, to: NECK_TOP_FRET };
  if (sizeClass === 'regular') return focusFret > 12 ? { from: 3, to: 15 } : { from: 0, to: 12 };
  const span = Math.min(compactFrets, NECK_TOP_FRET + 1) - 1;
  const from = Math.max(0, Math.min(focusFret - Math.floor(span / 2), NECK_TOP_FRET - span));
  return { from, to: from + span };
}

/**
 * Multi-target, whole-neck drills ("tap every G") fall back to region-by-region
 * versions on compact (design §7 iPhone). This splits a drill's range into the
 * regions it steps through: the whole range on iPad, and on compact the fewest
 * windows of at most `compactFrets` frets, balanced so none is a sliver.
 */
export function neckRegions(
  sizeClass: SizeClass,
  range: FretRange,
  compactFrets = COMPACT_WINDOW_FRETS,
): FretRange[] {
  const length = range.to - range.from + 1;
  if (sizeClass !== 'compact' || length <= compactFrets) return [range];
  const count = Math.ceil(length / Math.max(1, compactFrets));
  const regions: FretRange[] = [];
  let from = range.from;
  for (let i = 0; i < count; i++) {
    const size = Math.floor(length / count) + (i < length % count ? 1 : 0);
    regions.push({ from, to: from + size - 1 });
    from += size;
  }
  return regions;
}

/**
 * Groups a multi-target drill's targets by region, in region order, dropping
 * regions with nothing to find. Each group is one round on compact.
 */
export function targetsByRegion<T extends { fret: number }>(
  targets: readonly T[],
  regions: readonly FretRange[],
): { region: FretRange; targets: T[] }[] {
  return regions
    .map((region) => ({
      region,
      targets: targets.filter((t) => t.fret >= region.from && t.fret <= region.to),
    }))
    .filter((r) => r.targets.length > 0);
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

let insetProbe: HTMLElement | null = null;

/** The left and right safe-area insets (a notched phone on its side), in CSS px. */
function horizontalInsets(): number {
  if (!insetProbe) {
    insetProbe = document.createElement('div');
    insetProbe.setAttribute('aria-hidden', 'true');
    insetProbe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;' +
      'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
    document.body.appendChild(insetProbe);
  }
  const style = getComputedStyle(insetProbe);
  return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
}

function fretsSnapshot(): number {
  const { innerWidth: w, innerHeight: h } = window;
  return isShortLandscape(w, h)
    ? compactWindowFrets(w - horizontalInsets(), h)
    : COMPACT_WINDOW_FRETS;
}

/** The compact neck window's width in frets for the current viewport. */
export function useCompactWindowFrets(): number {
  return useSyncExternalStore(subscribe, fretsSnapshot, () => COMPACT_WINDOW_FRETS);
}
