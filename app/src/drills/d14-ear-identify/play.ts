import {
  isAudioUnlocked,
  loadTone,
  playNotes,
  playProgression,
  stopAudio,
  strum,
} from '../../audio/audio';
import { ENGINE_CONFIG } from '../../engine/config';
import type { D14Clip } from './logic';

/** Bumped by every clip and every stop, so a clip still waiting can tell it was overtaken. */
let latest = 0;

/**
 * Play a D14 clip, cutting off whatever was still sounding (the last
 * prompt's progression, or a replay). Volume and silent mode are the
 * learner's settings, applied globally (`syncAudioOutput`).
 *
 * `playNotes` and `strum` wait for Tone without asking whether a later clip
 * or a stop came meanwhile, so two clips started while it loads (a new
 * prompt, or a dev StrictMode remount) would both sound. A clip waits for
 * Tone here first, and plays only if it is still the latest. Before the
 * first tap has unlocked audio, Tone isn't loaded early (the tap unlocks it
 * from inside the gesture, as iOS needs); the clip only skips a turn, which
 * still drops a clip replaced at once.
 */
export async function playClip(clip: D14Clip): Promise<void> {
  const mine = ++latest;
  stopAudio();
  if (isAudioUnlocked()) await loadTone();
  else await Promise.resolve();
  if (mine !== latest) return;
  switch (clip.type) {
    case 'notes':
      await playNotes(clip.notes, { gap: clip.gap, duration: ENGINE_CONFIG.earIdentify.noteS });
      return;
    case 'strum':
      await strum(clip.notes);
      return;
    case 'progression':
      await playProgression(
        clip.chords.map((notes) => ({ notes })),
        { bpm: clip.bpm, beatsPerChord: clip.beatsPerChord, pattern: 'once' },
      );
      return;
  }
}

/** Stop a clip sounding, or still waiting to, when the prompt goes. */
export function stopClip(): void {
  latest++;
  stopAudio();
}
