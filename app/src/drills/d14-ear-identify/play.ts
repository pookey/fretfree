import { playNotes, playProgression, stopAudio, strum } from '../../audio/audio';
import { ENGINE_CONFIG } from '../../engine/config';
import type { D14Clip } from './logic';

/**
 * Play a D14 clip, cutting off whatever was still sounding (the last
 * prompt's progression, or a replay). Volume and silent mode are the
 * learner's settings, applied globally (`syncAudioOutput`).
 */
export function playClip(clip: D14Clip): Promise<unknown> {
  stopAudio();
  switch (clip.type) {
    case 'notes':
      return playNotes(clip.notes, { gap: clip.gap, duration: ENGINE_CONFIG.earIdentify.noteS });
    case 'strum':
      return strum(clip.notes);
    case 'progression':
      return playProgression(
        clip.chords.map((notes) => ({ notes })),
        { bpm: clip.bpm, beatsPerChord: clip.beatsPerChord, pattern: 'once' },
      );
  }
}

/** Stop a clip still sounding, when the prompt goes. */
export function stopClip(): void {
  stopAudio();
}
