/**
 * D31's taps: two pads, one for a strong stroke and one for a soft one, as a
 * single onset source on the audio clock (`timing/onsets.ts`). The pad sets
 * the onset's strength: 1 on the accent pad, `softTapStrength` on the soft
 * one, which the grade reads as the accent (`d31HeardAccents`), as a mic
 * strum's strength is read from how loud it was.
 *
 * A pointer counts on press, on the pad it lands on. Keys count on the
 * element holding both pads, so the learner never moves focus mid-bar: F or
 * Space for a strong tap, J or Enter for a soft one, each on its pad's side. Held keys don't repeat.
 */
import { ENGINE_CONFIG } from '../../engine/config';
import type { AudioClock } from '../../timing/clock';
import {
  createOnsetSource,
  type Onset,
  type OnsetSource,
  type TapEvent,
} from '../../timing/onsets';

// The keys sit on the side of their pad: Strong is the left pad, Soft the right.
export const STRONG_KEYS: readonly string[] = ['f', 'F', ' '];
export const SOFT_KEYS: readonly string[] = ['j', 'J', 'Enter'];

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface AccentPads {
  strong: Listenable;
  soft: Listenable;
  /** Where the keys are heard: the element around both pads. */
  keys: Listenable;
}

export interface AccentTapSource extends OnsetSource {
  /** Taps on the pads and keys count while running. Returns a detach. */
  attach(pads: AccentPads): () => void;
  /** Feed one event by hand; `pad` is where a pointer landed. Ignored unless running. */
  handle(event: TapEvent, pad?: 'strong' | 'soft'): void;
}

export function isAccentTapSource(source: OnsetSource): source is AccentTapSource {
  return 'attach' in source && 'handle' in source;
}

export function createAccentTapSource(
  clock: AudioClock,
  softStrength: number = ENGINE_CONFIG.accentStrum.accents.softTapStrength,
): AccentTapSource {
  let emit: ((onset: Onset) => void) | null = null;
  const source = createOnsetSource('tap', {
    start(e) {
      clock.start();
      emit = e;
      return Promise.resolve();
    },
    stop() {
      clock.stop();
      emit = null;
    },
  });
  const strengthOf = (event: TapEvent, pad?: 'strong' | 'soft'): number | null => {
    if (event.type === 'keydown') {
      if (event.repeat || !event.key) return null;
      if (STRONG_KEYS.includes(event.key)) return 1;
      return SOFT_KEYS.includes(event.key) ? softStrength : null;
    }
    if (event.type !== 'pointerdown' || (event.button ?? 0) !== 0 || !pad) return null;
    return pad === 'strong' ? 1 : softStrength;
  };
  const handle = (event: TapEvent, pad?: 'strong' | 'soft') => {
    if (!emit) return;
    const strength = strengthOf(event, pad);
    if (strength === null) return;
    const at = clock.toContextMs(event.timeStamp);
    if (at !== null) emit({ at, kind: 'tap', strength });
  };
  return Object.assign(source, {
    handle,
    attach({ strong, soft, keys }: AccentPads) {
      const onStrong = (e: Event) => handle(e as unknown as TapEvent, 'strong');
      const onSoft = (e: Event) => handle(e as unknown as TapEvent, 'soft');
      const onKey = (e: Event) => {
        const key = (e as KeyboardEvent).key;
        // Space would scroll the page, Enter re-press a focused pad.
        if (emit && (STRONG_KEYS.includes(key) || SOFT_KEYS.includes(key))) e.preventDefault();
        handle(e as unknown as TapEvent);
      };
      strong.addEventListener('pointerdown', onStrong);
      soft.addEventListener('pointerdown', onSoft);
      keys.addEventListener('keydown', onKey);
      return () => {
        strong.removeEventListener('pointerdown', onStrong);
        soft.removeEventListener('pointerdown', onSoft);
        keys.removeEventListener('keydown', onKey);
      };
    },
  });
}
