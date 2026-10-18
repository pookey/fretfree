import { describe, expect, it } from 'vitest';
import { EXPLORE_VIEWS } from './explore/registry';
import { PROGRESS_PANELS } from './progress/registry';
import { TODAY_CARDS } from './today/registry';

describe('screen registries', () => {
  it('composes Today from the hero, streak repair, the install tip, quests, the stats, then quick drills', () => {
    expect(TODAY_CARDS.map((c) => c.id)).toEqual([
      'hero',
      'streak-repair',
      'install',
      'quests',
      'stats',
      'quick-drills',
    ]);
    for (const c of TODAY_CARDS) expect(typeof c.Card).toBe('function');
  });

  it('composes Progress from the mastery map, stats, then achievements', () => {
    expect(PROGRESS_PANELS.map((p) => [p.id, p.title])).toEqual([
      ['heatmap', 'Mastery map'],
      ['stats', undefined],
      ['achievements', 'Achievements'],
    ]);
  });

  it('lists the fretboard explorer as the first Explore view', () => {
    expect(EXPLORE_VIEWS[0]).toMatchObject({
      id: 'fretboard-explorer',
      title: 'Fretboard explorer',
    });
  });
});
