import { playProgression, stopAudio, unlockAudio, type ProgressionChord } from '../../audio/audio';
import { ENGINE_CONFIG } from '../../engine/config';
import { eventLength, fracToNumber, parseRhythm } from '../../theory';
import type { FormReadingPrompt } from './logic';

/**
 * Playing a form card's tune in the order it is read (research/02 rule 10:
 * sound, sight and name together). It goes to the progression player, one
 * "chord" per note (the melody, with the bass on each bar's downbeat), so it
 * keeps time on the Tone Transport, and the player's chord cue lights each
 * bar as it is reached.
 */

export interface PlayPlan {
  chords: ProgressionChord[];
  /** For each chord, the step of the play order it belongs to. */
  steps: number[];
}

/** Every note of the tune in play order, its length in quarter notes. */
export function playPlan(prompt: Pick<FormReadingPrompt, 'bars' | 'order'>): PlayPlan {
  const chords: ProgressionChord[] = [];
  const steps: number[] = [];
  prompt.order.forEach((index, step) => {
    const bar = prompt.bars[index];
    if (!bar) return;
    parseRhythm(bar.rhythm).forEach((e, k) => {
      const pitch = bar.pitches[k];
      const notes = pitch ? [pitch] : [];
      chords.push({
        notes: k === 0 && bar.bass ? [bar.bass, ...notes] : notes,
        beats: fracToNumber(eventLength(e)) * 4,
      });
      steps.push(step);
    });
  });
  return { chords, steps };
}

export interface TuneHandlers {
  /** Called as each step of the play order starts. */
  onStep(step: number): void;
  onEnd(): void;
}

/** Bumped by every start and stop, so a start still waiting can tell it was overtaken. */
let latest = 0;

/**
 * Play the tune; resolves to a stop function, or null when nothing started
 * (audio locked, or overtaken). Called from the tap's own handler, so the
 * unlock iOS needs happens inside the gesture.
 */
export async function playTune(
  prompt: Pick<FormReadingPrompt, 'bars' | 'order'>,
  handlers: TuneHandlers,
): Promise<(() => void) | null> {
  const mine = ++latest;
  stopAudio();
  await unlockAudio().catch(() => undefined);
  if (mine !== latest) return null;
  const plan = playPlan(prompt);
  let last = -1;
  const playback = await playProgression(plan.chords, {
    bpm: ENGINE_CONFIG.formReading.quartersPerMinute,
    pattern: 'once',
    onChord: (i) => {
      const step = plan.steps[i] ?? -1;
      if (step !== last) handlers.onStep((last = step));
    },
    onEnd: handlers.onEnd,
  });
  return playback.started ? () => playback.stop() : null;
}

/** Stop the tune when the card goes. */
export function stopTune(): void {
  latest++;
  stopAudio();
}
