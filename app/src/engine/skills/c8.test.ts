import { describe, expect, it } from 'vitest';
import { chordFromNumeral, majorKey, nashvilleToRoman } from '../../theory';
import { d11CanTest } from '../../drills/d11-numerals/meta';
import { orderFrontier } from '../frontier';
import { deriveStatus, isFrontier } from '../mastery';
import { parseNumeralItemId, type SkillStatus } from '../model';
import { createScheduler } from '../scheduler';
import { buildSession } from '../session';
import { C8_DEGREE_ORDER, C8_STAGE_KEYS, skills } from './c8';
import { SKILLS, getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

const KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'B', 'F#', 'Bb', 'Eb', 'Ab', 'Db'];

const ROMAN = ['C8.numerals-major', 'C8.numerals-a-e-f', 'C8.numerals-other-keys'];
const NASHVILLE = ['C8.nashville', 'C8.nashville-a-e-f', 'C8.nashville-other-keys'];

const keysOf = (skillId: string) => [
  ...new Set(ids(skillId).map((id) => parseNumeralItemId(id)!.key)),
];

/** Every skill's status from `seeded`, derived in registry order as the runner does. */
function statusesFrom(seeded: Record<string, SkillStatus>): Map<string, SkillStatus> {
  const statuses = new Map(Object.entries(seeded));
  for (const s of SKILLS) statuses.set(s.id, deriveStatus(s, statuses, statuses.get(s.id)));
  return statuses;
}

describe('C8 skills', () => {
  it('runs each key stage, Roman numerals then Nashville numbers, on D11', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'C8.numerals-major',
      'C8.nashville',
      'C8.numerals-a-e-f',
      'C8.nashville-a-e-f',
      'C8.numerals-other-keys',
      'C8.nashville-other-keys',
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('C8');
      expect(s.drillTypes).toEqual(['numerals']);
    }
    const orders = skills.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    // Harmony starts early: before C9's progressions and CAGED (research/03).
    for (const s of skills) {
      expect(s.order).toBeLessThan(getSkill('C9.pop')!.order);
      expect(s.order).toBeLessThan(getSkill('C6.triad-cores')!.order);
    }
  });

  it('gates stage 1 on mastered triads (rule 7) and practised sharp-key degrees', () => {
    const first = getSkill('C8.numerals-major')!;
    expect(first.prerequisites).toEqual(['C5.triads']);
    expect(first.softPrerequisites).toEqual(['C4.sharp-key-degrees']);
    expect(first.softUnlock).toBeUndefined();
  });

  it('opens stage 2 on stage 1 practising, and stage 3 on mastered flat-key degrees', () => {
    const second = getSkill('C8.numerals-a-e-f')!;
    expect(second.prerequisites).toEqual([]);
    // F's degrees are C4's flat-key ones.
    expect(second.softPrerequisites).toEqual(['C8.numerals-major', 'C4.flat-key-degrees']);
    const third = getSkill('C8.numerals-other-keys')!;
    expect(third.prerequisites).toEqual(['C4.flat-key-degrees']);
    expect(third.softPrerequisites).toEqual(['C8.numerals-a-e-f']);
  });

  it('opens each Nashville stage softly on its Roman stage', () => {
    const nashville = getSkill('C8.nashville')!;
    expect(nashville.prerequisites).toEqual(['C8.numerals-major']);
    expect(nashville.softUnlock).toBe(true);
    expect(getSkill('C8.nashville-a-e-f')!.softPrerequisites).toEqual([
      'C8.nashville',
      'C8.numerals-a-e-f',
    ]);
    expect(getSkill('C8.nashville-other-keys')!.softPrerequisites).toEqual([
      'C8.nashville-a-e-f',
      'C8.numerals-other-keys',
    ]);
    for (const id of NASHVILLE.slice(1)) expect(getSkill(id)!.prerequisites).toEqual([]);
  });

  it('probes only stage 1 in placement', () => {
    expect(getSkill('C8.numerals-major')!.skipPlacement).toBeUndefined();
    for (const id of [...ROMAN.slice(1), ...NASHVILLE])
      expect(getSkill(id)!.skipPlacement).toBe(true);
  });

  it('splits the 12 keys into C, G, D; A, E, F; then B, F♯ and the flat keys', () => {
    expect(C8_STAGE_KEYS).toEqual([
      ['C', 'G', 'D'],
      ['A', 'E', 'F'],
      ['B', 'F#', 'Bb', 'Eb', 'Ab', 'Db'],
    ]);
    expect(ROMAN.map(keysOf)).toEqual(C8_STAGE_KEYS);
    expect(NASHVILLE.map(keysOf)).toEqual(C8_STAGE_KEYS);
    expect(C8_STAGE_KEYS.flat()).toEqual(KEYS);
  });

  it('asks every chord but I of each key, both ways', () => {
    expect(ROMAN.map((s) => ids(s).length)).toEqual([3 * 12, 3 * 12, 6 * 12]);
    const all = ROMAN.flatMap(ids);
    expect(new Set(all).size).toBe(12 * 6 * 2);
    expect(ids('C8.numerals-major').slice(0, 4)).toEqual([
      'numeral:IV@key=C',
      'numeral-of:IV@key=C',
      'numeral:V@key=C',
      'numeral-of:V@key=C',
    ]);
    expect(ids('C8.numerals-major')).toContain('numeral:vi@key=D');
    expect(ids('C8.numerals-other-keys')).toContain('numeral-of:vii°@key=Db');
    expect(all.some((id) => id.startsWith('numeral:I@'))).toBe(false);
  });

  it('brings IV and V first, then vi, ii, iii and vii°', () => {
    expect(C8_DEGREE_ORDER).toEqual([4, 5, 6, 2, 3, 7]);
    const inC = ids('C8.numerals-major')
      .filter((id) => id.startsWith('numeral:') && id.endsWith('@key=C'))
      .map((id) => parseNumeralItemId(id)!.numeral);
    expect(inC).toEqual(['IV', 'V', 'vi', 'ii', 'iii', 'vii°']);
  });

  it('reads Nashville numbers as chords in the same keys, stage by stage', () => {
    expect(NASHVILLE.map((s) => ids(s).length)).toEqual([3 * 6, 3 * 6, 6 * 6]);
    expect(ids('C8.nashville').slice(0, 6)).toEqual([
      'nashville:4@key=C',
      'nashville:5@key=C',
      'nashville:6m@key=C',
      'nashville:2m@key=C',
      'nashville:3m@key=C',
      'nashville:7°@key=C',
    ]);
    // Each Nashville card is the same fact as a Roman one of its stage, in another notation.
    NASHVILLE.forEach((skillId, stage) => {
      for (const id of ids(skillId)) {
        const ref = parseNumeralItemId(id)!;
        const roman = nashvilleToRoman(ref.numeral);
        expect(ids(ROMAN[stage]!)).toContain(`numeral:${roman}@key=${ref.key}`);
        expect(chordFromNumeral(majorKey(ref.key), roman).nashville).toBe(ref.numeral);
      }
    });
  });
});

