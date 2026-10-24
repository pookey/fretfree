// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import { createAudioClock } from '../../timing/clock';
import { createFakeOnsetSource, type Onset } from '../../timing/onsets';
import { createAccentTapSource, isAccentTapSource } from './taps';

const SOFT = ENGINE_CONFIG.accentStrum.accents.softTapStrength;

/** Context time runs 500 ms ahead of the page clock. */
function setup() {
  const page = { now: 1000 };
  const clock = createAudioClock({
    contextSeconds: () => (page.now + 500) / 1000,
    pageMs: () => page.now,
  });
  const source = createAccentTapSource(clock);
  const onsets: Onset[] = [];
  source.onOnset((o) => onsets.push(o));
  return { source, onsets };
}

function pads() {
  const keys = document.createElement('div');
  const strong = document.createElement('button');
  const soft = document.createElement('button');
  keys.append(strong, soft);
  document.body.append(keys);
  return { keys, strong, soft };
}

const pointer = (timeStamp: number, button = 0) => ({ type: 'pointerdown', timeStamp, button });
const key = (k: string, timeStamp: number, repeat = false) => ({
  type: 'keydown',
  key: k,
  timeStamp,
  repeat,
});

describe('createAccentTapSource', () => {
  it('times each pad’s taps on the audio clock, strong or soft by the pad', async () => {
    const { source, onsets } = setup();
    source.handle(pointer(1000), 'strong'); // not running yet
    await source.start();
    source.handle(pointer(1000), 'strong');
    source.handle(pointer(1100), 'soft');
    source.handle(pointer(1200)); // no pad
    source.handle(pointer(1300, 2), 'strong'); // secondary button
    expect(onsets).toEqual([
      { at: 1500, kind: 'tap', strength: 1 },
      { at: 1600, kind: 'tap', strength: SOFT },
    ]);
  });

  it('takes J or Enter as strong and F or Space as soft, without repeats', async () => {
    const { source, onsets } = setup();
    await source.start();
    source.handle(key('j', 1000));
    source.handle(key('Enter', 1010));
    source.handle(key('F', 1020));
    source.handle(key(' ', 1030));
    source.handle(key(' ', 1040, true));
    source.handle(key('x', 1050));
    source.handle({ type: 'keyup', key: 'j', timeStamp: 1060 });
    expect(onsets.map((o) => o.strength)).toEqual([1, 1, SOFT, SOFT]);
    source.stop();
    source.handle(key('j', 1100));
    expect(onsets).toHaveLength(4);
  });

  it('listens on the pads and the element around them until detached', async () => {
    const { source, onsets } = setup();
    const el = pads();
    const detach = source.attach(el);
    await source.start();
    el.strong.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    el.soft.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    el.soft.dispatchEvent(space);
    // Space would scroll the page: the tap keys don't do their usual thing.
    expect(space.defaultPrevented).toBe(true);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    el.strong.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(onsets.map((o) => o.strength)).toEqual([1, SOFT, SOFT]);
    detach();
    el.strong.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    el.keys.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    expect(onsets).toHaveLength(3);
  });

  it('tells its pads from another source', () => {
    expect(isAccentTapSource(setup().source)).toBe(true);
    expect(isAccentTapSource(createFakeOnsetSource('tap'))).toBe(false);
  });
});
