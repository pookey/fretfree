import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DRILLS } from '../drills/registry';
import {
  ENGINE_CONFIG,
  createScheduler,
  deriveStatus,
  speedTargets,
  type Skill,
  type SkillStatus,
} from '../engine';
import { MODULES, type Module } from '../engine/frontier';
import { SKILLS } from '../engine/skills';
import { createDrillPicker } from '../session/drill-picker';
import { FretworkDB, getSkillStates } from '../storage';
import {
  answerProbe,
  nextProbe,
  placementGroups,
  startPlacement,
  verdicts,
  type GroupInput,
  type PlacementState,
  type ProbeOutcome,
  type ProbeTier,
} from './algorithm';
import { savePlacement, type ProbeLog } from './save';
import {
  entrySkills,
  moduleSkills,
  opensAfter,
  reportSentence,
  testOutGroups,
  testOutReport,
  unmetPrerequisites,
} from './test-out';

const NOW = new Date('2026-10-19T09:00:00Z');
const scheduler = createScheduler({ enableFuzz: false });
const targets = speedTargets(500);
const picker = createDrillPicker(SKILLS, DRILLS);
const canServe = picker.canServe;
const CHORDS = MODULES.find((m) => m.id === 'chords') as Module;
const INTERVALS = MODULES.find((m) => m.id === 'intervals') as Module;
const KEYS = MODULES.find((m) => m.id === 'keys') as Module;
const TRIAD_NEEDS = ['C3.thirds', 'C3.fourths-fifths', 'C4.sharp-keys', 'C4.flat-keys'];

/** Statuses as Learn derives them from the stored ones (registry order). */
function derive(stored: ReadonlyMap<string, SkillStatus>): Map<string, SkillStatus> {
  const out = new Map(stored);
  for (const s of SKILLS) out.set(s.id, deriveStatus(s, out, stored.get(s.id)));
  return out;
}

const FRESH = derive(new Map());

/** A seeded LCG, so shuffles are deterministic. */
function lcg(seed = 7): () => number {
  let x = seed;
  return () => {
    x = (x * 1_103_515_245 + 12_345) % 2 ** 31;
    return x / 2 ** 31;
  };
}

/** Play a test-out; `outcome` gets each probe's group and how many of its probes came before. */
function play(
  groups: readonly GroupInput[],
  outcome: (groupId: string, asked: number) => ProbeOutcome,
  tiers: readonly ProbeTier[] = ENGINE_CONFIG.placement.testOut.tiers,
): { state: PlacementState; logs: ProbeLog[] } {
  let state = startPlacement(groups, lcg(), tiers);
  const logs: ProbeLog[] = [];
  for (let p = nextProbe(state, 0); p; p = nextProbe(state, 0)) {
    const o = outcome(p.group.id, logs.filter((l) => l.item.skillId === p.group.id).length);
    logs.push({
      item: p.item,
      drillType: 'spell-it',
      correct: o !== 'wrong',
      responseMs: o === 'fluent' ? 900 : 2400,
      rating: o === 'fluent' ? Rating.Easy : o === 'slow' ? Rating.Hard : Rating.Again,
      answerGiven: o === 'wrong' ? 'wrong' : 'right',
      at: NOW,
    });
    state = answerProbe(state, p, o);
  }
  return { state, logs };
}

