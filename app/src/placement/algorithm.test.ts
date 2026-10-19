import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { SKILLS } from '../engine/skills';
import type { Item, Skill } from '../engine/model';
import { DRILLS } from '../drills/registry';
import { ENGINE_CONFIG } from '../engine/config';
import { createDrillPicker } from '../session/drill-picker';
import {
  answerProbe,
  knownItems,
  nextProbe,
  placementGroups,
  probeOutcome,
  probeTier,
  progress,
  shuffled,
  startPlacement,
  verdicts,
  type GroupInput,
  type PlacementState,
  type ProbeOutcome,
} from './algorithm';

const items = (skillId: string, n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${skillId}#${i}`, skillId }));

const group = (id: string, n: number, prerequisites: string[] = []): GroupInput => ({
  id,
  items: items(id, n),
  prerequisites,
});

/** A seeded LCG, so shuffles are deterministic. */
function lcg(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

/** Answer every probe with `answer(groupId)` until the test ends, at `elapsedMs` 0. */
function run(state: PlacementState, answer: (groupId: string) => ProbeOutcome): PlacementState {
  for (let p = nextProbe(state, 0); p; p = nextProbe(state, 0)) {
    state = answerProbe(state, p, answer(p.group.id));
  }
  return state;
}

/** The group IDs probed, in the order the probes came. */
const probedGroups = (s: PlacementState) => s.answers.map((a) => a.groupId);

describe('probeTier', () => {
  it('scales the probes with the group size and caps them at its items', () => {
    expect(probeTier(4)).toEqual({ probes: 3, knownAt: 3 });
    expect(probeTier(15)).toEqual({ probes: 4, knownAt: 3 });
    expect(probeTier(138)).toEqual({ probes: 6, knownAt: 5 });
    expect(probeTier(2)).toEqual({ probes: 2, knownAt: 2 });
  });

  it('falls back to the last tier when none covers the size', () => {
    expect(probeTier(99, [{ upTo: 8, probes: 3, knownAt: 2 }])).toEqual({ probes: 3, knownAt: 2 });
  });
});

describe('shuffled', () => {
  it('permutes a copy, deterministically for a given rng', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const a = shuffled(xs, lcg(7));
    expect([...a].sort()).toEqual(xs);
    expect(shuffled(xs, lcg(7))).toEqual(a);
    expect(xs).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('the adaptive probe', () => {
  it('settles a group as known after `knownAt` fluent probes', () => {
    let s = startPlacement([group('a', 15)], lcg());
    for (let n = 0; n < 3; n++) {
      expect(verdicts(s).get('a')).toBe('open');
      s = answerProbe(s, nextProbe(s, 0)!, 'fluent');
    }
    expect(verdicts(s).get('a')).toBe('known');
    expect(nextProbe(s, 0)).toBeNull();
  });

  it('settles a group as not known once the pass mark is out of reach', () => {
    // 4 probes, 3 to pass: one miss still leaves a pass possible, two don't.
    let s = startPlacement([group('a', 15)], lcg());
    s = answerProbe(s, nextProbe(s, 0)!, 'wrong');
    expect(verdicts(s).get('a')).toBe('open');
    s = answerProbe(s, nextProbe(s, 0)!, 'slow');
    expect(verdicts(s).get('a')).toBe('unknown');
  });

  it('allows one miss in a 4-probe group and keeps the missed item out of the known set', () => {
    let s = startPlacement([group('a', 15)], lcg());
    const outcomes: ProbeOutcome[] = ['fluent', 'wrong', 'fluent', 'fluent'];
    for (const o of outcomes) s = answerProbe(s, nextProbe(s, 0)!, o);
    expect(verdicts(s).get('a')).toBe('known');
    const missed = s.answers[1]!.itemId;
    const known = knownItems(s).map((i) => i.id);
    expect(known).toHaveLength(14);
    expect(known).not.toContain(missed);
  });

  it('never asks the same item twice in a group', () => {
    let s = startPlacement([group('a', 15), group('b', 15)], lcg(3));
    const seen = new Set<string>();
    for (let p = nextProbe(s, 0); p; p = nextProbe(s, 0)) {
      expect(seen.has(p.item.id)).toBe(false);
      seen.add(p.item.id);
      s = answerProbe(s, p, seen.size % 2 ? 'fluent' : 'wrong');
    }
  });

  it('samples the items at random', () => {
    const first = (seed: number) =>
      nextProbe(startPlacement([group('a', 15)], lcg(seed)), 0)!.item.id;
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(first)).size).toBeGreaterThan(1);
  });

  it('skips a group whose prerequisite is not known, and everything after it', () => {
    const groups = [
      group('thirds', 15),
      group('fifths', 15, ['thirds']),
      group('sevenths', 15, ['fifths']),
      group('other', 15),
    ];
    const s = run(startPlacement(groups, lcg()), (g) => (g === 'thirds' ? 'wrong' : 'fluent'));
    expect(Object.fromEntries(verdicts(s))).toEqual({
      thirds: 'unknown',
      fifths: 'skipped',
      sevenths: 'skipped',
      other: 'known',
    });
    expect(new Set(probedGroups(s))).toEqual(new Set(['thirds', 'other']));
  });

  it('probes the later groups when the earlier ones are known', () => {
    const groups = [group('thirds', 15), group('fifths', 15, ['thirds'])];
    const s = run(startPlacement(groups, lcg()), () => 'fluent');
    expect([...verdicts(s).values()]).toEqual(['known', 'known']);
    expect(probedGroups(s)).toEqual(['thirds', 'thirds', 'thirds', 'fifths', 'fifths', 'fifths']);
    expect(knownItems(s)).toHaveLength(30);
  });

  it('a beginner settles quickly: two misses a group, nothing known', () => {
    const groups = [group('a', 15), group('b', 15), group('c', 4), group('d', 150, ['a'])];
    const s = run(startPlacement(groups, lcg()), () => 'wrong');
    // 4-probe groups need 2 misses, the 3-of-3 group 1, the dependent group none.
    expect(s.answers).toHaveLength(5);
    expect(knownItems(s)).toEqual([]);
  });

  it('stops at the time budget, leaving unsettled groups open and unseeded', () => {
    let s = startPlacement([group('a', 15), group('b', 15)], lcg());
    for (let n = 0; n < 3; n++) s = answerProbe(s, nextProbe(s, 0)!, 'fluent');
    s = answerProbe(s, nextProbe(s, 1000)!, 'fluent');
    expect(nextProbe(s, 180_000)).toBeNull();
    expect(nextProbe(s, 9_000, 10_000)).not.toBeNull();
    expect(nextProbe(s, 10_000, 10_000)).toBeNull();
    expect(verdicts(s).get('b')).toBe('open');
    expect(knownItems(s).every((i) => i.skillId === 'a')).toBe(true);
  });

  it('reports progress as the share of settled groups', () => {
    let s = startPlacement([group('a', 4), group('b', 4, ['a'])], lcg());
    expect(progress(s)).toBe(0);
    s = answerProbe(s, nextProbe(s, 0)!, 'wrong');
    expect(progress(s)).toBe(1);
    expect(progress(startPlacement([], lcg()))).toBe(1);
  });

  it('ends at once with nothing to probe', () => {
    expect(nextProbe(startPlacement([], lcg()), 0)).toBeNull();
  });
});

describe('probeOutcome', () => {
  it('counts only answers within the speed target as fluent', () => {
    expect(probeOutcome(Rating.Again)).toBe('wrong');
    expect(probeOutcome(Rating.Hard)).toBe('slow');
    expect(probeOutcome(Rating.Good)).toBe('fluent');
    expect(probeOutcome(Rating.Easy)).toBe('fluent');
  });
});

describe('placementGroups', () => {
  const skill = (id: string, topic: string, prerequisites: string[] = []): Skill => ({
    id,
    topic,
    order: 0,
    title: id,
    prerequisites,
    drillTypes: [],
    items: () => items(id, 3),
  });

  it('keeps the configured topics in order, with only servable items', () => {
    const skills = [
      skill('F1.x', 'F1'),
      skill('F3.x', 'F3'),
      skill('C2.x', 'C2', ['F1.x', 'F3.x']),
      skill('C5.x', 'C5'),
    ];
    const groups = placementGroups(skills, (i) => !i.id.endsWith('#2') && i.skillId !== 'C5.x');
    expect(groups.map((g) => g.id)).toEqual(['F1.x', 'C2.x']);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['F1.x#0', 'F1.x#1']);
    // F3 isn't probed, so it can't block C2.
    expect(groups[1]!.prerequisites).toEqual(['F1.x']);
  });

  it('leaves out skipped skills, and so drops them as prerequisites', () => {
    const skills = [skill('C5.a', 'C5'), skill('C5.b', 'C5', ['C5.a']), skill('C5.c', 'C5')];
    const groups = placementGroups(skills, () => true, ['C5'], ['C5.a', 'C5.c']);
    expect(groups.map((g) => g.id)).toEqual(['C5.b']);
    expect(groups[0]!.prerequisites).toEqual([]);
    // D8's chord tones apply C5 on the neck: practice, not a gate (M3-04).
    const real = placementGroups(SKILLS, () => true).map((g) => g.id);
    expect(real).toContain('C5.triads');
    expect(real).not.toContain('C5.tones-triads');
    expect(real).not.toContain('C5.tones-sevenths');
  });

  it('covers F1, F2 and C2 with the drills that exist, and extends as drills land', () => {
    const picker = createDrillPicker(SKILLS, DRILLS);
    const groups = placementGroups(SKILLS, (i) => picker.canServe(i));
    const topics = new Set(groups.map((g) => SKILLS.find((s) => s.id === g.id)!.topic));
    for (const t of ['F1', 'F2', 'C2']) expect(topics).toContain(t);
    // A drill for every item of a topic's skills (e.g. C3's interval drills) adds the topic.
    const all = placementGroups(SKILLS, () => true);
    expect(all.some((g) => g.id.startsWith('C3.'))).toBe(true);
    expect(all.find((g) => g.id === 'C3.fourths-fifths')!.prerequisites).toEqual(['C3.thirds']);
  });

  it('fits about 3 minutes of probes for a fast expert, and the budget stops a slower one', () => {
    const picker = createDrillPicker(SKILLS, DRILLS);
    const groups = placementGroups(SKILLS, (i) => picker.canServe(i));
    const all = run(startPlacement(groups, lcg()), () => 'fluent');
    // At ~2.5 s a probe (answer plus feedback), an expert answers everything in the budget.
    expect(all.answers.length * 2500).toBeLessThanOrEqual(ENGINE_CONFIG.placement.budgetMs);

    // At ~3.5 s a probe the budget ends it first: it still reaches intervals and keys,
    // and a locked module's test-out covers whatever it didn't (M2-16).
    let s = startPlacement(groups, lcg());
    for (let p = nextProbe(s, 0); p; p = nextProbe(s, s.answers.length * 3500)) {
      s = answerProbe(s, p, 'fluent');
    }
    expect(s.answers.length * 3500).toBeLessThan(ENGINE_CONFIG.placement.budgetMs + 3500);
    const v = verdicts(s);
    for (const id of ['C3.thirds', 'C3.fourths-fifths', 'C3.seconds', 'C4.sharp-keys'])
      expect(v.get(id)).toBe('known');
  });
});

describe('startPlacement', () => {
  it('rejects a group listed before its prerequisite', () => {
    expect(() => startPlacement([group('b', 4, ['a']), group('a', 4)], lcg())).toThrow(
      /b comes before its prerequisite a/,
    );
  });
});
