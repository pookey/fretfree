import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../config';
import { parseStaffIntervalItemId, STAFF_INTERVALS } from '../items/staff-interval';
import { R5_SIZES, r5ItemIds, skills } from './r5';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('R5 skills', () => {
  it('reads every interval from a step to an octave, each in one set', () => {
    expect(Object.values(R5_SIZES).flat()).toEqual(STAFF_INTERVALS);
  });

  it('asks each size up and down, both ways', () => {
    const list = ids('R5.steps-skips');
    expect(list).toHaveLength(8);
    // The step up comes first, worked through.
    expect(list[0]).toBe('staff-interval:+2@treble8vb');
    expect(list).toContain('staff-interval:-3@treble8vb:place');
    for (const id of list) expect(parseStaffIntervalItemId(id)?.clef).toBe('treble8vb');
    expect(ids('R5.wide')).toHaveLength(12);
  });

  it("keeps a card's placing direction a new-item block after its reading one", () => {
    const block = ENGINE_CONFIG.session.newBlockSize;
    for (const s of skills) {
      const list = ids(s.id);
      expect(new Set(list).size).toBe(R5_SIZES[s.id]!.length * 4);
      for (const id of list.filter((i) => i.endsWith(':place'))) {
        const read = list.indexOf(id.replace(/:place$/, ''));
        expect(list.indexOf(id) - read, id).toBeGreaterThanOrEqual(block);
      }
    }
    expect(r5ItemIds([2], 1)).toEqual([
      'staff-interval:+2@treble8vb',
      'staff-interval:+2@treble8vb:place',
      'staff-interval:-2@treble8vb',
      'staff-interval:-2@treble8vb:place',
    ]);
  });

  it('opens early in Track R, once the staff is practising, one set at a time', () => {
    expect(skills.map((s) => [s.id, s.prerequisites])).toEqual([
      ['R5.steps-skips', ['R1.staff']],
      ['R5.fourths-fifths', ['R5.steps-skips']],
      ['R5.wide', ['R5.fourths-fifths']],
    ]);
    // Before R1's ledger lines on the frontier.
    expect(skills[0]!.order).toBeLessThan(getSkill('R1.ledger-below')!.order);
    expect(skills[0]!.order).toBeGreaterThan(getSkill('R1.staff')!.order);
    for (const s of skills) {
      expect(s.topic).toBe('R5');
      expect(s.softUnlock).toBe(true);
      expect(s.drillTypes).toEqual(['staff-interval']);
    }
  });
});
