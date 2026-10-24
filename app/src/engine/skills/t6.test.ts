import { describe, expect, it } from 'vitest';
import { parseFormItemId } from '../items/form';
import { moduleOfTopic } from '../frontier';
import { getSkill } from './index';
import { T6_DRILLS, skills } from './t6';

const ids = (id: string) =>
  getSkill(id)!
    .items()
    .map((i) => i.id);

describe('T6 form skills', () => {
  it('reads pickups, then repeats, endings, and pickups in 6/8', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'T6.pickups',
      'T6.repeats',
      'T6.endings',
      'T6.pickups-compound',
    ]);
    expect(ids('T6.pickups').slice(0, 2)).toEqual(['pickup:4/4:1:bar', 'pickup:4/4:1:start']);
    expect(ids('T6.pickups')).toHaveLength(10);
    expect(ids('T6.pickups-compound')).toEqual([
      'pickup:6/8:1:bar',
      'pickup:6/8:1:start',
      'pickup:6/8:3:bar',
      'pickup:6/8:3:start',
    ]);
    // Both cards of each road map, the begin repeat beside its absence (rule 6).
    expect(ids('T6.repeats')).toContain('form:repeat-inner:next');
    expect(ids('T6.repeats')).toContain('form:repeat-from-start:order');
    expect(ids('T6.endings')).toHaveLength(8);
    for (const s of skills)
      expect(s.items().every((i) => parseFormItemId(i.id) !== null)).toBe(true);
  });

  it('opens after reading a time signature; endings after repeats; 6/8 after compound time', () => {
    expect(getSkill('T6.pickups')!.prerequisites).toEqual(['T1.simple-meters']);
    expect(getSkill('T6.repeats')!.prerequisites).toEqual(['T1.simple-meters']);
    expect(getSkill('T6.endings')!.prerequisites).toEqual(['T6.repeats']);
    expect(getSkill('T6.pickups-compound')!.prerequisites).toContain('T2.compound-meters');
    for (const s of skills) {
      expect(s).toMatchObject({ topic: 'T6', softUnlock: true, skipPlacement: true });
      expect(s.drillTypes).toEqual(T6_DRILLS);
    }
    expect(moduleOfTopic('T6')?.id).toBe('meter');
  });
});
