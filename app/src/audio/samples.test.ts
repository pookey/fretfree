import { describe, expect, it } from 'vitest';
import { AUDIO } from './config';
import { sampleFor, sampleNotes, sampleUrl, velocityGain } from './samples';

const { low, high } = AUDIO.samples;

describe('sampleFor', () => {
  it('plays every note of the neck from its own sample', () => {
    for (const midi of sampleNotes()) expect(sampleFor(midi)).toEqual({ midi, rate: 1 });
  });

  it('shifts the nearest end for a note beyond the neck', () => {
    expect(sampleFor(low - 12)).toEqual({ midi: low, rate: 0.5 });
    expect(sampleFor(high + 12)).toEqual({ midi: high, rate: 2 });
  });
});

describe('sampleNotes', () => {
  it('runs from the open low E to fret 24 on the high E', () => {
    const notes = sampleNotes();
    expect(notes[0]).toBe(40);
    expect(notes.at(-1)).toBe(88);
    expect(notes).toHaveLength(49);
  });
});

describe('sampleUrl', () => {
  it('serves a sample under the base URL', () => {
    expect(sampleUrl(40)).toBe('/samples/nylon/40.mp3');
    expect(sampleUrl(88, '/app/')).toBe('/app/samples/nylon/88.mp3');
  });
});

describe('velocityGain', () => {
  it('runs from the floor at velocity 0 to 1 at full, clamped', () => {
    const { floor } = AUDIO.dynamics;
    expect(velocityGain(0)).toBe(floor);
    expect(velocityGain(1)).toBe(1);
    expect(velocityGain(0.5)).toBeCloseTo((floor + 1) / 2);
    expect(velocityGain(-1)).toBe(floor);
    expect(velocityGain(2)).toBe(1);
  });
});
