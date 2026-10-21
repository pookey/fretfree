import { useEffect, useState } from 'react';
import type { Skill } from '../../engine';

/**
 * What a skill row can preview, loaded on demand: its outcome, and whether
 * it has a concept intro (`learn/intros`). Only Learn shows them, so they
 * stay out of first-load JS (design §10). The service worker precaches the
 * chunks.
 */
export interface SkillPreviews {
  outcomeOf(skillId: string): string | undefined;
  hasIntro(skill: Pick<Skill, 'id' | 'topic'>): boolean;
}

let loaded: SkillPreviews | undefined;
let pending: Promise<SkillPreviews> | undefined;

/** Downloads the outcomes and intros once; later calls share the same promise. */
export function loadOutcomes(): Promise<SkillPreviews> {
  return (pending ??= Promise.all([import('./index'), import('../intros')]).then(
    ([outcomes, intros]) =>
      (loaded = {
        outcomeOf: outcomes.outcomeFor,
        hasIntro: (skill) => intros.introFor(skill) !== undefined,
      }),
    (e: unknown) => {
      // A failed download (offline before the precache) can be retried later.
      pending = undefined;
      throw e;
    },
  ));
}

/** The preview lookups, or `null` while they download. */
export function useOutcomes(): SkillPreviews | null {
  const [previews, setPreviews] = useState(loaded ?? null);
  useEffect(() => {
    if (previews) return;
    let live = true;
    loadOutcomes().then(
      (p) => live && setPreviews(p),
      (e: unknown) => console.error('Loading skill outcomes failed', e),
    );
    return () => {
      live = false;
    };
  }, [previews]);
  return previews;
}
