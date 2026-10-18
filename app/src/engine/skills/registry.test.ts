import { describe, expect, it } from 'vitest';
import { noteAt } from '../../theory';
import { parseNoteItemId, noteItemId } from '../model';
import { SKILLS, getSkill, itemsForSkills } from './index';

describe('skill registry', () => {
  it('loads every topic file, ordered', () => {
    expect(SKILLS.map((s) => s.id)).toEqual([
      'F2.string6-naturals',
      'F2.string5-naturals',
      'C2.all-notes',
    ]);
  });

  it('has unique skill IDs whose prerequisites exist', () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SKILLS) for (const p of s.prerequisites) expect(getSkill(p)).toBeDefined();
  });

  it('generates the natural notes on string 6, frets 0–12', () => {
    const items = getSkill('F2.string6-naturals')!.items();
    const pcs = items.map((i) => noteAt(parseNoteItemId(i.id)!).pc);
    expect(pcs).toEqual(['E', 'F', 'G', 'A', 'B', 'C', 'D', 'E']);
    expect(items[0]?.id).toBe('note@s6f0');
  });

  it('covers all 78 cells for C2 and memoises items', () => {
    const skill = getSkill('C2.all-notes')!;
    expect(skill.items()).toHaveLength(78);
    expect(skill.items()).toBe(skill.items());
  });

  it('flattens items across skills with unique IDs per skill', () => {
    const all = itemsForSkills(SKILLS.slice(0, 2));
    expect(all).toHaveLength(16);
    expect(getSkill('nope')).toBeUndefined();
  });

  it('round-trips note item IDs', () => {
    expect(noteItemId({ string: 6, fret: 5 })).toBe('note@s6f5');
    expect(parseNoteItemId('note@s6f5')).toEqual({ string: 6, fret: 5 });
    expect(parseNoteItemId('find:G@s5')).toBeNull();
  });
});
