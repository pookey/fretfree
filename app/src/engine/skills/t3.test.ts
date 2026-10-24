import { describe, expect, it } from 'vitest';
import { parseAccentItemId } from '../items/accent';
import { moduleOfTopic } from '../frontier';
import { getSkill } from './index';
import { T3_DRILLS, skills } from './t3';

const ids = (id: string) =>
  getSkill(id)!
    .items()
    .map((i) => i.id);

describe('T3 counting skills', () => {
  it('counts sixteenths and triplets first, then compound time', () => {
    expect(skills.map((s) => s.id)).toEqual(['T3.simple', 'T3.compound']);
    expect(ids('T3.simple')).toEqual(['count:2/4:4', 'count:4/4:4', 'count:4/4:3']);
    expect(ids('T3.compound')).toEqual(['count:6/8:3', 'count:9/8:3', 'count:12/8:3']);
    for (const s of skills) {
      expect(s.items().every((i) => parseAccentItemId(i.id)?.kind === 'count')).toBe(true);
      expect(s.items().every((i) => i.skillId === s.id)).toBe(true);
    }
  });

  it('opens after the eighths, and counts compound time once it is heard', () => {
    expect(getSkill('T3.simple')!.prerequisites).toEqual(['F4.eighths']);
    // Sound before symbol: hear 6/8 and 12/8 (T4) before counting them.
    expect(getSkill('T3.compound')!.prerequisites).toEqual(['T3.simple', 'T4.compound']);
    for (const s of skills) {
      expect(s).toMatchObject({ topic: 'T3', softUnlock: true, skipPlacement: true });
      expect(s.drillTypes).toEqual(T3_DRILLS);
    }
    expect(moduleOfTopic('T3')?.id).toBe('meter');
  });
});
