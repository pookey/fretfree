import { describe, expect, it } from 'vitest';
import { AUDIO } from './config';
import { sortLowToHigh, strumHits } from './strum';

const E_MAJOR = ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'];

describe('sortLowToHigh', () => {
  it('orders by pitch, not by name', () => {
    expect(sortLowToHigh(['E4', 'B2', 'G#3', 'E2'])).toEqual(['E2', 'B2', 'G#3', 'E4']);
  });

  it('keeps unparseable names at the end and leaves the input alone', () => {
    const notes = ['nope', 'C4', 'A2'];
    expect(sortLowToHigh(notes)).toEqual(['A2', 'C4', 'nope']);
    expect(notes).toEqual(['nope', 'C4', 'A2']);
  });
});

describe('strumHits', () => {
  it('runs a down-stroke low to high over every string', () => {
    const hits = strumHits([...E_MAJOR].reverse(), { gap: 0.02 });
    expect(hits.map((h) => h.note)).toEqual(E_MAJOR);
    expect(hits.map((h) => h.voice)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(hits[5]?.offset).toBeCloseTo(0.1);
  });

  it('defaults to a down-stroke at the configured gap', () => {
    const hits = strumHits(['A2', 'E3']);
    expect(hits).toEqual([
      { note: 'A2', voice: 0, offset: 0 },
      { note: 'E3', voice: 1, offset: AUDIO.strum.gap },
    ]);
  });

  it('runs an up-stroke high to low over the top strings, on their own voices', () => {
    const hits = strumHits(E_MAJOR, { direction: 'up', gap: 0.01 });
    expect(hits.map((h) => h.note)).toEqual(['E4', 'B3', 'G#3', 'E3']);
    expect(hits.map((h) => h.voice)).toEqual([5, 4, 3, 2]);
    expect(hits.map((h) => h.offset)).toEqual([0, 0.01, 0.02, 0.03]);
  });

  it('catches at least one string, and every string of a small chord', () => {
    expect(strumHits(E_MAJOR, { direction: 'up', upStrings: 0 })).toHaveLength(1);
    expect(strumHits(['A2', 'E3'], { direction: 'up' }).map((h) => h.note)).toEqual(['E3', 'A2']);
  });

  it('is empty for no notes', () => {
    expect(strumHits([])).toEqual([]);
  });
});
