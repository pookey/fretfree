import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine/skills';
import { createDrillPicker } from '../../session/drill-picker';
import { DRILLS } from '../registry';
import { D5_ID } from './logic';

/** The session's drill picker (M1-17) serves every C3 interval-name item with D5. */
describe('D5 in the drill picker', () => {
  const picker = createDrillPicker(SKILLS, DRILLS);
  const items = SKILLS.filter((s) => s.topic === 'C3')
    .flatMap((s) => s.items())
    .filter((i) => i.id.startsWith('interval-name:'));

  it('picks D5 for every interval-name item, whatever served it last', () => {
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(picker.canServe(item), item.id).toBe(true);
      expect(picker.pick(item)?.id, item.id).toBe(D5_ID);
      expect(picker.pick(item, D5_ID)?.id, item.id).toBe(D5_ID);
    }
  });

  it('never offers D5 for the tap direction', () => {
    for (const item of SKILLS.flatMap((s) => s.items())) {
      if (item.id.startsWith('interval-name:')) continue;
      expect(
        picker.candidates(item).map((d) => d.id),
        item.id,
      ).not.toContain(D5_ID);
    }
  });
});
