import { useSyncExternalStore } from 'react';

/**
 * Which prompts' bars have been heard, shared by the view and the context
 * panel: a first exposure is heard before it is read (design §12), so the
 * panel holds back its count and the look-alike's description until then.
 * Keyed by the prompt object, so a new prompt starts unheard.
 */
const heard = new WeakSet<object>();
const listeners = new Set<() => void>();

export function markHeard(prompt: object): void {
  if (heard.has(prompt)) return;
  heard.add(prompt);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether `prompt`'s bar has been heard through, re-rendering when it is. */
export function useHeard(prompt: object): boolean {
  return useSyncExternalStore(subscribe, () => heard.has(prompt));
}
