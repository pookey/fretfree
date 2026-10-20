import type { ItemKind, ItemRefs } from '../model';

/** One-bar rhythms to tap against a click (F4). The hits are in `drills/d20-rhythm/patterns.ts`. */
export const TAP_PATTERNS = [
  'quarters',
  'half-notes',
  'backbeat',
  'eighths',
  'offbeats',
  'quarter-eighths',
  'charleston',
  'tresillo',
  'push-4',
] as const;

/** One-bar strumming patterns: down on the beat, up on the "&" (F4). */
export const STRUM_PATTERNS = ['down-quarters', 'down-up-eighths', 'd-du-udu'] as const;

export type TapPattern = (typeof TAP_PATTERNS)[number];
export type StrumPattern = (typeof STRUM_PATTERNS)[number];
export type RhythmPattern = TapPattern | StrumPattern;

declare module '../model' {
  interface ItemRefs {
    'rhythm-pattern':
      { kind: 'tap-rhythm'; pattern: TapPattern } | { kind: 'strum-rhythm'; pattern: StrumPattern };
  }
}

type RhythmPatternRef = ItemRefs['rhythm-pattern'];

const ITEM = /^(tap-rhythm|strum-rhythm):([a-z0-9-]+)$/;

/**
 * `tap-rhythm:offbeats`: tap a one-bar rhythm in time with a click (F4,
 * D20). The tempo comes from the drill's adaptive scope and varies per
 * prompt, so one card holds the rhythm at every tempo (research/02 rule 12).
 */
export function tapRhythmItemId(pattern: TapPattern): string {
  if (!TAP_PATTERNS.includes(pattern)) throw new RangeError(`Invalid tap rhythm: ${pattern}`);
  return `tap-rhythm:${pattern}`;
}

/** `strum-rhythm:d-du-udu`: strum (or tap) a strumming pattern in time with a click (F4, D20). */
export function strumRhythmItemId(pattern: StrumPattern): string {
  if (!STRUM_PATTERNS.includes(pattern)) throw new RangeError(`Invalid strum rhythm: ${pattern}`);
  return `strum-rhythm:${pattern}`;
}

export function parseRhythmPatternItemId(id: string): RhythmPatternRef | null {
  const m = ITEM.exec(id);
  if (!m) return null;
  const name = m[2] as string;
  if (m[1] === 'tap-rhythm')
    return (TAP_PATTERNS as readonly string[]).includes(name)
      ? { kind: 'tap-rhythm', pattern: name as TapPattern }
      : null;
  return (STRUM_PATTERNS as readonly string[]).includes(name)
    ? { kind: 'strum-rhythm', pattern: name as StrumPattern }
    : null;
}

export default {
  kinds: ['tap-rhythm', 'strum-rhythm'],
  id: (ref) =>
    ref.kind === 'tap-rhythm' ? tapRhythmItemId(ref.pattern) : strumRhythmItemId(ref.pattern),
  parse: parseRhythmPatternItemId,
} satisfies ItemKind<RhythmPatternRef>;
