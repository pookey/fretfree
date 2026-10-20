// Its own module: the Today card and Progress panel check it on first load,
// and the rest of the sign-in client loads only when it is used.

/** The hosted sign-in and sync API (infra/lib/sync-stack.ts). */
export const HOSTED_API_URL = 'https://api.fretfree.app';

/**
 * Where the sign-in and sync API lives, or null when this build has none.
 * `VITE_SYNC_API_URL` overrides the hosted API for a fork's own stack, and an
 * empty value turns accounts off, leaving the app exactly as it is without
 * them (design §1 principle 8).
 */
export function syncApiUrl(
  env: string | undefined = import.meta.env.VITE_SYNC_API_URL,
): string | null {
  if (env === undefined) return HOSTED_API_URL;
  const url = env.trim().replace(/\/+$/, '');
  return url === '' ? null : url;
}
