import { describe, expect, it } from 'vitest';
import { AUDIO } from './config';
import { chordLevel, sortLowToHigh, strumHits } from './strum';

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
      { note: 'A2', voice: 0, offset: 0, velocity: 1, level: 1 },
      { note: 'E3', voice: 1, offset: AUDIO.strum.gap, velocity: 1, level: 1 },
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

  it('plays an up-stroke a little lighter', () => {
    const { upStroke } = AUDIO.dynamics;
    const hits = strumHits(E_MAJOR, { direction: 'up' });
    expect(hits.every((h) => h.velocity === 1 - upStroke)).toBe(true);
  });

  it('varies velocity and gaps within their ranges, given an rng', () => {
    const { strumVelocity, gapJitter } = AUDIO.dynamics;
    const lows = strumHits(E_MAJOR, { gap: 0.02, rng: () => 0 });
    const highs = strumHits(E_MAJOR, { gap: 0.02, rng: () => 0.999999 });
    expect(lows.map((h) => h.velocity)).toEqual(Array(6).fill(strumVelocity[0]));
    expect(highs[0]?.velocity).toBeCloseTo(strumVelocity[1]);
    expect(lows[5]?.offset).toBeCloseTo(5 * 0.02 * (1 - gapJitter));
    expect(highs[5]?.offset).toBeCloseTo(5 * 0.02 * (1 + gapJitter), 5);
    // Still in order: a strum never doubles back.
    for (const hits of [lows, highs]) {
      for (let i = 1; i < hits.length; i++) {
        expect(hits[i]!.offset).toBeGreaterThan(hits[i - 1]!.offset);
      }
    }
  });

  it('turns a full chord down, so six strings are not six times louder', () => {
    expect(strumHits(E_MAJOR)[0]?.level).toBeCloseTo(chordLevel(6));
    expect(strumHits(E_MAJOR, { direction: 'up' })[0]?.level).toBeCloseTo(chordLevel(4));
  });
});

describe('chordLevel', () => {
  it('is 1 up to the threshold, then √(threshold / notes)', () => {
    const { chordNotes } = AUDIO.dynamics;
    expect(chordLevel(0)).toBe(1);
    expect(chordLevel(1)).toBe(1);
    expect(chordLevel(2)).toBe(1);
    expect(chordLevel(6)).toBeCloseTo(Math.sqrt(chordNotes / 6));
  });
});
