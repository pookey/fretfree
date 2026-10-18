/**
 * Confetti pieces for milestone celebrations (design §3.7). Okabe–Ito colours,
 * and three distinct shapes so the burst never relies on colour alone.
 */

export const CONFETTI_COLOURS = [
  '#e69f00',
  '#56b4e9',
  '#009e73',
  '#f0e442',
  '#0072b2',
  '#d55e00',
  '#cc79a7',
] as const;

export type ConfettiShape = 'circle' | 'square' | 'triangle';
const SHAPES: readonly ConfettiShape[] = ['circle', 'square', 'triangle'];

export interface ConfettiPiece {
  /** Start position across the viewport, 0–100 (%). */
  x: number;
  /** Sideways drift over the fall, in rem (negative is left). */
  drift: number;
  delayMs: number;
  durationMs: number;
  /** Total spin over the fall, in degrees. */
  spin: number;
  /** Edge length in rem. */
  size: number;
  colour: string;
  shape: ConfettiShape;
}

function pick<T>(list: readonly T[], r: number): T {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))] as T;
}

/** `count` pieces drawn from `rng` (deterministic for a seeded rng). */
export function confettiPieces(count: number, rng: () => number): ConfettiPiece[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => ({
    x: rng() * 100,
    drift: (rng() - 0.5) * 12,
    delayMs: Math.round(rng() * 400),
    durationMs: Math.round(1800 + rng() * 1200),
    spin: Math.round((rng() - 0.5) * 1440),
    size: 0.5 + rng() * 0.5,
    colour: pick(CONFETTI_COLOURS, rng()),
    shape: SHAPES[i % SHAPES.length] as ConfettiShape,
  }));
}
