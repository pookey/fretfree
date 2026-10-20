import { describe, expect, it } from 'vitest';
import { State, createEmptyCard } from 'ts-fsrs';
import { SKILLS, type CardRecord, type Skill, type SkillStatus } from '../../engine';
import { MODULES } from '../../engine/frontier';
import { buildMap, defaultModule, percent, skillRingState, skillStatuses } from './map-model';

const now = new Date('2026-10-18T09:00:00Z');

function card(itemId: string, skillId: string, stability: number): CardRecord {
  return {
    itemId,
    skillId,
    fsrs: { ...createEmptyCard(now), stability },
    createdAt: now,
    lastReviewedAt: now,
  };
}

function skill(id: string, topic: string, over: Partial<Skill> = {}): Skill {
  const items = Array.from({ length: 4 }, (_, i) => ({ id: `${id}#${i}`, skillId: id }));
  return {
    id,
    topic,
    order: 0,
    title: id,
    prerequisites: [],
    drillTypes: [],
    items: () => items,
    ...over,
  };
}

const stored = (entries: [string, SkillStatus][] = []) => new Map(entries);

describe('skillStatuses', () => {
  it('derives missing statuses from prerequisites, in registry order', () => {
    const a = skill('F2.a', 'F2');
    const b = skill('F2.b', 'F2', { prerequisites: ['F2.a'] });
    const c = skill('F2.c', 'F2', { prerequisites: ['F2.b'], softUnlock: true });
    expect(skillStatuses([a, b, c], stored())).toEqual(
      new Map([
        ['F2.a', 'unlocked'],
        ['F2.b', 'locked'],
        ['F2.c', 'locked'],
      ]),
    );
    const s = skillStatuses(
      [a, b, c],
      stored([
        ['F2.a', 'mastered'],
        ['F2.b', 'practising'],
      ]),
    );
    expect(s.get('F2.b')).toBe('practising');
    expect(s.get('F2.c')).toBe('unlocked');
  });
});

