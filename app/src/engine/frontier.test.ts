import { describe, expect, it } from 'vitest';
import {
  GOAL_PROFILES,
  MODULES,
  frontierLanes,
  moduleOfTopic,
  moduleRank,
  orderFrontier,
  orderModules,
  type Module,
} from './frontier';
import type { Goal, Skill } from './model';
import { SKILLS } from './skills';

const GOALS: Goal[] = ['songs', 'improvise', 'jazz', 'general'];

function skill(id: string, topic: string, order: number): Skill {
  return { id, topic, order, title: id, prerequisites: [], drillTypes: [], items: () => [] };
}

const ids = (skills: readonly Skill[]) => skills.map((s) => s.id);

describe('module catalogue', () => {
  it('has unique module IDs and gives every topic exactly one module', () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    const topics = MODULES.flatMap((m) => m.topics);
    expect(new Set(topics).size).toBe(topics.length);
  });

  it('lists the modules of design §5 in curriculum order', () => {
    expect(MODULES.map((m) => m.id).slice(0, 3)).toEqual(['notes-1', 'notes-2', 'intervals']);
    expect(moduleOfTopic('F2')?.id).toBe('notes-1');
    expect(moduleOfTopic('C2')?.id).toBe('notes-2');
    expect(moduleOfTopic('C8')?.id).toBe('harmony');
    expect(moduleOfTopic('I6')?.id).toBe('ear');
    expect(moduleOfTopic('C4')?.id).toBe('keys');
    expect(moduleOfTopic('Z9')).toBeUndefined();
  });

  it('places every registered skill in a module', () => {
    for (const s of SKILLS) expect(moduleOfTopic(s.topic), s.id).toBeDefined();
  });

  it('has only known modules in every goal profile', () => {
    const known = new Set(MODULES.map((m) => m.id));
    for (const goal of GOALS) {
      const promoted = GOAL_PROFILES[goal];
      expect(new Set(promoted).size).toBe(promoted.length);
      for (const id of promoted) expect(known.has(id), `${goal}: ${id}`).toBe(true);
    }
  });
});

