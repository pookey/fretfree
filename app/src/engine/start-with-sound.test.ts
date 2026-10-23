import { describe, expect, it } from 'vitest';
import { deriveStatus, isFrontier } from './mastery';
import { frontierLanes, orderFrontier } from './frontier';
import type { Skill, SkillStatus } from './model';
import { SKILLS } from './skills';
import { keepLeadLane, leadWithSound, startWithSoundSkills } from './start-with-sound';

const skill = (id: string, topic: string, prerequisites: string[] = []): Skill => ({
  id,
  topic,
  order: 0,
  title: id,
  prerequisites,
  softUnlock: true,
  drillTypes: [],
  items: () => [],
});

/** Every skill's status from a fresh start, as the runner derives it. */
function fresh(skills: readonly Skill[]): Map<string, SkillStatus> {
  const statuses = new Map<string, SkillStatus>();
  for (const s of skills) statuses.set(s.id, deriveStatus(s, statuses, undefined));
  return statuses;
}

const openIds = (skills: readonly Skill[]) =>
  [...fresh(skills)].filter(([, s]) => isFrontier(s)).map(([id]) => id);

describe('startWithSoundSkills', () => {
  it('leaves the skills alone when the setting is off', () => {
    expect(startWithSoundSkills(SKILLS, false)).toBe(SKILLS);
  });

  it('opens the first ear sets and ear → fretboard on day one', () => {
    expect(openIds(SKILLS)).not.toContain('I6.ear-find');
    const open = openIds(startWithSoundSkills(SKILLS, true));
    expect(open).toEqual(
      expect.arrayContaining([
        'I6.ear-find',
        'I6.intervals-fourths-fifths',
        'I6.chords-major-minor',
        'F1.alphabet',
      ]),
    );
  });

  it('keeps every gate that is not a day-one neck gate', () => {
    const open = openIds(startWithSoundSkills(SKILLS, true));
    // Later sets still wait for the one before; progression ear still needs C9's numerals.
    expect(open).not.toContain('I6.intervals-thirds');
    expect(open).not.toContain('I6.progressions-pop');
    const out = startWithSoundSkills(SKILLS, true);
    // Neck skills are untouched.
    out.forEach((s, i) => s.topic !== 'I6' && expect(s).toBe(SKILLS[i]));
    expect(out.find((s) => s.id === 'I6.progressions-cadences')?.prerequisites).toContain(
      'C9.ii-V-I',
    );
  });

  it('touches only ear skills, and drops only the configured gates', () => {
    const skills = [
      skill('F1.a', 'F1'),
      skill('C3.b', 'C3', ['F1.a']),
      skill('I6.c', 'I6', ['F1.a', 'I6.x']),
      skill('I6.d', 'I6', ['I6.c']),
    ];
    const out = startWithSoundSkills(skills, true, {
      topics: ['I6'],
      openPrerequisites: ['F1.a'],
      leading: [],
      leadUntil: 'I6.d',
    });
    expect(out.map((s) => s.prerequisites)).toEqual([[], ['F1.a'], ['I6.x'], ['I6.c']]);
    // Untouched skills are the same objects; a changed one keeps its items.
    expect(out[1]).toBe(skills[1]);
    expect(out[3]).toBe(skills[3]);
    expect(out[2]?.items).toBe(skills[2]?.items);
  });
});

