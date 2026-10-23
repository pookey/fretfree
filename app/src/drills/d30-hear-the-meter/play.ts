import {
  getAudioOutput,
  isAudioUnlocked,
  loadTone,
  playProgression,
  stopAudio,
  unlockAudio,
  volumeToDb,
} from '../../audio/audio';
import { d30ClipSeconds, type D30Clip, type D30Drum, type D30DrumHit } from './logic';

type ToneModule = typeof import('tone');

/**
 * Playing D30's clips. A strummed clip goes to the progression player, one
 * "chord" per stroke, an eighth note a beat, so it keeps time on the Tone
 * Transport like any progression. A drummed clip plays on a small kit built
 * here (a kick, a snare and a hi-hat from Tone's synths), scheduled on the
 * audio clock, through its own gain so a stop cuts it off at once.
 *
 * As D14's clips do, a clip waits for Tone first and plays only if it is
 * still the latest, so a clip overtaken while Tone loads (a new prompt, a
 * dev StrictMode remount) never sounds. A clip played from a tap or a key
 * (`fromGesture`) unlocks audio from inside that gesture, as iOS needs, and
 * waits for it. One played as the prompt opens, before any tap, is silent:
 * Play again is the tap that starts it.
 */

/** Bumped by every clip and every stop, so a clip still waiting can tell it was overtaken. */
let latest = 0;
/** The drum kit sounding now, if any. */
let kit: Kit | null = null;

/** Seconds from now that a drummed clip's first hit lands, so it isn't clipped. */
const LEAD_IN = 0.08;
/** Seconds the kit is kept after its last hit, for the tails to ring out. */
const TAIL = 0.6;

interface Kit {
  stop(): void;
}

/** The synth settings of each drum: tuned for a dry, clear pulse rather than a mix. */
function buildKit(Tone: ToneModule, out: InstanceType<ToneModule['Volume']>) {
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.05 },
  }).connect(out);
  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.03 },
    volume: -8,
  }).connect(out);
  const hatFilter = new Tone.Filter(7000, 'highpass').connect(out);
  const hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.01 },
    volume: -14,
  }).connect(hatFilter);
  const play = (drum: D30Drum, time: number, velocity: number) => {
    if (drum === 'kick') kick.triggerAttackRelease('C1', 0.3, time, velocity);
    else if (drum === 'snare') snare.triggerAttackRelease(0.16, time, velocity);
    else hat.triggerAttackRelease(0.04, time, velocity);
  };
  const dispose = () => [kick, snare, hat, hatFilter, out].forEach((n) => n.dispose());
  return { play, dispose };
}

function playDrums(Tone: ToneModule, hits: readonly D30DrumHit[], eighthS: number, totalS: number) {
  const { volume, muted } = getAudioOutput();
  if (muted) return;
  const out = new Tone.Volume(volumeToDb(volume)).toDestination();
  const drums = buildKit(Tone, out);
  const start = Tone.now() + LEAD_IN;
  for (const h of hits) drums.play(h.drum, start + h.at * eighthS, h.velocity);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    drums.dispose();
    if (kit === mine) kit = null;
  };
  const timer = window.setTimeout(finish, (LEAD_IN + totalS + TAIL) * 1000);
  const mine: Kit = {
    stop() {
      // A quick fade rather than a click, then let go of the nodes.
      out.volume.rampTo(-Infinity, 0.03);
      window.setTimeout(finish, 80);
    },
  };
  kit = mine;
}

function stopDrums(): void {
  kit?.stop();
  kit = null;
}

/** Play a D30 clip, cutting off whatever was still sounding (the last clip, or a replay). */
export async function playClip(clip: D30Clip, opts: { fromGesture?: boolean } = {}): Promise<void> {
  const mine = ++latest;
  stopAudio();
  stopDrums();
  // Called in the gesture's own handler, before any await.
  if (opts.fromGesture) await unlockAudio().catch(() => undefined);
  if (isAudioUnlocked()) await loadTone();
  else await Promise.resolve();
  if (mine !== latest) return;
  const eighthS = 60 / clip.eighthsPerMinute;
  if (clip.style === 'strum') {
    await playProgression(
      clip.strokes.map((s) => ({ notes: s.notes, beats: s.eighths })),
      { bpm: clip.eighthsPerMinute, pattern: 'once' },
    );
    return;
  }
  // Drums need Tone itself; before the first tap there is nothing to play on.
  if (!isAudioUnlocked()) return;
  playDrums(await loadTone(), clip.hits, eighthS, d30ClipSeconds(clip));
}

/** Stop a clip sounding, or still waiting to, when the prompt goes. */
export function stopClip(): void {
  latest++;
  stopAudio();
  stopDrums();
}
