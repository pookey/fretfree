import { describe, expect, it } from 'vitest';
import { noteAt } from '../../theory';
import { gatesOf } from '../mastery';
import { parseItemId } from '../model';
import { placementGroups } from '../../placement/algorithm';
import { C2_STAGE_IDS, skills } from './c2';
import { SKILLS } from './index';

const byId = (id: string) => skills.find((s) => s.id === id)!;
const ids = (id: string) =>
  byId(id)
    .items()
    .map((i) => i.id);

/** The string and note an item asks about. */
function cell(id: string): { string: number; pc: string } {
  const ref = parseItemId(id);
  if (ref?.kind === 'note') return { string: ref.position.string, pc: noteAt(ref.position).pc };
  if (ref?.kind === 'find') return { string: ref.string, pc: ref.pc };
  throw new Error(`Not a C2 item: ${id}`);
}

const natural = (pc: string) => !/[#b]/.test(pc);

describe('C2 stages (M10-12)', () => {
  it('runs naturals on strings 1, 4, 3 and 2, then sharps and flats on 6–5 and 4–1', () => {
    expect(C2_STAGE_IDS).toEqual([
      'C2.string1-naturals',
      'C2.string4-naturals',
      'C2.string3-naturals',
      'C2.string2-naturals',
      'C2.low-accidentals',
      'C2.all-notes',
    ]);
    expect(skills.map((s) => s.id)).toEqual(C2_STAGE_IDS);
    const orders = skills.map((s) => s.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('gives each naturals stage the naturals of its string, named and found', () => {
    for (const string of [1, 4, 3, 2]) {
      const items = ids(`C2.string${string}-naturals`);
      // Eight natural frets in 0–12 (the open note twice), and seven names to find.
      expect(items.filter((id) => id.startsWith('note@'))).toHaveLength(8);
      expect(items.filter((id) => id.startsWith('find:'))).toHaveLength(7);
      for (const id of items) expect(cell(id), id).toEqual({ string, pc: cell(id).pc });
      expect(items.every((id) => natural(cell(id).pc))).toBe(true);
    }
    expect(ids('C2.string1-naturals')).toContain('note@s1f8');
    expect(ids('C2.string2-naturals')).toContain('find:B@s2');
  });

  it('gives the accidentals stages the sharps and flats of their strings', () => {
    const low = ids('C2.low-accidentals');
    const high = ids('C2.all-notes');
    expect(low).toHaveLength(20);
    expect(high).toHaveLength(40);
    expect(new Set(low.map((id) => cell(id).string))).toEqual(new Set([6, 5]));
    expect(new Set(high.map((id) => cell(id).string))).toEqual(new Set([1, 4, 3, 2]));
    for (const id of [...low, ...high]) expect(natural(cell(id).pc), id).toBe(false);
    // String by string, in teaching order: string 1 first.
    expect(high[0]).toBe('note@s1f2');
    expect(low).toContain('find:F#@s6');
  });

  it('opens each stage once the one before is practising', () => {
    expect(gatesOf(byId('C2.string1-naturals'))).toEqual({
      mastered: [],
      practising: ['F2.string6-naturals', 'F2.string5-naturals'],
    });
    for (let i = 1; i < C2_STAGE_IDS.length; i++) {
      const gates = gatesOf(byId(C2_STAGE_IDS[i]!));
      expect(gates.mastered).toEqual([]);
      expect(gates.practising[0]).toBe(C2_STAGE_IDS[i - 1]);
    }
    // The probed stages also name the probed stage before, so placement,
    // which leaves the others out, skips them when that isn't known.
    expect(byId('C2.string2-naturals').prerequisites).toEqual([
      'C2.string3-naturals',
      'F2.string6-naturals',
      'F2.string5-naturals',
    ]);
    expect(byId('C2.all-notes').prerequisites).toEqual([
      'C2.low-accidentals',
      'C2.string2-naturals',
    ]);
    expect(byId('C2.string3-naturals').prerequisites).toEqual(['C2.string4-naturals']);
    // Strings 4 and 2 are reached by octave shapes (C1).
    expect(gatesOf(byId('C2.string4-naturals')).practising).toContain('C1.octaves');
    expect(gatesOf(byId('C2.string2-naturals')).practising).toContain('C1.octaves-gb-shift');
  });

  it('probes string 2’s naturals and the last stage in placement, each after the one before', () => {
    expect(skills.filter((s) => !s.skipPlacement).map((s) => s.id)).toEqual([
      'C2.string2-naturals',
      'C2.all-notes',
    ]);
    const groups = placementGroups(SKILLS, () => true).filter((g) => g.id.startsWith('C2.'));
    expect(groups.map((g) => [g.id, g.prerequisites])).toEqual([
      ['C2.string2-naturals', ['F2.string6-naturals', 'F2.string5-naturals']],
      ['C2.all-notes', ['C2.string2-naturals']],
    ]);
  });

  it('keeps every drill, hearing included, on every stage', () => {
    for (const s of skills)
      expect(s.drillTypes, s.id).toEqual([
        'name-the-note',
        'find-the-note',
        'play-the-note',
        'hear-it-find-it',
      ]);
  });
});
