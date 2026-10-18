import type { RunnerDeps } from './runner';

/**
 * Options a link passes to `/session` through route state (`<Link state>`),
 * e.g. Today's quick drills (design §7 Today). Which skills a session serves
 * is its focus, in the URL (`focus.ts`); these shape the session itself.
 * Every field is optional: no state means the usual daily session.
 */
export type SessionOptions = Pick<RunnerDeps, 'minutes' | 'maxItems' | 'reviewOnly'>;

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Read options from route state, dropping anything malformed (history state is untyped). */
export function parseSessionOptions(state: unknown): SessionOptions {
  if (typeof state !== 'object' || state === null) return {};
  const s = state as Record<string, unknown>;
  const out: SessionOptions = {};
  if (positive(s.minutes)) out.minutes = s.minutes;
  if (positive(s.maxItems)) out.maxItems = Math.floor(s.maxItems);
  if (s.reviewOnly === true) out.reviewOnly = true;
  return out;
}