describe('buildMap', () => {
  it('lists every module, in goal order, with the registered skills', () => {
    const map = buildMap({ skills: SKILLS, goal: 'general', stored: stored(), cards: [] });
    expect(map.map((m) => m.module.id)).toEqual(MODULES.map((m) => m.id));
    const notes1 = map[0]!;
    expect(notes1.state).toBe('open');
    expect(notes1.skills.map((s) => s.skill.topic)).toContain('F2');
    expect(map.find((m) => m.module.id === 'notes-2')?.state).toBe('locked');
    expect(map.find((m) => m.module.id === 'caged')?.state).toBe('locked');
    expect(map.find((m) => m.module.id === 'pentatonic')?.state).toBe('locked');
    expect(map.find((m) => m.module.id === 'advanced')?.state).toBe('soon');
    expect(
      buildMap({ skills: SKILLS, goal: 'songs', stored: stored(), cards: [] })[0]?.module.id,
    ).toBe('harmony');
  });

  it('fills rings from stable items, weighted by item count, and full when mastered', () => {
    const a = skill('F2.a', 'F2');
    const b = skill('F2.b', 'F2', { items: () => [] });
    const c = skill('C2.c', 'C2');
    const cards = [
      card('F2.a#0', 'F2.a', 8),
      card('F2.a#1', 'F2.a', 7),
      card('F2.a#2', 'F2.a', 2),
      card('C2.c#0', 'C2.c', 30),
    ];
    const map = buildMap({
      skills: [a, b, c],
      goal: 'general',
      stored: stored([['C2.c', 'mastered']]),
      cards,
    });
    const notes1 = map.find((m) => m.module.id === 'notes-1')!;
    expect(notes1.skills.map((s) => [s.skill.id, s.stableCount, s.mastery])).toEqual([
      ['F2.a', 2, 0.5],
      ['F2.b', 0, 0],
    ]);
    expect(notes1.mastery).toBe(0.5);
    expect(notes1.masteredSkills).toBe(0);
    const notes2 = map.find((m) => m.module.id === 'notes-2')!;
    expect(notes2.state).toBe('mastered');
    expect(notes2.mastery).toBe(1);
    expect(notes2.masteredSkills).toBe(1);
    expect(map.find((m) => m.module.id === 'advanced')?.mastery).toBe(0);
  });

  it('carries learning next to stable, item-weighted, for skills and modules', () => {
    const a = skill('F2.a', 'F2');
    const b = skill('F2.b', 'F2', { items: () => [] });
    const c = skill('F3.c', 'F3');
    const reviewed = (itemId: string, skillId: string, stability: number) => ({
      ...card(itemId, skillId, stability),
      fsrs: { ...card(itemId, skillId, stability).fsrs, state: State.Learning },
    });
    const cards = [
      reviewed('F2.a#0', 'F2.a', 2.3),
      reviewed('F2.a#1', 'F2.a', 2.3),
      reviewed('F2.a#2', 'F2.a', 0.2),
      reviewed('F2.a#3', 'F2.a', 9),
      reviewed('F3.c#0', 'F3.c', 2.3),
    ];
    const outcomes = new Map([
      ['F2.a#0', true],
      ['F2.a#1', true],
      ['F2.a#2', false],
      ['F3.c#0', true],
    ]);
    const map = buildMap({ skills: [a, b, c], goal: 'general', stored: stored(), cards, outcomes });
    const notes1 = map.find((m) => m.module.id === 'notes-1')!;
    expect(
      notes1.skills.map((s) => [s.skill.id, s.learningCount, s.stableCount, s.learning, s.mastery]),
    ).toEqual([
      ['F2.a', 3, 1, 0.75, 0.25],
      ['F2.b', 0, 0, 0, 0],
      ['F3.c', 1, 0, 0.25, 0],
    ]);
    expect(notes1.learning).toBe(0.5);
    expect(notes1.mastery).toBe(0.125);
    // Without outcomes, a reviewed card still counts (e.g. placement seeds).
    const bare = buildMap({ skills: [c], goal: 'general', stored: stored(), cards });
    expect(bare[0]!.skills[0]!.learningCount).toBe(1);
    const mastered = buildMap({
      skills: [c],
      goal: 'general',
      stored: stored([['F3.c', 'mastered']]),
      cards: [],
    });
    expect(mastered[0]!.learning).toBe(1);
  });

  it('caps stable counts at the item count and ignores skills outside any module', () => {
    const a = skill('F2.a', 'F2');
    const stray = skill('Z9.x', 'Z9');
    const cards = Array.from({ length: 6 }, (_, i) => card(`F2.a#${i}`, 'F2.a', 10));
    const map = buildMap({
      skills: [a, stray],
      goal: 'general',
      stored: stored(),
      cards,
      stabilityDays: 7,
    });
    expect(map.flatMap((m) => m.skills).map((s) => s.skill.id)).toEqual(['F2.a']);
    expect(map[0]!.skills[0]!.stableCount).toBe(4);
    expect(map[0]!.skills[0]!.learningCount).toBe(4);
  });

  it('marks a skill practisable when a built drill can test one of its items', () => {
    const a = skill('F2.a', 'F2');
    const b = skill('F2.b', 'F2');
    const input = { skills: [a, b], goal: 'general' as const, stored: stored(), cards: [] };
    const practisable = (canServe?: (i: { skillId: string }) => boolean) =>
      buildMap({ ...input, ...(canServe ? { canServe } : {}) })[0]!.skills.map(
        (s) => s.practisable,
      );
    expect(practisable()).toEqual([true, true]);
    expect(practisable((i) => i.skillId === 'F2.a')).toEqual([true, false]);
  });
});

describe('defaultModule', () => {
  it('prefers the first open module, then one with skills, then the first', () => {
    const map = buildMap({ skills: SKILLS, goal: 'songs', stored: stored(), cards: [] });
    expect(defaultModule(map)?.module.id).toBe('notes-1');
    const locked = skill('C2.x', 'C2', { prerequisites: ['nope'] });
    const lockedMap = buildMap({ skills: [locked], goal: 'general', stored: stored(), cards: [] });
    expect(defaultModule(lockedMap)?.module.id).toBe('notes-2');
    const empty = buildMap({ skills: [], goal: 'jazz', stored: stored(), cards: [] });
    expect(defaultModule(empty)?.module.id).toBe('harmony');
    expect(defaultModule([])).toBeUndefined();
  });
});

describe('percent', () => {
  it('rounds and clamps', () => {
    expect(percent(0.456)).toBe(46);
    expect(percent(-1)).toBe(0);
    expect(percent(2)).toBe(100);
  });

  it('rounds any progress up to at least 1%', () => {
    expect(percent(0.001)).toBe(1);
    expect(percent(0.004)).toBe(1);
    expect(percent(0.016)).toBe(2);
    expect(percent(0)).toBe(0);
  });
});

describe('skillRingState', () => {
  it('maps skill statuses to ring states', () => {
    expect(skillRingState('mastered')).toBe('mastered');
    expect(skillRingState('locked')).toBe('locked');
    expect(skillRingState('unlocked')).toBe('open');
    expect(skillRingState('practising')).toBe('open');
  });
});