describe('the scope of a test-out', () => {
  it('finds a module’s first skills: those whose prerequisites lie outside it', () => {
    expect(entrySkills(CHORDS, SKILLS).map((s) => s.id)).toEqual(['C5.triads']);
    expect(entrySkills(INTERVALS, SKILLS).map((s) => s.id)).toEqual(['C3.thirds']);
    expect(moduleSkills(KEYS, SKILLS).every((s) => s.topic === 'C4')).toBe(true);
  });

  it('asks for the C3 and C4 skills C5.triads needs, on a fresh profile', () => {
    expect(unmetPrerequisites(CHORDS, SKILLS, FRESH)).toEqual(TRIAD_NEEDS);
    const groups = testOutGroups(TRIAD_NEEDS, SKILLS, canServe);
    expect(groups.map((g) => g.id)).toEqual(TRIAD_NEEDS);
    // Prerequisites outside the scope (F1, C1) can't block a probe.
    expect(groups.find((g) => g.id === 'C3.thirds')!.prerequisites).toEqual([]);
    expect(groups.find((g) => g.id === 'C4.flat-keys')!.prerequisites).toEqual(['C4.sharp-keys']);
  });

  it('leaves out what is already met: mastered for a hard gate, practising for a soft one', () => {
    const partly = derive(
      new Map<string, SkillStatus>([
        ['C3.thirds', 'mastered'],
        ['C4.sharp-keys', 'practising'],
      ]),
    );
    // C5.triads is a hard gate, so practising sharp keys isn't enough.
    expect(unmetPrerequisites(CHORDS, SKILLS, partly)).toEqual([
      'C3.fourths-fifths',
      'C4.sharp-keys',
      'C4.flat-keys',
    ]);
    // C3.thirds opens softly: practising F1's steps meets it (C1 still doesn't).
    const steps = derive(
      new Map<string, SkillStatus>([
        ['F1.half-steps', 'practising'],
        ['F1.whole-steps', 'practising'],
      ]),
    );
    expect(unmetPrerequisites(INTERVALS, SKILLS, steps)).toEqual(['C1.octaves']);
  });

  it('asks for nothing once the module is open', () => {
    const open = new Map(FRESH).set('C5.triads', 'unlocked');
    expect(unmetPrerequisites(CHORDS, SKILLS, open)).toEqual([]);
  });

  it('holds a test-out to a higher bar than placement: more probes, every one fluent', () => {
    for (const t of ENGINE_CONFIG.placement.testOut.tiers) expect(t.knownAt).toBe(t.probes);
    const { state } = play(testOutGroups(TRIAD_NEEDS, SKILLS, canServe), (g, asked) =>
      g === 'C3.fourths-fifths' && asked === 5 ? 'slow' : 'fluent',
    );
    const v = verdicts(state);
    expect(v.get('C3.thirds')).toBe('known');
    // One slow answer in six fails the skill, where placement would let it pass.
    expect(v.get('C3.fourths-fifths')).toBe('unknown');
  });
});

