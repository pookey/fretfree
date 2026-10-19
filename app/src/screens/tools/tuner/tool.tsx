import { installFakePitchForE2E, type TunerTestHooks } from './e2e-hook';
import { playReferenceTone, Tuner, type ToneSound } from './Tuner';

const e2e = installFakePitchForE2E();

/** In e2e, also note each reference tone, since a headless browser can't be heard. */
function playTone(note: string, sound: ToneSound): void {
  (globalThis as TunerTestHooks).fretworkTones?.push(note);
  playReferenceTone(note, sound);
}

export function View() {
  return <Tuner playTone={e2e ? playTone : playReferenceTone} />;
}
