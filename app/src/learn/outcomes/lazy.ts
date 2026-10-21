import { useEffect, useState } from 'react';

/**
 * Skill outcomes, loaded on demand: only Learn shows them, so they stay out
 * of first-load JS (design §10). The service worker precaches the chunk.
 */
export type OutcomeOf = (skillId: string) => string | undefined;

let loaded: OutcomeOf | undefined;
let pending: Promise<OutcomeOf> | undefined;

/** Downloads the outcomes once; later calls share the same promise. */
export function loadOutcomes(): Promise<OutcomeOf> {
  return (pending ??= import('./index').then(
    (index) => (loaded = index.outcomeFor),
    (e: unknown) => {
      // A failed download (offline before the precache) can be retried later.
      pending = undefined;
      throw e;
    },
  ));
}

/** The outcome lookup, or `null` while it downloads. */
export function useOutcomes(): OutcomeOf | null {
  const [outcomes, setOutcomes] = useState<OutcomeOf | null>(() => loaded ?? null);
  useEffect(() => {
    if (outcomes) return;
    let live = true;
    loadOutcomes().then(
      (o) => live && setOutcomes(() => o),
      (e: unknown) => console.error('Loading skill outcomes failed', e),
    );
    return () => {
      live = false;
    };
  }, [outcomes]);
  return outcomes;
}
