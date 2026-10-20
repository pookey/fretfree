import { describe, expect, it } from 'vitest';
import { SKILLS } from '../engine';
import {
  FOCUS_PARAM,
  ITEM_PARAM,
  focusFilter,
  focusHref,
  nearestOpenSkills,
  noteSkillIds,
  parseFocus,
  practiseHref,
} from './focus';

const query = (href: string) => new URL(href, 'https://x').searchParams;

describe('focus links', () => {
  it('links to the session with the skill in the query', () => {
    expect(practiseHref('C2.all-notes')).toBe('/session?skill=C2.all-notes');
    expect(query(practiseHref('a b&c')).get(FOCUS_PARAM)).toBe('a b&c');
  });

  it('repeats the parameters for several skills and items', () => {
    const href = focusHref({ skillIds: ['F2.string6-naturals', 'C2.all-notes'], itemIds: ['x'] });
    expect(href).toBe('/session?skill=F2.string6-naturals&skill=C2.all-notes&item=x');
    expect(query(href).getAll(ITEM_PARAM)).toEqual(['x']);
    expect(focusHref({})).toBe('/session');
  });
});

describe('parseFocus', () => {
  it('reads skills and items and round-trips a link', () => {
    const href = focusHref({ skillIds: ['F2.string6-naturals'], itemIds: ['note@s5f3'] });
    expect(parseFocus(query(href), SKILLS)).toEqual({
      skillIds: ['F2.string6-naturals'],
      itemIds: ['note@s5f3'],
    });
  });

  it('drops unknown and repeated IDs, and is no focus when nothing known is left', () => {
    const params = new URLSearchParams(
      'skill=nope&skill=F2.string5-naturals&skill=F2.string5-naturals&item=nope&item=note@s6f0&item=note@s6f0',
    );
    expect(parseFocus(params, SKILLS)).toEqual({
      skillIds: ['F2.string5-naturals'],
      itemIds: ['note@s6f0'],
    });
    expect(parseFocus(new URLSearchParams('skill=nope&item=nope'), SKILLS)).toBeNull();
    expect(parseFocus(new URLSearchParams(''), SKILLS)).toBeNull();
  });
});

describe('focusFilter', () => {
  it('lets through items of a listed skill or listed items, or everything without a focus', () => {
    const f = focusFilter({ skillIds: ['F2.string6-naturals'], itemIds: ['note@s5f3'] });
    expect(f({ id: 'note@s6f0', skillId: 'F2.string6-naturals' })).toBe(true);
    expect(f({ id: 'note@s5f3', skillId: 'F2.string5-naturals' })).toBe(true);
    expect(f({ id: 'note@s5f5', skillId: 'F2.string5-naturals' })).toBe(false);
    expect(focusFilter(null)({ id: 'anything', skillId: 'any' })).toBe(true);
    expect(focusFilter(undefined)({ id: 'anything', skillId: 'any' })).toBe(true);
  });
});

describe('noteSkillIds', () => {
  it('picks the skills that name or find notes on the neck', () => {
    expect(noteSkillIds(SKILLS)).toEqual([
      'F2.string6-naturals',
      'F2.string5-naturals',
      'C2.all-notes',
    ]);
  });

  it('skips skills with no items', () => {
    const empty = { ...SKILLS[0]!, items: () => [] };
    expect(noteSkillIds([empty])).toEqual([]);
  });
});

describe('nearestOpenSkills', () => {
  const skill = (id: string, prerequisites: string[] = []) => ({
    ...SKILLS[0]!,
    id,
    prerequisites,
  });
  const skills = [skill('a'), skill('b', ['a']), skill('c', ['b', 'x']), skill('d', ['b'])];

  it('keeps the open targets', () => {
    expect(nearestOpenSkills(['c', 'd'], new Set(['c', 'a']), skills)).toEqual(['c']);
  });

  it('walks back through prerequisites to the nearest open level', () => {
    expect(nearestOpenSkills(['c', 'd'], new Set(['a']), skills)).toEqual(['a']);
    expect(nearestOpenSkills(['c'], new Set(['a', 'b']), skills)).toEqual(['b']);
  });

  it('is null when nothing on the way is open, or no target is known', () => {
    expect(nearestOpenSkills(['c'], new Set(), skills)).toBeNull();
    expect(nearestOpenSkills(['nope'], new Set(['a']), skills)).toBeNull();
  });
});