describe('saving a test-out', () => {
  let db: FretworkDB;
  let n = 0;
  beforeEach(() => {
    db = new FretworkDB(`test-out-${n++}`);
  });
  afterEach(async () => {
    await db.delete();
  });

  async function save(
    groups: readonly GroupInput[],
    outcome: (groupId: string, asked: number) => ProbeOutcome,
  ) {
    const { state, logs } = play(groups, outcome);
    const summary = await savePlacement(db, {
      state,
      logs,
      skills: SKILLS,
      scheduler,
      targets,
      now: NOW,
      masterKnown: true,
    });
    const stored = new Map(
      [...(await getSkillStates(db)).values()].map((s) => [s.skillId, s.status]),
    );
    return { summary, logs, statuses: derive(stored) };
  }

  it('a fluent test-out of Chords’ prerequisites unlocks C5.triads', async () => {
    const needs = unmetPrerequisites(CHORDS, SKILLS, FRESH);
    const { summary, logs, statuses } = await save(
      testOutGroups(needs, SKILLS, canServe),
      () => 'fluent',
    );
    expect(summary.masteredSkills).toEqual(TRIAD_NEEDS);
    for (const id of TRIAD_NEEDS) expect(statuses.get(id)).toBe('mastered');
    expect(statuses.get('C5.triads')).toBe('unlocked');
    expect(opensAfter(CHORDS, SKILLS, FRESH, summary)).toBe(true);
    // Every item of each skill is seeded as known, and every probe is logged (rule 17).
    const items = TRIAD_NEEDS.flatMap((id) => SKILLS.find((s) => s.id === id)!.items());
    expect(await db.cards.count()).toBe(items.length);
    expect(await db.reviewLogs.count()).toBe(logs.length);
    expect((await db.reviewLogs.toArray()).every((l) => l.drillType.startsWith('placement:'))).toBe(
      true,
    );
    expect(testOutReport(summary, SKILLS).map(reportSentence)).toEqual([
      'Intervals: known.',
      'Keys: known.',
    ]);
  });

  it('a partial test-out keeps what passed and says what to practise', async () => {
    const { summary, statuses } = await save(testOutGroups(TRIAD_NEEDS, SKILLS, canServe), (g) =>
      g.startsWith('C4.') ? 'wrong' : 'fluent',
    );
    expect(summary.masteredSkills).toEqual(['C3.thirds', 'C3.fourths-fifths']);
    expect(statuses.get('C3.fourths-fifths')).toBe('mastered');
    expect(statuses.get('C4.sharp-keys')).not.toBe('mastered');
    // The passed part still unlocks what it can: the next interval group opens.
    expect(statuses.get('C3.sevenths')).toBe('unlocked');
    expect(statuses.get('C5.triads')).toBe('locked');
    expect(opensAfter(CHORDS, SKILLS, FRESH, summary)).toBe(false);
    expect(testOutReport(summary, SKILLS).map(reportSentence)).toEqual([
      'Intervals: known.',
      'Keys: let’s practise those first.',
    ]);
  });

  it('a failed test-out never lowers anything', async () => {
    await db.skillStates.put({
      skillId: 'C3.thirds',
      status: 'mastered',
      guideLevel: 0,
      rollingAccuracy: 0.95,
    });
    const card = scheduler.review(
      scheduler.seedKnownCard({ id: 'spell-key:G', skillId: 'C4.sharp-keys' }, NOW, 30),
      Rating.Good,
      NOW,
    );
    await db.cards.put(card);
    const { summary } = await save(testOutGroups(TRIAD_NEEDS, SKILLS, canServe), () => 'wrong');
    expect(summary.knownSkills).toEqual([]);
    expect((await getSkillStates(db)).get('C3.thirds')).toMatchObject({
      status: 'mastered',
      guideLevel: 0,
    });
    expect(await db.cards.get('spell-key:G')).toEqual(card);
  });

  it('masters a passed skill even where older, shakier cards fail the stability share', async () => {
    // A learner who practised a little: every sharp key has a fresh, unstable card.
    const sharp = SKILLS.find((s) => s.id === 'C4.sharp-keys') as Skill;
    const shaky = sharp
      .items()
      .map((i) => scheduler.review(scheduler.seedKnownCard(i, NOW, 1), Rating.Hard, NOW));
    await db.cards.bulkPut(shaky);
    const groups = testOutGroups(['C4.sharp-keys'], SKILLS, canServe);
    const { summary, statuses } = await save(groups, () => 'fluent');
    expect(summary.masteredSkills).toEqual(['C4.sharp-keys']);
    expect(statuses.get('C4.sharp-keys')).toBe('mastered');
    // Real history isn't overwritten by a guess: unprobed cards keep their schedule.
    expect(summary.seeded).toBe(0);
  });

  it('a partly known module reads as partly known', () => {
    const report = testOutReport(
      { probedSkills: ['C3.thirds', 'C3.fourths-fifths'], masteredSkills: ['C3.thirds'] },
      SKILLS,
    );
    expect(report).toEqual([{ module: 'Intervals', result: 'partly' }]);
    expect(reportSentence(report[0]!)).toBe(
      'Intervals: partly known, so let’s practise the rest first.',
    );
    // A skill outside every module (or unknown) is left out of the report.
    expect(testOutReport({ probedSkills: ['nope'], masteredSkills: [] }, SKILLS)).toEqual([]);
  });
});

describe('the onboarding placement test can open Chords too', () => {
  it('probes C4 (keys) and, answered fluently, masters every skill C5.triads needs', async () => {
    const db = new FretworkDB('test-out-placement');
    try {
      const groups = placementGroups(SKILLS, canServe);
      expect(groups.some((g) => g.id === 'C4.flat-keys')).toBe(true);
      const { state, logs } = play(groups, () => 'fluent', ENGINE_CONFIG.placement.tiers);
      const summary = await savePlacement(db, {
        state,
        logs,
        skills: SKILLS,
        scheduler,
        targets,
        now: NOW,
      });
      for (const id of TRIAD_NEEDS) expect(summary.masteredSkills).toContain(id);
      const stored = new Map(
        [...(await getSkillStates(db)).values()].map((s) => [s.skillId, s.status]),
      );
      expect(derive(stored).get('C5.triads')).not.toBe('locked');
    } finally {
      await db.delete();
    }
  });
});
