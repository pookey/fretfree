import {
  createFakePitchSource,
  setPitchSourceFactory,
  type FakePitchSource,
} from '../../../mic/source';

/** Set to "1" in localStorage (e2e only) to drive the tuner from a fake pitch source. */
export const FAKE_PITCH_KEY = 'fretwork.e2e.fakePitch';

/** What the e2e specs reach through `window`. */
export interface TunerTestHooks {
  fretworkFakePitch?: FakePitchSource;
  /** Every reference tone asked for, by note name. */
  fretworkTones?: string[];
}

/**
 * Swaps in a fake pitch source the specs play notes into, so no test needs a
 * microphone. Off unless the key is set; storage that throws counts as off.
 * Returns whether it is on.
 */
export function installFakePitchForE2E(
  target: TunerTestHooks = globalThis as TunerTestHooks,
  storage: () => Pick<Storage, 'getItem'> | undefined = () => globalThis.localStorage,
): boolean {
  let on: boolean;
  try {
    on = storage()?.getItem(FAKE_PITCH_KEY) === '1';
  } catch {
    on = false;
  }
  if (!on) return false;
  if (!target.fretworkFakePitch) {
    const fake = createFakePitchSource();
    target.fretworkFakePitch = fake;
    target.fretworkTones = [];
    setPitchSourceFactory(() => fake);
  }
  return true;
}
