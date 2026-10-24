import { describe, expect, it } from 'vitest';
import { RHYTHM_CELLS } from '../../theory/rhythm';
import { itemId, parseItemId } from '../model';
import rhythmCell, { parseRhythmCellItemId, rhythmCellItemId } from './rhythm-cell';
import { parseRhythmPatternItemId } from './rhythm-pattern';

describe('rhythm-cell items', () => {
  it('builds and parses `rhythm:<cell>`', () => {
    expect(rhythmCellItemId('dotted-8th-16th')).toBe('rhythm:dotted-8th-16th');
    expect(parseRhythmCellItemId('rhythm:siciliano')).toEqual({
      kind: 'rhythm',
      slug: 'siciliano',
    });
  });

  it('round-trips every cell in the catalogue through the item registry', () => {
    for (const cell of RHYTHM_CELLS) {
      const ref = parseItemId(cell.id);
      expect(ref).toEqual({ kind: 'rhythm', slug: cell.slug });
      expect(itemId(ref!)).toBe(cell.id);
    }
    expect(rhythmCell.kinds).toEqual(['rhythm']);
  });

  it('rejects cells that are not in the catalogue and other families’ IDs', () => {
    for (const id of [
      'rhythm:',
      'rhythm:dotted-8th',
      'rhythm:Quarter',
      'rhythm:quarter:4/4',
      'tap-rhythm:quarters',
      'meter:4/4:feltBeats',
    ]) {
      expect(parseRhythmCellItemId(id), id).toBeNull();
    }
    expect(() => rhythmCellItemId('nope')).toThrow(RangeError);
  });

  it('shares no IDs with the F4 rhythm patterns', () => {
    for (const cell of RHYTHM_CELLS) expect(parseRhythmPatternItemId(cell.id)).toBeNull();
    expect(parseRhythmCellItemId('tap-rhythm:eighths')).toBeNull();
  });
});
