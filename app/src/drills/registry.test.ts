import { describe, expect, it } from 'vitest';
import { parseItemId, type ItemRef } from '../engine/model';
import { SKILLS } from '../engine/skills';
import { DRILLS, getDrill } from './registry';

/**
 * Drills that skills already name but later work packages build, with the item
 * kinds each must serve. Once a drill is registered it drops out of this list's
 * effect and must test those items itself.
 */
const PENDING: Record<string, readonly ItemRef['kind'][]> = {
  'find-the-note': ['find'],
  'note-wheel': ['step', 'letter'],
  'fret-landmarks': ['marker', 'find-marker', 'repeat'],
  'octave-finder': ['octave'],
  'interval-name': ['interval-name'],
  'interval-tap': ['interval'],
};

describe('drill registry', () => {
  it('has unique IDs and resolves by ID', () => {
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    expect(getDrill('name-the-note')?.title).toMatch(/highlighted/);
    expect(getDrill('nope')).toBeUndefined();
  });

  it('lists every skill it is named by', () => {
    for (const skill of SKILLS) {
      for (const drillId of skill.drillTypes) {
        const drill = getDrill(drillId);
        if (drill) expect(drill.skills).toContain(skill.id);
        else expect(Object.keys(PENDING), `${skill.id} → ${drillId}`).toContain(drillId);
      }
    }
  });

  it('serves every item of every skill, or leaves it to a drill not yet built', () => {
    for (const skill of SKILLS) {
      const drills = skill.drillTypes.flatMap((id) => getDrill(id) ?? []);
      const pendingKinds = skill.drillTypes.flatMap((id) =>
        getDrill(id) ? [] : (PENDING[id] ?? []),
      );
      for (const item of skill.items()) {
        if (drills.some((d) => d.canTest(item))) continue;
        expect(pendingKinds, item.id).toContain(parseItemId(item.id)?.kind);
      }
    }
  });
});
