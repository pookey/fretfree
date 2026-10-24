import { describe, expect, it } from 'vitest';
import { parseAccentItemId } from '../items/accent';
import { moduleOfTopic } from '../frontier';
import { getSkill } from './index';
import { T3_DRILLS } from './t3';
import { skills } from './t5';

const ids = (id: string) =>
  getSkill(id)!
    .items()
    .map((i) => i.id);

describe('T5 accent skills', () => {
  it('finds the downbeat, then the backbeat, strums, and odd groupings', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'T5.downbeat',
      'T5.backbeat',
      'T5.strumming',
      'T5.odd',
    ]);
    expect(ids('T5.downbeat')).toEqual([
      'accent:4/4:downbeat',
      'accent:3/4:downbeat',
      'accent:2/4:downbeat',
    ]);
    expect(ids('T5.backbeat')).toEqual(['accent:4/4:backbeat', 'accent:12/8:backbeat']);
    expect(ids('T5.odd')).toEqual(['accent:5/4:grouping', 'accent:7/8:grouping']);
    for (const s of skills) {
      expect(s.items().every((i) => parseAccentItemId(i.id)?.kind === 'accent')).toBe(true);
    }
  });

  it('opens with the pulse, strums after F4’s strumming, and groups after T7', () => {
    expect(getSkill('T5.downbeat')!.prerequisites).toEqual(['F4.pulse']);
    expect(getSkill('T5.strumming')!.prerequisites).toContain('F4.strumming');
    expect(getSkill('T5.odd')!.prerequisites).toContain('T7.odd');
    for (const s of skills) {
      expect(s).toMatchObject({ topic: 'T5', softUnlock: true, skipPlacement: true });
      expect(s.drillTypes).toEqual(T3_DRILLS);
    }
    expect(moduleOfTopic('T5')?.id).toBe('meter');
  });
});
