import type { GuitarLook, InlayShape } from './types';

const INLAY_WORD: Record<InlayShape, string> = {
  dots: 'dot',
  blocks: 'block',
  trapezoids: 'trapezoid',
};

/**
 * "Cherry sunburst" → "cherry sunburst", but an initialism like "ABS" stays.
 * The body's model name ("Les Paul") never comes through here.
 */
function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;
}

/** The part's name, followed by `noun` unless the name already ends with it. */
function named(name: string, noun: string): string {
  const n = lowerFirst(name.trim());
  return new RegExp(`\\b${noun}$`, 'i').test(n) ? n : `${n} ${noun}`;
}

/**
 * The accessible name of a guitar, e.g. "Les Paul guitar, cherry
 * sunburst, cream pickguard, gold hardware, rosewood neck with block
 * inlays".
 */
export function guitarLabel(look: GuitarLook): string {
  const body = look.body.name.trim();
  const pickguard = look.pickguard.render.colour
    ? named(look.pickguard.name, 'pickguard')
    : 'no pickguard';
  return [
    `${body.replace(/\s*guitar$/i, '')} guitar`,
    lowerFirst(look.finish.name.trim()),
    pickguard,
    named(look.hardware.name, 'hardware'),
    `${named(look.board.name.replace(/\s*(fret)?board$/i, ''), 'neck')} with ${INLAY_WORD[look.inlay.render.shape]} inlays`,
  ].join(', ');
}
