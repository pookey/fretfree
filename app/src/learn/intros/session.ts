import type { FC } from 'react';
import { getSkill, type SessionEntry } from '../../engine';
import { ConceptCard, type ConceptCardProps } from '../../session/ConceptCard';
import { openIntroGate } from '../../session/intro-gate';
import type { FretworkDB } from '../../storage';
import { introFor } from './index';
import type { ConceptIntro } from './types';

/** A session's concept intros: which entry gets one, and the card that shows it. */
export interface SessionIntros {
  /** The intro to show before this entry, if any; each skill's at most once. */
  introFor(entry: SessionEntry): ConceptIntro | null;
  Card: FC<ConceptCardProps>;
}

/** The intros for a session starting now (`session/intro-gate.ts` decides which skills). */
export async function openSessionIntros(
  db: FretworkDB,
  options: { reviewOnly?: boolean },
): Promise<SessionIntros> {
  const gate = await openIntroGate(db, options);
  return {
    introFor: (entry) => {
      const skill = getSkill(gate(entry) ?? '');
      return (skill && introFor(skill)) ?? null;
    },
    Card: ConceptCard,
  };
}
