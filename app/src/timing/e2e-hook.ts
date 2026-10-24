import { currentOutputLatencyMs } from './device';
import type { OnsetKind } from './latency';
import { getMetronome, type Click, type Metronome } from './metronome';
import { createFakeOnsetSource, type FakeOnsetSource } from './onsets';

/** Set to "1" in localStorage (e2e only) to time calibration and drills from a fake onset source. */
export const FAKE_ONSETS_KEY = 'fretwork.e2e.fakeOnsets';

/** What the e2e specs reach through `window.fretworkFakeOnsets`. */
export interface FakeOnsetsHook {
  /** The fake source per input; the app uses these instead of taps and the mic. */
  sources: Record<OnsetKind, FakeOnsetSource>;
  /**
   * While set, every click gets an onset this many ms after it is heard
   * (output latency included), as a learner with that offset would play it.
   * `null` stops echoing.
   */
  echo: number | null;
  /** While echoing, each onset's strength for its click (D31's accents); 1 when unset. */
  strength?: ((click: Click) => number) | null;
}

interface HookWindow {
  fretworkFakeOnsets?: FakeOnsetsHook;
}

/**
 * The fake onset source for `kind`, when the e2e key is set; otherwise
 * `null`. Storage that throws counts as off.
 */
export function fakeOnsetsForE2E(
  kind: OnsetKind,
  target: HookWindow = globalThis as HookWindow,
  storage: () => Pick<Storage, 'getItem'> | undefined = () => globalThis.localStorage,
  metronome: Metronome = getMetronome(),
): FakeOnsetSource | null {
  let on: boolean;
  try {
    on = storage()?.getItem(FAKE_ONSETS_KEY) === '1';
  } catch {
    on = false;
  }
  if (!on) return null;
  if (!target.fretworkFakeOnsets) {
    const hook: FakeOnsetsHook = {
      sources: { tap: createFakeOnsetSource('tap'), mic: createFakeOnsetSource('mic') },
      echo: null,
    };
    target.fretworkFakeOnsets = hook;
    metronome.onClick((click) => {
      if (hook.echo === null) return;
      const at = click.at + currentOutputLatencyMs() + hook.echo;
      const strength = hook.strength?.(click) ?? 1;
      for (const source of Object.values(hook.sources)) source.emit(at, strength);
    });
  }
  return target.fretworkFakeOnsets.sources[kind];
}
