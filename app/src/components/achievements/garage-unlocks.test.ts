import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../engine/gamification/achievements';
import type { CatalogueItem } from '../../engine/garage/types';
import { garageUnlocks, garageUnlocksByBadge } from './garage-unlocks';

const finish = (id: string, name: string, unlockedBy?: string): CatalogueItem => ({
  id,
  category: 'finish',
  name,
  ...(unlockedBy === undefined ? { price: 100 } : { unlockedBy }),
  render: { type: 'solid', stops: [{ offset: 0, colour: '#000' }] },
});

describe('garageUnlocksByBadge', () => {
  it('groups unlockable parts by badge, in catalogue order, and skips priced parts', () => {
    const map = garageUnlocksByBadge([
      finish('finish.a', 'A', 'b1'),
      finish('finish.red', 'Red'),
      finish('finish.b', 'B', 'b2'),
      finish('finish.c', 'C', 'b1'),
      {
        id: 'board.x',
        category: 'board',
        name: 'X',
        unlockedBy: 'b2',
        render: {
          palette: {
            '--wood': '#000',
            '--wood-dark': '#000',
            '--string': '#fff',
            '--fret-wire': '#fff',
            '--inlay': '#fff',
          },
        },
      },
    ]);
    expect([...map.keys()]).toEqual(['b1', 'b2']);
    expect(map.get('b1')!.map((p) => p.name)).toEqual(['A', 'C']);
    expect(map.get('b2')).toEqual([
      { id: 'finish.b', name: 'B', noun: 'finish' },
      { id: 'board.x', name: 'X', noun: 'fretboard' },
    ]);
  });
});

describe('garageUnlocks', () => {
  it('names the six mastery finishes from the catalogue', () => {
    const names = Object.fromEntries(
      ACHIEVEMENTS.map((a) => [a.id, garageUnlocks(a.id).map((p) => `${p.name} ${p.noun}`)]),
    );
    expect(names['whole-neck']).toEqual(['Gold leaf finish']);
    expect(names['speed-demon']).toEqual(['Lightning sparkle finish']);
    expect(names['string-6-master']).toEqual(['Ember burst finish']);
    expect(names['string-1-master']).toEqual(['Ice burst finish']);
    expect(names['mic-notes']).toEqual(['Moon pearl finish']);
    expect(names['mic-sequences']).toEqual(['Aurora sparkle finish']);
    expect(Object.values(names).filter((n) => n.length > 0)).toHaveLength(6);
  });

  it('is empty for a badge that unlocks nothing', () => {
    expect(garageUnlocks('streak-7')).toEqual([]);
    expect(garageUnlocks('no-such-badge')).toEqual([]);
  });
});