describe('the songs on-ramp (M10-02)', () => {
  // A songs learner who has mastered 3rds and is practising the sharp keys,
  // with no flat-key mastery: every F, C1–C2 and other C3 skill done, so only
  // the gates under test decide.
  const base: Record<string, SkillStatus> = Object.fromEntries(
    SKILLS.filter((s) => /^(F\d|C1|C2|C3)$/.test(s.topic)).map((s) => [s.id, 'mastered']),
  );
  delete base['C3.fourths-fifths'];

  it('opens triads once 3rds are mastered and the sharp keys practising', () => {
    const statuses = statusesFrom({ ...base, 'C4.sharp-keys': 'practising' });
    expect(statuses.get('C5.triads')).toBe('unlocked');
    expect(statuses.get('C4.flat-key-degrees')).toBe('locked');
    expect(statuses.get('C8.numerals-major')).toBe('locked');
  });

  it('serves the first C8 card in C once triads are mastered, with no flat-key mastery', () => {
    const statuses = statusesFrom({
      ...base,
      'C4.sharp-keys': 'practising',
      'C4.sharp-key-degrees': 'practising',
      'C5.triads': 'mastered',
    });
    for (const id of ['C4.flat-keys', 'C4.flat-key-degrees'])
      expect(statuses.get(id)).not.toBe('mastered');
    expect(statuses.get('C8.numerals-major')).toBe('unlocked');
    // Progressions and the capo open alongside (rule 7: triads → progressions).
    expect(statuses.get('C10.capo-g-c-d')).toBe('unlocked');
    expect(statuses.get('C9.pop')).toBe('locked');
    // The later key stages wait.
    for (const id of [...ROMAN.slice(1), ...NASHVILLE]) expect(statuses.get(id), id).toBe('locked');

    // The session a songs learner gets: Harmony leads the frontier.
    const frontier = orderFrontier(
      SKILLS.filter((s) => isFrontier(statuses.get(s.id) ?? 'locked')),
      'songs',
    ).flatMap((s) => s.items());
    const plan = buildSession({
      now: new Date('2026-10-21T09:00:00Z'),
      minutes: 5,
      cards: [],
      frontier,
      scheduler: createScheduler(),
    });
    const first = plan.find((e) => e.kind !== 'review')!;
    expect(first).toMatchObject({ itemId: 'numeral:IV@key=C', skillId: 'C8.numerals-major' });
    expect(d11CanTest({ id: first.itemId, skillId: first.skillId })).toBe(true);
  });

  it('opens each later stage as the one before is practised', () => {
    const practising = {
      ...base,
      'C4.sharp-keys': 'practising',
      'C4.sharp-key-degrees': 'practising',
      'C5.triads': 'mastered',
      'C8.numerals-major': 'practising',
    } as const;
    let statuses = statusesFrom(practising);
    expect(statuses.get('C9.pop')).toBe('unlocked');
    expect(statuses.get('C8.nashville')).toBe('unlocked');
    // Stage 2 waits for F's degrees (C4's flat keys) to be practised too.
    expect(statuses.get('C8.numerals-a-e-f')).toBe('locked');

    statuses = statusesFrom({
      ...practising,
      'C4.flat-keys': 'practising',
      'C4.flat-key-degrees': 'practising',
      'C8.numerals-a-e-f': 'practising',
    });
    expect(statuses.get('C8.numerals-a-e-f')).toBe('practising');
    // Stage 3 is where mastered flat-key degrees belong.
    expect(statuses.get('C8.numerals-other-keys')).toBe('locked');

    statuses = statusesFrom({
      ...practising,
      'C4.flat-keys': 'mastered',
      'C4.flat-key-degrees': 'mastered',
      'C8.numerals-a-e-f': 'practising',
    });
    expect(statuses.get('C8.numerals-other-keys')).toBe('unlocked');
  });
});
