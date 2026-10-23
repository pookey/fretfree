import { describe, expect, it } from 'vitest';
import { EXPLORE_VIEWS } from './explore/registry';
import { PROGRESS_PANELS } from './progress/registry';
import { TODAY_CARDS } from './today/registry';

describe('screen registries', () => {
  it('composes Today from the hero, the install tip, streak repair, quests, the stats, quick drills, then the account offer', () => {
    expect(TODAY_CARDS.map((c) => c.id)).toEqual([
      'hero',
      'install',
      'streak-repair',
      'quests',
      'stats',
      'quick-drills',
      'account',
    ]);
    for (const c of TODAY_CARDS) expect(typeof c.Card).toBe('function');
  });

  it('composes Progress from the mastery map, the over-time charts, topics, stats, the calendar, achievements, then the account', () => {
    expect(PROGRESS_PANELS.map((p) => [p.id, p.title])).toEqual([
      ['heatmap', 'Mastery map'],
      ['over-time', 'Over time'],
      ['coming-up', 'Coming up'],
      ['topics', 'Topics'],
      ['stats', undefined],
      ['calendar', 'Practice calendar'],
      ['achievements', 'Achievements'],
      ['account', undefined],
    ]);
  });

  it('lists the fretboard explorer as the first Explore view', () => {
    expect(EXPLORE_VIEWS[0]).toMatchObject({
      id: 'fretboard-explorer',
      title: 'Fretboard explorer',
    });
  });
});
