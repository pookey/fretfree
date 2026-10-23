import { describe, expect, it } from 'vitest';
import { moduleOfTopic } from '../frontier';
import { getSkill } from './index';
import { skills } from './t7';

describe('T7 odd-meter skill', () => {
  it('asks for 5/4 and 7/8 by ear, once the common meters are mastered', () => {
    const [odd] = skills;
    expect(odd!.items().map((i) => i.id)).toEqual(['meter-ear:5/4', 'meter-ear:7/8']);
    expect(odd).toMatchObject({
      id: 'T7.odd',
      topic: 'T7',
      prerequisites: ['T4.compound'],
      skipPlacement: true,
      drillTypes: ['hear-the-meter'],
    });
    // A hard gate (rule 7): advanced, so the common meters come first.
    expect(odd!.softUnlock).toBeUndefined();
    expect(odd!.order).toBeGreaterThan(getSkill('T4.compound')!.order);
    expect(moduleOfTopic('T7')?.id).toBe('meter');
  });
});