describe('moduleRank', () => {
  it('puts promoted modules first, then the rest in default order', () => {
    expect(moduleRank('harmony', 'songs')).toBe(0);
    expect(moduleRank('progressions', 'songs')).toBe(1);
    expect(moduleRank('notes-1', 'songs')).toBe(GOAL_PROFILES.songs.length);
    expect(moduleRank('notes-1', 'general')).toBe(0);
    expect(moduleRank('unknown', 'general')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('orderModules', () => {
  it('keeps the default order for the general goal', () => {
    expect(orderModules('general')).toEqual(MODULES);
  });

  it('promotes the goal’s modules and keeps every module', () => {
    for (const goal of GOALS) {
      const ordered = orderModules(goal).map((m) => m.id);
      expect(ordered.slice(0, GOAL_PROFILES[goal].length)).toEqual(GOAL_PROFILES[goal]);
      expect([...ordered].sort()).toEqual(MODULES.map((m) => m.id).sort());
    }
    expect(orderModules('improvise')[0]?.id).toBe('pentatonic');
  });

  it('sorts unknown modules last without breaking the order', () => {
    const extra: Module = { ...(MODULES[0] as Module), id: 'extra', topics: [] };
    const other: Module = { ...extra, id: 'other' };
    const ordered = orderModules('songs', [extra, ...MODULES, other]).map((m) => m.id);
    expect(ordered.slice(-2)).toEqual(['extra', 'other']);
    expect(ordered[0]).toBe('harmony');
  });
});

describe('orderFrontier', () => {
  const f2 = skill('F2.string6-naturals', 'F2', 200);
  const f1 = skill('F1.alphabet', 'F1', 100);
  const c2 = skill('C2.all-notes', 'C2', 1200);
  const c8 = skill('C8.numerals-major', 'C8', 800);
  const c6 = skill('C6.caged-E-shape', 'C6', 600);
  const c7 = skill('C7.minor-pentatonic', 'C7', 700);
  const frontier = [c2, f2, c8, c7, f1, c6];

  it('keeps the curriculum order for the general goal', () => {
    expect(ids(orderFrontier(frontier, 'general'))).toEqual([
      f1.id,
      f2.id,
      c2.id,
      c8.id,
      c6.id,
      c7.id,
    ]);
  });

  it('puts harmony first for songs', () => {
    expect(ids(orderFrontier(frontier, 'songs'))).toEqual([
      c8.id,
      f1.id,
      f2.id,
      c2.id,
      c6.id,
      c7.id,
    ]);
  });

  it('puts boxes and shapes first for improvising', () => {
    expect(ids(orderFrontier(frontier, 'improvise')).slice(0, 2)).toEqual([c7.id, c6.id]);
  });

  it('orders by skill order, then ID, within a module', () => {
    const a = skill('F2.b', 'F2', 200);
    const b = skill('F2.a', 'F2', 200);
    expect(ids(orderFrontier([f2, a, b, f1], 'jazz'))).toEqual([f1.id, b.id, a.id, f2.id]);
  });

  it('puts skills outside any module last, and is pure', () => {
    const stray = skill('Z9.thing', 'Z9', 1);
    const stray2 = skill('Z9.other', 'Z9', 0);
    const input = [stray, f2, stray2];
    expect(ids(orderFrontier(input, 'general'))).toEqual([f2.id, stray2.id, stray.id]);
    expect(ids(input)).toEqual([stray.id, f2.id, stray2.id]);
  });

  it('only reorders: the same skills come out for every goal', () => {
    for (const goal of GOALS) {
      expect(ids(orderFrontier(SKILLS, goal)).sort()).toEqual(ids(SKILLS).sort());
    }
  });
});

describe('key signatures', () => {
  it('is its own module, after Harmony and out of the Keys lane', () => {
    const order = MODULES.map((m) => m.id);
    expect(moduleOfTopic('I3')?.id).toBe('key-signatures');
    expect(order.indexOf('key-signatures')).toBeGreaterThan(order.indexOf('harmony'));
    for (const goal of GOALS) {
      expect(moduleRank('key-signatures', goal)).toBeGreaterThan(moduleRank('harmony', goal));
    }
  });
});

describe('frontierLanes', () => {
  const f1 = skill('F1.alphabet', 'F1', 100);
  const c2 = skill('C2.all-notes', 'C2', 1200);
  const c3 = skill('C3.thirds', 'C3', 1300);
  const c4 = skill('C4.sharp-keys', 'C4', 1400);
  const c8 = skill('C8.numerals-major', 'C8', 1598);
  const f4 = skill('F4.pulse', 'F4', 400);
  const i6 = skill('I6.intervals-fourths-fifths', 'I6', 2500);
  const all = [i6, c8, c4, c3, c2, f4, f1];
  const lane = (lanes: ReturnType<typeof frontierLanes>, id: string) =>
    lanes.find((l) => l.id === id);

  it('splits goal modules, the neck and each parallel track, in today’s order', () => {
    const lanes = frontierLanes(all, 'songs');
    expect(ids(lane(lanes, 'goal')!.skills)).toEqual([c8.id, c4.id, c3.id]);
    expect(ids(lane(lanes, 'neck')!.skills)).toEqual([f1.id, c2.id]);
    expect(ids(lane(lanes, 'ear')!.skills)).toEqual([i6.id]);
    expect(ids(lane(lanes, 'rhythm')!.skills)).toEqual([f4.id]);
    // Songs promotes Harmony, so the goal lane leads.
    expect(lanes[0]?.id).toBe('goal');
  });

  it('shares 2:1:1, splitting the parallel share between open tracks', () => {
    const lanes = frontierLanes(all, 'general');
    expect(lanes.map((l) => [l.id, l.share])).toEqual([
      ['neck', 1],
      ['goal', 2],
      ['rhythm', 0.5],
      ['ear', 0.5],
    ]);
    expect(lanes.map((l) => l.group)).toEqual([undefined, undefined, 'parallel', 'parallel']);
    const one = frontierLanes([f1, c3, i6], 'general');
    expect(lane(one, 'ear')?.share).toBe(1);
  });

  it('uses the default module order for a goal that promotes none', () => {
    expect(ids(lane(frontierLanes(all, 'general'), 'goal')!.skills)).toEqual([c3.id, c4.id, c8.id]);
    expect(ids(lane(frontierLanes(all, 'improvise'), 'goal')!.skills)[0]).toBe(c3.id);
  });

  it('keeps the very first session to Neck basics', () => {
    const lanes = frontierLanes([f1, f4, i6], 'songs', { firstSession: true });
    expect(lanes.map((l) => l.id)).toEqual(['neck']);
    // Unless a parallel track is all that is open.
    expect(frontierLanes([f4], 'songs', { firstSession: true }).map((l) => l.id)).toEqual([
      'rhythm',
    ]);
  });

  it('leaves out empty lanes', () => {
    expect(frontierLanes([], 'general')).toEqual([]);
    expect(frontierLanes([c4], 'jazz').map((l) => l.id)).toEqual(['goal']);
  });

  it('puts every frontier skill in exactly one lane, for every goal', () => {
    for (const goal of GOALS) {
      const lanes = frontierLanes(SKILLS, goal);
      expect(lanes.flatMap((l) => ids(l.skills)).sort()).toEqual(ids(SKILLS).sort());
    }
  });
});
