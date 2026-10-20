import { useEffect, useState } from 'react';
import type * as Render from './render';

/**
 * VexFlow loads on demand: the first <Staff> on screen fetches it, and
 * every later one shares the download. The service worker precaches the
 * chunk, so notation still renders offline.
 */
export type Engraver = typeof Render;

let loaded: Engraver | undefined;
let pending: Promise<Engraver> | undefined;

export function loadEngraver(): Promise<Engraver> {
  return (pending ??= import('./render').then(
    async (m) => {
      await m.ready;
      return (loaded = m);
    },
    (e: unknown) => {
      // A failed download (offline before the precache) can be retried later.
      pending = undefined;
      throw e;
    },
  ));
}

/**
 * The engraver, or `null` while it downloads. A failed download (offline
 * before the precache) is retried when the device comes back online.
 */
export function useEngraver(): Engraver | null {
  const [engraver, setEngraver] = useState(loaded ?? null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (engraver) return;
    let live = true;
    const retry = () => live && setAttempt((a) => a + 1);
    loadEngraver().then(
      (e) => live && setEngraver(e),
      (e: unknown) => {
        console.error('Loading the notation renderer failed', e);
        if (live) window.addEventListener('online', retry, { once: true });
      },
    );
    return () => {
      live = false;
      window.removeEventListener('online', retry);
    };
  }, [engraver, attempt]);
  return engraver;
}
