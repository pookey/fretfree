import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { Rating } from 'ts-fsrs';
import { getSkill } from '../../engine/skills';
import type { CardRecord, SkillStateRecord } from '../../engine/model';
import { FretworkDB, SCHEMA_VERSIONS } from '../db';
import { exportData, importData } from '../export-import';
import type { SyncClock } from '../sync/tracking';
import { OLD_SKILL, STAGES, restage, restageTables, stageOf, stageStates } from './c2-strings';

let n = 0;
const open: FretworkDB[] = [];

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete();
});

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN = { 1: 4, 2: 11, 3: 7, 4: 2, 5: 9, 6: 4 } as Record<number, number>;
const natural = (pc: string) => !pc.includes('#');

/** The 120 items `C2.all-notes` held before the split: all but F2's naturals on strings 6 and 5. */
const OLD_ITEMS = [1, 2, 3, 4, 5, 6].flatMap((s) => {
  const f2 = (pc: string) => s >= 5 && natural(pc);
  const notes = Array.from({ length: 13 }, (_, f) => f)
    .filter((f) => !f2(SHARPS[(OPEN[s]! + f) % 12]!))
    .map((f) => `note@s${s}f${f}`);
  const finds = SHARPS.filter((pc) => !f2(pc)).map((pc) => `find:${pc}@s${s}`);
  return [...notes, ...finds];
});

const card = (itemId: string, skillId = OLD_SKILL) => ({
  itemId,
  skillId,
  fsrs: { due: new Date('2026-10-20T09:00:00Z'), stability: 9, state: 2 } as CardRecord['fsrs'],
  createdAt: new Date('2026-10-01T09:00:00Z'),
  lastReviewedAt: new Date('2026-10-18T09:00:00Z'),
});

let uids = 0;
const log = (itemId: string, skillId = OLD_SKILL) => ({
  uid: `log-${uids++}`,
  itemId,
  skillId,
  drillType: 'name-the-note',
  correct: true,
  responseMs: 1500,
  rating: Rating.Good,
  hintUsed: false,
  answerGiven: 'x',
  at: new Date('2026-10-18T09:00:00Z'),
});

const state = (skillId: string, status: SkillStateRecord['status']): SkillStateRecord => ({
  skillId,
  status,
  guideLevel: 1,
  rollingAccuracy: 0.9,
});

/** A schema v4 database holding `rows`, as a device had it before M10-12. */
async function v4Db(rows: Record<string, unknown[]>): Promise<string> {
  const name = `c2-strings-${n++}`;
  const legacy = new Dexie(name);
  for (const v of SCHEMA_VERSIONS.filter((v) => v.version <= 4))
    legacy.version(v.version).stores(v.stores);
  await legacy.open();
  for (const [table, list] of Object.entries(rows)) await legacy.table(table).bulkAdd(list);
  legacy.close();
  return name;
}

let ids = 0;
const clock: SyncClock = { now: () => 888, newId: () => `id-${ids++}` };

async function upgraded(rows: Record<string, unknown[]>): Promise<FretworkDB> {
  const db = new FretworkDB(await v4Db(rows), clock);
  open.push(db);
  await db.open();
  return db;
}

const skillOf = async (db: FretworkDB) =>
  Object.fromEntries((await db.cards.toArray()).map((c) => [c.itemId, c.skillId]));

const itemIds = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

/** The skill that owns an old item now, by the registry. */
const ownerOf = (id: string) => [OLD_SKILL, ...STAGES].find((s) => itemIds(s).includes(id));

const statesOf = async (db: FretworkDB) =>
  (await db.skillStates.toArray()).map((s) => [s.skillId, s.status]).sort();

describe('stageOf', () => {
  it('maps each old item to the stage that now owns it', () => {
    expect(OLD_ITEMS).toHaveLength(120);
    const all = [OLD_SKILL, ...STAGES].flatMap(itemIds);
    expect(all).toHaveLength(120);
    expect(new Set(all)).toEqual(new Set(OLD_ITEMS));
    for (const id of OLD_ITEMS) expect(stageOf(id) ?? OLD_SKILL, id).toBe(ownerOf(id));
  });

  it('leaves the last stage’s items and other skills alone', () => {
    expect(stageOf('note@s3f1')).toBeUndefined();
    expect(stageOf('find:A#@s2')).toBeUndefined();
    expect(stageOf('note@s6f5')).toBeUndefined();
    expect(stageOf('find:G@s5')).toBeUndefined();
    expect(stageOf('octave:s6f5→s4')).toBeUndefined();
    const kept = card('note@s4f1');
    expect(restage(kept)).toBe(kept);
    const other = card('note@s6f5', 'F2.string6-naturals');
    expect(restage(other)).toBe(other);
    expect(restage(card('note@s2f3')).skillId).toBe('C2.string2-naturals');
    expect(restage(card('find:Eb@s6')).skillId).toBe('C2.low-accidentals');
  });
});

describe('stageStates', () => {
  it('carries mastered to every stage, practising to stages with cards', () => {
    expect(stageStates(state(OLD_SKILL, 'mastered'), new Set()).map((s) => s.skillId)).toEqual([
      ...STAGES,
    ]);
    expect(
      stageStates(state(OLD_SKILL, 'practising'), new Set(['C2.string1-naturals'])).map((s) => [
        s.skillId,
        s.status,
        s.guideLevel,
      ]),
    ).toEqual([['C2.string1-naturals', 'practising', 1]]);
    expect(stageStates(state(OLD_SKILL, 'unlocked'), new Set(STAGES))).toEqual([]);
  });
});

