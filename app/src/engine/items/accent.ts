import type { ItemKind, ItemRefs } from '../model';

/**
 * Accent items (T3, T5; D31 "Accent and strum in meter"; design §12): a bar
 * to tap or strum against the timing engine's click, with some strokes
 * accented. Each pattern is `<meter>:<name>`; the strokes and accents are in
 * `drills/d31-accent-strum/patterns.ts`.
 *
 * - `count:4/4:4`: count a bar in a counting system (T3), one tap per
 *   syllable, the beat numbers accented: 4 taps a beat is "1 e & a", 3 is
 *   "1 trip let" in simple time and "1 la li" in compound time.
 * - `accent:4/4:backbeat`: an accent pattern of a meter (T5): where the
 *   downbeat falls, the backbeat, a strum's accents, an odd meter's grouping.
 *
 * The tempo, and how much of the click sounds, vary per prompt, so a card is
 * the pattern, not one take of it (research/02 rule 12).
 */
export const COUNT_PATTERNS = ['2/4:4', '4/4:4', '4/4:3', '6/8:3', '9/8:3', '12/8:3'] as const;

export const ACCENT_PATTERNS = [
  '4/4:downbeat',
  '3/4:downbeat',
  '2/4:downbeat',
  '4/4:backbeat',
  '12/8:backbeat',
  '4/4:rock-strum',
  '3/4:waltz-strum',
  '6/8:strum',
  '5/4:grouping',
  '7/8:grouping',
] as const;

export type CountPattern = (typeof COUNT_PATTERNS)[number];
export type AccentPattern = (typeof ACCENT_PATTERNS)[number];

declare module '../model' {
  interface ItemRefs {
    accent: { kind: 'count'; pattern: CountPattern } | { kind: 'accent'; pattern: AccentPattern };
  }
}

type AccentRef = ItemRefs['accent'];

const ITEM = /^(count|accent):([1-9]\d*\/[1-9]\d*:[a-z0-9-]+)$/;

/** The meter a pattern is in: `6/8` for `6/8:3`. */
export function patternMeter(pattern: CountPattern | AccentPattern): string {
  return pattern.slice(0, pattern.indexOf(':'));
}

/** `count:6/8:3`: count a bar of 6/8 "1 la li 2 la li" (T3, D31). */
export function countItemId(pattern: CountPattern): string {
  if (!COUNT_PATTERNS.includes(pattern)) throw new RangeError(`Invalid count: ${pattern}`);
  return `count:${pattern}`;
}

/** `accent:4/4:backbeat`: tap or strum a meter's accent pattern (T5, D31). */
export function accentItemId(pattern: AccentPattern): string {
  if (!ACCENT_PATTERNS.includes(pattern)) throw new RangeError(`Invalid accent: ${pattern}`);
  return `accent:${pattern}`;
}

export function parseAccentItemId(id: string): AccentRef | null {
  const m = ITEM.exec(id);
  if (!m) return null;
  const pattern = m[2] as string;
  if (m[1] === 'count')
    return (COUNT_PATTERNS as readonly string[]).includes(pattern)
      ? { kind: 'count', pattern: pattern as CountPattern }
      : null;
  return (ACCENT_PATTERNS as readonly string[]).includes(pattern)
    ? { kind: 'accent', pattern: pattern as AccentPattern }
    : null;
}

export default {
  kinds: ['count', 'accent'],
  id: (ref) => (ref.kind === 'count' ? countItemId(ref.pattern) : accentItemId(ref.pattern)),
  parse: parseAccentItemId,
} satisfies ItemKind<AccentRef>;
