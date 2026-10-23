import type { GarageBuild, GuitarSpec } from './types';

/**
 * The free starter guitar, owned from day one (design §3.8). Every part is a
 * catalogue item priced 0 in `engine/config/garage.ts`.
 */
export const STARTER_SPEC: Readonly<GuitarSpec> = {
  body: 'body.s-style',
  finish: 'finish.red',
  pickguard: 'pickguard.white',
  hardware: 'hardware.chrome',
  board: 'board.rosewood',
  inlay: 'inlay.dots',
};

export const DEFAULT_GUITAR_NAME = 'My guitar';

/** The longest guitar name the Garage keeps (M11-06). */
export const GUITAR_NAME_MAX = 40;

export const STARTER_BUILD: Readonly<GarageBuild> = {
  spec: STARTER_SPEC,
  name: DEFAULT_GUITAR_NAME,
};

/** A name as stored: trimmed, at most `GUITAR_NAME_MAX` characters, never empty. */
export function cleanGuitarName(name: string): string {
  const trimmed = [...name.trim()].slice(0, GUITAR_NAME_MAX).join('').trim();
  return trimmed || DEFAULT_GUITAR_NAME;
}
