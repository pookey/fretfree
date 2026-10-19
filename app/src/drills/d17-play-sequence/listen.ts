import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getPitchSource } from '../../mic/source';
import type { PitchSource, PitchSourceError, PitchSourceState, StableNote } from '../../mic/types';

export interface Mic {
  state: PitchSourceState;
  error: PitchSourceError | null;
  /** Call from a tap handler: iOS grants the mic only inside the gesture (design §9). */
  start(): void;
}

/**
 * The app's pitch source, as the drill's view sees it. It never starts on its
 * own: the learner taps "Start listening" (design §9: permission is asked only
 * when the learner enables the mic). It keeps running from prompt to prompt
 * and stops, releasing the mic, when the view goes away.
 */
export function useMic(): Mic & { source: PitchSource } {
  const [source] = useState(getPitchSource);
  const state = useSyncExternalStore(
    (onChange) => source.onStateChange(onChange),
    () => source.state,
  );
  useEffect(() => () => source.stop(), [source]);
  const start = useCallback(() => {
    // The error is shown from `source.error`; nothing else to do here.
    source.start().catch(() => undefined);
  }, [source]);
  return { source, state, error: state === 'error' ? source.error : null, start };
}

/**
 * Stable notes while `listening`, each with the time it started on
 * `performance.now()`: the time it was reported, less the time it took to
 * become stable. One clock for the view, whatever clock the source keeps
 * (M5-02 review).
 */
export function useNotes(
  source: PitchSource,
  listening: boolean,
  onNote: (note: StableNote, startedAt: number, now: number) => void,
): void {
  useEffect(() => {
    if (!listening) return;
    return source.onNote((note) => {
      const now = performance.now();
      onNote(note, now - (note.stableAt - note.startedAt), now);
    });
  }, [source, listening, onNote]);
}
