import { describe, expect, it } from 'vitest';
import { playPlan } from './play';
import type { SheetBar } from './logic';

const bar = (rhythm: string, pitches: string[], bass: string | null): SheetBar => ({
  rhythm,
  pitches,
  bass,
  number: 1,
});

describe('playing a form in order', () => {
  it('plays every note of every bar in play order, the bass on each downbeat', () => {
    const bars = [bar('4', ['G4'], null), bar('2 8 8 4', ['C4', 'E4', 'G4', 'C5'], 'C3')];
    const plan = playPlan({ bars, order: [0, 1, 1] });
    expect(plan.chords[0]).toEqual({ notes: ['G4'], beats: 1 });
    expect(plan.chords[1]).toEqual({ notes: ['C3', 'C4'], beats: 2 });
    expect(plan.chords[2]).toEqual({ notes: ['E4'], beats: 0.5 });
    expect(plan.chords).toHaveLength(9);
    expect(plan.steps).toEqual([0, 1, 1, 1, 1, 2, 2, 2, 2]);
  });

  it('times 6/8 in quarter notes, and skips a bar it doesn’t have', () => {
    const plan = playPlan({ bars: [bar('4.', ['C4'], 'C3')], order: [0, 3] });
    expect(plan.chords).toEqual([{ notes: ['C3', 'C4'], beats: 1.5 }]);
  });
});
