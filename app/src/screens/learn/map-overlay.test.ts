import { describe, expect, it } from 'vitest';
import { SKILLS, isFrontier, type SkillStatus } from '../../engine';
import { buildMap, skillStatuses, type MapInput } from './map-model';

// M1-36: the development build's "unlock every skill" overlay on the Learn map.

const chords = (map: ReturnType<typeof buildMap>) => map.find((m) => m.module.id === 'chords');

const input = (over: Partial<MapInput> = {}): MapInput => ({
  skills: SKILLS,
  goal: 'general',
  stored: new Map<string, SkillStatus>([['F1.half-steps', 'mastered']]),
  cards: [],
  ...over,
});

describe('the unlock-all overlay', () => {
  it('puts every unmastered skill on the frontier, and opens every built module', () => {
    const map = buildMap(input({ overlay: { unlockAll: true } }));
    for (const view of map.flatMap((m) => m.skills)) {
      if (view.status !== 'mastered') expect(isFrontier(view.status)).toBe(true);
    }
    expect(chords(map)?.state).toBe('open');
    expect(map.filter((m) => m.skills.length > 0).every((m) => m.state !== 'locked')).toBe(true);
  });

  it('keeps mastered skills mastered', () => {
    const statuses = skillStatuses(SKILLS, input().stored, { unlockAll: true });
    expect(statuses.get('F1.half-steps')).toBe('mastered');
  });

  it('restores the real map exactly once it is off', () => {
    const real = buildMap(input());
    expect(chords(real)?.state).toBe('locked');
    expect(buildMap(input({ overlay: { unlockAll: true } }))).not.toEqual(real);
    expect(buildMap(input({ overlay: { unlockAll: false } }))).toEqual(real);
    expect(buildMap(input({ overlay: null }))).toEqual(real);
  });

  it('leaves the stored statuses it was given untouched', () => {
    const stored = new Map<string, SkillStatus>([['C3.thirds', 'locked']]);
    const before = new Map(stored);
    buildMap(input({ stored, overlay: { unlockAll: true } }));
    expect(stored).toEqual(before);
  });
});