describe('leadWithSound', () => {
  const none = new Map<string, SkillStatus>();
  const frontier = orderFrontier(
    SKILLS.filter((s) =>
      [
        'F1.alphabet',
        'I6.intervals-fourths-fifths',
        'I6.chords-major-minor',
        'I6.ear-find',
      ].includes(s.id),
    ),
    'general',
  );

  it('keeps the goal order when the setting is off', () => {
    expect(leadWithSound(frontier, false, none)).toEqual(frontier);
    expect(frontier[0]?.id).toBe('F1.alphabet');
  });

  it('puts ear → fretboard first, then the rest of the ear track, then the neck', () => {
    expect(leadWithSound(frontier, true, none).map((s) => s.id)).toEqual([
      'I6.ear-find',
      'I6.intervals-fourths-fifths',
      'I6.chords-major-minor',
      'F1.alphabet',
    ]);
  });

  it('is stable within each group', () => {
    const skills = [skill('a', 'F1'), skill('b', 'I6'), skill('c', 'F2'), skill('d', 'I6')];
    const cfg = { topics: ['I6'], openPrerequisites: [], leading: ['d'], leadUntil: 'b' };
    expect(leadWithSound(skills, true, none, cfg).map((s) => s.id)).toEqual(['d', 'b', 'a', 'c']);
    const done = new Map<string, SkillStatus>([['b', 'practising']]);
    expect(leadWithSound(skills, true, done, cfg)).toEqual(skills);
  });

  it('leads while ear → fretboard is unlocked but not yet practised', () => {
    const unlocked = new Map<string, SkillStatus>([
      ['I6.ear-find', 'unlocked'],
      ['F1.alphabet', 'practising'],
    ]);
    expect(leadWithSound(frontier, true, unlocked)[0]?.id).toBe('I6.ear-find');
  });

  it('ends the lead once ear → fretboard is practising or mastered (rule 6: then interleave)', () => {
    for (const status of ['practising', 'mastered'] as const) {
      const statuses = new Map<string, SkillStatus>([['I6.ear-find', status]]);
      const out = leadWithSound(frontier, true, statuses);
      expect(out).toEqual(frontier);
      expect(out).not.toBe(frontier);
      expect(out[0]?.id).toBe('F1.alphabet');
    }
  });
});

describe('keepLeadLane', () => {
  const open = SKILLS.filter((s) =>
    [
      'F1.alphabet',
      'F4.pulse',
      'I6.intervals-fourths-fifths',
      'I6.chords-major-minor',
      'I6.ear-find',
    ].includes(s.id),
  );
  const lanes = frontierLanes(open, 'general');
  const summary = (ls: ReturnType<typeof frontierLanes>) =>
    ls.map((l) => ({
      id: l.id,
      share: l.share,
      skills: l.skills.map((s) => s.id),
      group: l.group,
    }));

  it('leaves the lanes alone when the setting is off', () => {
    expect(keepLeadLane(lanes, false)).toEqual(lanes);
  });

  it('gives ear → fretboard its own lane, out of the Ear lane’s share', () => {
    // Without it, ear-find sorts last in the Ear lane, behind every D14 set.
    expect(lanes.find((l) => l.id === 'ear')?.skills.at(-1)?.id).toBe('I6.ear-find');
    const out = keepLeadLane(lanes, true);
    expect(summary(out)).toEqual([
      { id: 'neck', share: 1, skills: ['F1.alphabet'], group: undefined },
      { id: 'rhythm', share: 0.5, skills: ['F4.pulse'], group: 'parallel' },
      { id: 'ear-lead', share: 0.25, skills: ['I6.ear-find'], group: 'parallel' },
      {
        id: 'ear',
        share: 0.25,
        skills: ['I6.intervals-fourths-fifths', 'I6.chords-major-minor'],
        group: 'parallel',
      },
    ]);
    // The parallel share is unchanged (M10-03).
    const parallel = (ls: typeof out) =>
      ls.filter((l) => l.group === 'parallel').reduce((n, l) => n + l.share, 0);
    expect(parallel(out)).toBe(parallel(lanes));
  });

  it('keeps a lane that is all ear → fretboard, or has none of it', () => {
    const alone = frontierLanes(
      open.filter((s) => s.id === 'I6.ear-find' || s.id === 'F1.alphabet'),
      'general',
    );
    expect(keepLeadLane(alone, true)).toEqual(alone);
    const without = frontierLanes(
      open.filter((s) => s.id !== 'I6.ear-find'),
      'general',
    );
    expect(keepLeadLane(without, true)).toEqual(without);
  });
});
