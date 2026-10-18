import { describe, expect, it } from 'vitest';
import { noteAt } from '../../theory';
import { itemId, parseItemId, parseNoteItemId } from '../model';
import { SKILLS, getSkill, itemsForSkills } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('skill registry', () => {
  it('loads every topic file, ordered', () => {
    expect(SKILLS.map((s) => s.id)).toEqual([
      'F1.alphabet',
      'F1.b-c-e-f',
      'F1.half-steps',
      'F1.whole-steps',
      'F2.string6-naturals',
      'F2.string5-naturals',
      'F3.markers',
      'F3.repeat-12',
      'C1.octaves',
      'C1.octaves-gb-shift',
      'C1.double-octaves',
      'C2.all-notes',
      'C3.thirds',
      'C3.fourths-fifths',
      'C3.sevenths',
      'C3.sixths',
      'C3.seconds',
    ]);
    expect(getSkill('nope')).toBeUndefined();
  });

  it('has unique skill IDs whose prerequisites exist', () => {
    const skillIds = SKILLS.map((s) => s.id);
    expect(new Set(skillIds).size).toBe(skillIds.length);
    for (const s of SKILLS) for (const p of s.prerequisites) expect(getSkill(p)).toBeDefined();
  });

  it('orders prerequisites as a DAG that the frontier order respects', () => {
    // Kahn's algorithm: every skill must be reachable with no cycle.
    const indegree = new Map(SKILLS.map((s) => [s.id, s.prerequisites.length]));
    const ready = SKILLS.filter((s) => s.prerequisites.length === 0).map((s) => s.id);
    const sorted: string[] = [];
    while (ready.length > 0) {
      const id = ready.shift() as string;
      sorted.push(id);
      for (const s of SKILLS) {
        if (!s.prerequisites.includes(id)) continue;
        const left = (indegree.get(s.id) as number) - 1;
        indegree.set(s.id, left);
        if (left === 0) ready.push(s.id);
      }
    }
    expect(sorted).toHaveLength(SKILLS.length);
    for (const s of SKILLS) {
      for (const p of s.prerequisites) expect(getSkill(p)!.order).toBeLessThan(s.order);
    }
  });

  it('gives every item a canonical, globally unique ID owned by its skill', () => {
    const all = itemsForSkills(SKILLS);
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    for (const s of SKILLS) {
      for (const item of s.items()) {
        expect(item.skillId).toBe(s.id);
        const ref = parseItemId(item.id);
        expect(ref, item.id).not.toBeNull();
        expect(itemId(ref!)).toBe(item.id);
      }
    }
  });

  it('memoises items so IDs are stable across calls', () => {
    for (const s of SKILLS) expect(s.items()).toBe(s.items());
  });
});

describe('F1 skills', () => {
  it('steps through the musical alphabet both ways', () => {
    expect(ids('F1.alphabet')).toEqual([
      'letter:+1@C',
      'letter:+1@D',
      'letter:+1@E',
      'letter:+1@F',
      'letter:+1@G',
      'letter:+1@A',
      'letter:+1@B',
      'letter:-1@C',
      'letter:-1@D',
      'letter:-1@E',
      'letter:-1@F',
      'letter:-1@G',
      'letter:-1@A',
      'letter:-1@B',
    ]);
  });

  it('isolates the natural half steps B–C and E–F', () => {
    expect(ids('F1.b-c-e-f')).toEqual(['step:+1@E', 'step:+1@B', 'step:-1@C', 'step:-1@F']);
  });

  it('covers the other half steps, which land on sharps and flats', () => {
    const half = ids('F1.half-steps');
    expect(half).toHaveLength(10);
    expect(half).toContain('step:+1@C');
    expect(half).toContain('step:-1@E');
    expect(half).not.toContain('step:+1@E');
  });

  it('covers whole steps up and down from every natural', () => {
    const whole = ids('F1.whole-steps');
    expect(whole).toHaveLength(14);
    expect(whole).toContain('step:+2@E');
    expect(whole).toContain('step:-2@C');
  });
});

describe('F2 skills', () => {
  it('names the natural notes on string 6, frets 0–12', () => {
    const notes = ids('F2.string6-naturals').filter((id) => id.startsWith('note@'));
    expect(notes.map((id) => noteAt(parseNoteItemId(id)!).pc)).toEqual([
      'E',
      'F',
      'G',
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
    expect(notes[0]).toBe('note@s6f0');
  });

  it('finds each natural on its string (name → position)', () => {
    for (const [skillId, s] of [
      ['F2.string6-naturals', 6],
      ['F2.string5-naturals', 5],
    ] as const) {
      const finds = ids(skillId).filter((id) => id.startsWith('find:'));
      expect(finds).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((pc) => `find:${pc}@s${s}`));
    }
    expect(ids('F2.string5-naturals')).toContain('find:G@s5');
  });
});

describe('F3 skills', () => {
  it('drills each marker in both directions', () => {
    expect(ids('F3.markers')).toEqual([
      'marker:f3',
      'marker:f5',
      'marker:f7',
      'marker:f9',
      'marker:f12',
      'find-marker:f3',
      'find-marker:f5',
      'find-marker:f7',
      'find-marker:f9',
      'find-marker:f12',
    ]);
  });

  it('drills the 12th-fret repeat up and down from the open string and markers', () => {
    expect(ids('F3.repeat-12')).toEqual([
      'repeat:+12@f0',
      'repeat:+12@f3',
      'repeat:+12@f5',
      'repeat:+12@f7',
      'repeat:+12@f9',
      'repeat:+12@f12',
      'repeat:-12@f12',
      'repeat:-12@f15',
      'repeat:-12@f17',
      'repeat:-12@f19',
      'repeat:-12@f21',
      'repeat:-12@f24',
    ]);
  });
});

describe('C2 skill', () => {
  it('covers the rest of the neck in both directions, leaving F2 its items', () => {
    const c2 = ids('C2.all-notes');
    const f2 = [...ids('F2.string6-naturals'), ...ids('F2.string5-naturals')];
    const notes = c2.filter((id) => id.startsWith('note@'));
    const finds = c2.filter((id) => id.startsWith('find:'));
    // 78 cells and 72 (pitch class, string) pairs, minus F2's 16 cells and 14 finds.
    expect(notes).toHaveLength(78 - 16);
    expect(finds).toHaveLength(72 - 14);
    expect(c2).toContain('find:C#@s3');
    expect(c2).toContain('find:F#@s6');
    expect(c2).not.toContain('find:G@s6');
    expect(c2.filter((id) => f2.includes(id))).toEqual([]);
  });
});
