import { ENGINE_CONFIG } from '../../engine/config';
import type { NoteEnd, StableNote } from '../../mic/types';

/**
 * Which heard notes may answer the prompt on screen (M5-01 and M5-02
 * reviews). Pure and clock-free: times are the pitch source's own clock, and
 * the prompt is pinned to the last frame heard before it appeared.
 *
 * - A note that began before the prompt (a string still ringing from the last
 *   answer, or the feedback sound) never answers it.
 * - A note that takes over from such a note without a gap, an octave away, is
 *   that string decaying onto an octave, not a pluck.
 * - A note that begins inside a quiet window (the feedback sounds playing)
 *   is the speaker's, not the learner's.
 * - A restart of the source may restart its clock, so `reset()` forgets
 *   everything and lets the next note answer.
 */
export interface D16Listener {
  /** Every analysis frame, so the prompt can be pinned to the source clock. */
  frame(at: number): void;
  /** A new prompt is on screen. */
  prompt(): void;
  /** Ignore notes that start in the next `ms`, from the last frame heard. */
  quiet(ms: number): void;
  /** The source (re)started: its clock may have restarted too. */
  reset(): void;
  /** A stable note; true if it answers the prompt. */
  note(note: StableNote): boolean;
  noteEnd(end: NoteEnd): void;
  /** A note from before the prompt that is still sounding, or null. */
  readonly ringing: StableNote | null;
}

export function createD16Listener(
  takeoverGapMs: number = ENGINE_CONFIG.playNote.takeoverGapMs,
): D16Listener {
  let lastFrameAt = -Infinity;
  let promptAt = -Infinity;
  let sounding: StableNote | null = null;
  let lastEnd: NoteEnd | null = null;
  let quietUntil = -Infinity;

  const before = (note: StableNote) => note.startedAt <= promptAt;

  const octaveTakeover = (note: StableNote) => {
    if (!lastEnd || !before(lastEnd.note)) return false;
    const diff = note.midi - lastEnd.note.midi;
    return diff !== 0 && diff % 12 === 0 && note.startedAt - lastEnd.endedAt <= takeoverGapMs;
  };

  return {
    frame(at) {
      lastFrameAt = at;
    },
    prompt() {
      promptAt = lastFrameAt;
    },
    quiet(ms) {
      quietUntil = lastFrameAt + ms;
    },
    reset() {
      lastFrameAt = -Infinity;
      quietUntil = -Infinity;
      promptAt = -Infinity;
      sounding = null;
      lastEnd = null;
    },
    note(note) {
      sounding = note;
      return !before(note) && note.startedAt >= quietUntil && !octaveTakeover(note);
    },
    noteEnd(end) {
      if (sounding?.startedAt === end.note.startedAt) sounding = null;
      lastEnd = end;
    },
    get ringing() {
      return sounding && before(sounding) ? sounding : null;
    },
  };
}
