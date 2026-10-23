/**
 * How the guitar is framed, kept apart from `geometry.ts` so the lazy
 * wrapper (`index.tsx`) can size its placeholder without loading the
 * drawing code.
 */

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The whole guitar, headstock to strap button, with room for tuner keys. */
export const FULL_FRAME: Frame = { x: -185, y: -200, width: 370, height: 1010 };
/** The body only, for small avatars. */
export const BODY_FRAME: Frame = { x: -185, y: 300, width: 370, height: 502 };

export type GuitarSize = number | 'fill';
export type GuitarCrop = 'full' | 'body';

export function frameOf(crop: GuitarCrop = 'full'): Frame {
  return crop === 'body' ? BODY_FRAME : FULL_FRAME;
}

/** CSS box for a guitar `size` rem tall, or filling its container's width. */
export function frameBox(
  size: GuitarSize,
  crop?: GuitarCrop,
): { width: string; height?: string; aspectRatio?: string } {
  const frame = frameOf(crop);
  return size === 'fill'
    ? { width: '100%', aspectRatio: `${frame.width} / ${frame.height}` }
    : { width: `${(size * frame.width) / frame.height}rem`, height: `${size}rem` };
}
