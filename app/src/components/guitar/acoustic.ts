import { smoothClosed, type Pt } from './outline';
import type { BodyDetail } from './types';

/**
 * What every acoustic body in `bodies/` shares: a round soundhole with its
 * rosette. Kept out of `bodies/`, where every file is registered as a body.
 */

/** A circle as a closed cubic path, so the body tests can flatten it. */
export function circlePath(cx: number, cy: number, r: number): string {
  return smoothClosed(
    Array.from({ length: 16 }, (_, i): Pt => {
      const t = (i / 16) * 2 * Math.PI;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    }),
  );
}

export interface Soundhole {
  /** Centre on the centre line, and the opening's radius. */
  y: number;
  r: number;
  /** The rosette ring's width, and the gap between it and the opening. */
  rosette: number;
  gap: number;
}

/** The rosette's outer edge: where a pickguard's inner edge follows it. */
export function rosetteEdge(s: Soundhole): number {
  return s.r + s.gap + s.rosette;
}

/** The soundhole (a dark opening) and its rosette ring. */
export function soundholeDetails(s: Soundhole): BodyDetail[] {
  return [
    { d: circlePath(0, s.y, s.r + s.gap + s.rosette / 2), paint: 'rosette', width: s.rosette },
    { d: circlePath(0, s.y, s.r), paint: 'hole' },
  ];
}
