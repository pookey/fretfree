import { describe, expect, it } from 'vitest';
import { parseMeterEarItemId } from '../items/meter-ear';
import { moduleOfTopic } from '../frontier';
import { getSkill } from './index';
import { T4_DRILLS, skills } from './t4';

const ids = (id: string) =>
  getSkill(id)!
    .items()
    .map((i) => i.id);

describe('T4 meter-by-ear skills', () => {
  it('starts with the simple meters, then the compound ones', () => {
    expect(skills.map((s) => s.id)).toEqual(['T4.simple', 'T4.compound']);
    expect(ids('T4.simple')).toEqual(['meter-ear:4/4', 'meter-ear:3/4']);
    expect(ids('T4.compound')).toEqual(['meter-ear:6/8', 'meter-ear:12/8']);
    for (const s of skills) {
      expect(s.items().every((i) => parseMeterEarItemId(i.id) && i.skillId === s.id)).toBe(true);
    }
  });

  it('opens with the pulse, by sound alone, and stays out of placement', () => {
    // Sound before symbol: no reading skill (T1, T2) gates it.
    expect(getSkill('T4.simple')!.prerequisites).toEqual(['F4.pulse']);
    expect(getSkill('T4.compound')!.prerequisites).toEqual(['T4.simple']);
    for (const s of skills) {
      expect(s).toMatchObject({ topic: 'T4', softUnlock: true, skipPlacement: true });
      expect(s.drillTypes).toEqual(T4_DRILLS);
      expect(s.order).toBeGreaterThan(getSkill('F4.pulse')!.order);
    }
    expect(moduleOfTopic('T4')?.id).toBe('meter');
  });
});
