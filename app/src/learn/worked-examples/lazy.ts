import { useEffect, useState, type FC } from 'react';
import type { Skill } from '../../engine';
import type { WorkedExample } from './types';

/**
 * The worked examples and their view, loaded on demand: a lesson needs them
 * only when it shows an example, so they stay out of first-load JS (design
 * §10). The service worker precaches the chunk, so they still open offline.
 */
export interface WorkedExamples {
  /** The example for a skill (see `exampleFor` in `./index`). */
  exampleFor(skill: Pick<Skill, 'id' | 'topic'>): WorkedExample | undefined;
  View: FC<{ example: WorkedExample }>;
}

let loaded: WorkedExamples | undefined;
let pending: Promise<WorkedExamples> | undefined;

/** Downloads the examples once; later calls share the same promise. */
export function loadWorkedExamples(): Promise<WorkedExamples> {
  return (pending ??= Promise.all([import('./index'), import('./WorkedExample')]).then(
    ([index, view]) =>
      (loaded = { exampleFor: (skill) => index.exampleFor(skill), View: view.WorkedExample }),
    (e: unknown) => {
      // A failed download (offline before the precache) can be retried later.
      pending = undefined;
      throw e;
    },
  ));
}

/** The worked examples, or `null` while they download. */
export function useWorkedExamples(): WorkedExamples | null {
  const [examples, setExamples] = useState(loaded ?? null);
  useEffect(() => {
    if (examples) return;
    let live = true;
    loadWorkedExamples().then(
      (e) => live && setExamples(e),
      (e: unknown) => console.error('Loading worked examples failed', e),
    );
    return () => {
      live = false;
    };
  }, [examples]);
  return examples;
}
