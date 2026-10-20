import { describe, expect, it } from 'vitest';
import type { ChordKind, IntervalName } from '../../theory';
import { itemId, parseItemId } from '../model';
import {
  earChordItemId,
  earIntervalItemId,
  parseEarItemId,
  progressionEarItemId,
  type EarDirection,
} from './ear';

describe('ear item IDs', () => {
  it('formats and parses an interval in each direction', () => {
    for (const direction of ['up', 'down', 'together'] as const) {
      const id = earIntervalItemId('M3', direction);
      expect(id).toBe(`ear-interval:M3:${direction}`);
      expect(parseEarItemId(id)).toEqual({ kind: 'ear-interval', interval: 'M3', direction });
      expect(itemId(parseItemId(id)!)).toBe(id);
    }
  });

  it('formats and parses a chord quality', () => {
    expect(earChordItemId('m7b5')).toBe('ear-chord:m7b5');
    expect(parseEarItemId('ear-chord:minor')).toEqual({ kind: 'ear-chord', chord: 'minor' });
    expect(itemId({ kind: 'ear-chord', chord: 'maj7' })).toBe('ear-chord:maj7');
  });

  it('formats and parses a progression by ear, beside C9’s tasks', () => {
    expect(progressionEarItemId('I-V-vi-IV')).toBe('prog:I-V-vi-IV:ear');
    expect(parseItemId('prog:I-V-vi-IV:ear')).toEqual({
      kind: 'progression-ear',
      progression: 'I-V-vi-IV',
    });
    // C9's own tasks stay with items/progression.ts.
    expect(parseEarItemId('prog:I-V-vi-IV:build')).toBeNull();
    expect(parseItemId('prog:I-V-vi-IV:build')?.kind).toBe('progression');
  });

  it('refuses what would not parse', () => {
    expect(() => earIntervalItemId('P1', 'up')).toThrow(RangeError);
    expect(() => earIntervalItemId('X9' as IntervalName, 'up')).toThrow(RangeError);
    expect(() => earIntervalItemId('M3', 'sideways' as EarDirection)).toThrow(RangeError);
    expect(() => earChordItemId('power' as ChordKind)).toThrow(RangeError);
    expect(() => progressionEarItemId('nope')).toThrow(RangeError);
  });

  it('parses only the canonical form', () => {
    for (const id of [
      'ear-interval:P1:up',
      'ear-interval:M9:up',
      'ear-interval:M3:sideways',
      'ear-interval:M3',
      'ear-chord:power',
      'ear-chord:',
      'prog:nope:ear',
      'prog:I-V-vi-IV:ear ',
    ]) {
      expect(parseEarItemId(id), id).toBeNull();
    }
  });
});