describe('schema v5 upgrade', () => {
  it('moves cards and reviews of the earlier stages onto their stage', async () => {
    const db = await upgraded({
      cards: [...OLD_ITEMS.map((id) => card(id)), card('note@s6f5', 'F2.string6-naturals')],
      reviewLogs: [
        log('note@s1f0'),
        log('find:C#@s6'),
        log('note@s3f6'),
        log('note@s6f5', 'F2.string6-naturals'),
      ],
    });
    const cards = await skillOf(db);
    expect(Object.keys(cards)).toHaveLength(OLD_ITEMS.length + 1);
    for (const id of OLD_ITEMS) expect(cards[id], id).toBe(ownerOf(id));
    expect(cards['note@s1f1']).toBe('C2.string1-naturals');
    expect(cards['find:B@s2']).toBe('C2.string2-naturals');
    expect(cards['note@s5f1']).toBe('C2.low-accidentals');
    expect(cards['find:F#@s4']).toBe(OLD_SKILL);
    expect(cards['note@s6f5']).toBe('F2.string6-naturals');
    // FSRS progress is untouched.
    expect((await db.cards.get('note@s4f3'))?.fsrs.stability).toBe(9);
    expect((await db.reviewLogs.toArray()).map((l) => l.skillId)).toEqual([
      'C2.string1-naturals',
      'C2.low-accidentals',
      OLD_SKILL,
      'F2.string6-naturals',
    ]);
    // Queued for sync, so the first push carries the restaged rows.
    const queued = (await db.outbox.toArray()).map((o) => `${o.table}/${o.id}`);
    expect(queued).toContain('cards/note@s4f3');
  });

  it('keeps the old state on the last stage and carries practising to stages with cards', async () => {
    const db = await upgraded({
      cards: [card('note@s1f0'), card('note@s1f2'), card('note@s4f0')],
      skillStates: [state(OLD_SKILL, 'practising'), state('F2.string6-naturals', 'mastered')],
    });
    expect(await statesOf(db)).toEqual([
      ['C2.all-notes', 'practising'],
      ['C2.string1-naturals', 'practising'],
      ['C2.string4-naturals', 'practising'],
      ['F2.string6-naturals', 'mastered'],
    ]);
  });

  it('lets the sharps and flats wait when the learner has only naturals so far', async () => {
    const db = await upgraded({
      cards: [card('note@s1f0'), card('find:G@s1')],
      skillStates: [state(OLD_SKILL, 'practising')],
    });
    expect(await statesOf(db)).toEqual([['C2.string1-naturals', 'practising']]);
  });

  it('keeps a learner who had mastered C2 mastered at every stage', async () => {
    const db = await upgraded({
      cards: OLD_ITEMS.map((id) => card(id)),
      skillStates: [state(OLD_SKILL, 'mastered'), state('C3.thirds', 'practising')],
    });
    const states = new Map((await db.skillStates.toArray()).map((s) => [s.skillId, s]));
    for (const s of [OLD_SKILL, ...STAGES]) expect(states.get(s), s).toEqual(state(s, 'mastered'));
    expect(states.get('C3.thirds')?.status).toBe('practising');
  });

  it('opens a database with nothing to move', async () => {
    const db = await upgraded({
      cards: [card('note@s2f2')],
      skillStates: [state(OLD_SKILL, 'unlocked')],
    });
    expect(await skillOf(db)).toEqual({ 'note@s2f2': OLD_SKILL });
    expect(await statesOf(db)).toEqual([['C2.all-notes', 'unlocked']]);
  });
});

describe('importing an export from before the split', () => {
  it('restages its rows as the upgrade does', async () => {
    const source = await upgraded({});
    await source.cards.bulkAdd(OLD_ITEMS.map((id) => card(id)));
    await source.reviewLogs.add(log('find:D@s3'));
    await source.skillStates.add(state(OLD_SKILL, 'mastered'));
    const v4File = { ...(await exportData(source)), schemaVersion: 4 };

    const target = new FretworkDB(`c2-strings-${n++}`, clock);
    open.push(target);
    await importData(target, v4File);
    expect(await skillOf(target)).toEqual(
      Object.fromEntries(OLD_ITEMS.map((id) => [id, ownerOf(id)])),
    );
    expect((await target.reviewLogs.toArray()).map((l) => l.skillId)).toEqual([
      'C2.string3-naturals',
    ]);
    expect((await target.skillStates.toArray()).map((s) => s.skillId).sort()).toEqual(
      [OLD_SKILL, ...STAGES].sort(),
    );
  });

  it('imports a current export unchanged', async () => {
    expect(restageTables({})).toEqual({});
    const states = [state('C3.thirds', 'practising')];
    expect(restageTables({ skillStates: states }).skillStates).toBe(states);
    const source = await upgraded({});
    await source.cards.add(card('note@s1f0', 'C2.string1-naturals'));
    const target = new FretworkDB(`c2-strings-${n++}`, clock);
    open.push(target);
    await importData(target, await exportData(source));
    expect(await skillOf(target)).toEqual({ 'note@s1f0': 'C2.string1-naturals' });
  });
});
