import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine';
import { FOCUS_PARAM, focusedSkills, practiseHref } from './focus';

describe('focused sessions', () => {
  it('links to the session with the skill in the query', () => {
    expect(practiseHref('C2.all-notes')).toBe('/session?skill=C2.all-notes');
    const url = new URL(practiseHref('a b&c'), 'https://x');
    expect(url.searchParams.get(FOCUS_PARAM)).toBe('a b&c');
  });

  it('runs only the focused skill, or every skill without a known focus', () => {
    expect(focusedSkills(SKILLS, 'F2.string6-naturals').map((s) => s.id)).toEqual([
      'F2.string6-naturals',
    ]);
    expect(focusedSkills(SKILLS, null)).toBe(SKILLS);
    expect(focusedSkills(SKILLS, 'nope')).toBe(SKILLS);
  });
});
