import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { Rating } from 'ts-fsrs';
import { getSkill } from '../../engine/skills';
import type { CardRecord, SkillStateRecord } from '../../engine/model';
import { FretworkDB, SCHEMA_VERSIONS } from '../db';
import { exportData, importData } from '../export-import';
import type { SyncClock } from '../sync/tracking';
import { STAGES, restage, restageTables, stageOf, stageStates } from './c8-stages';

let n = 0;
const open: FretworkDB[] = [];

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete();
});

const ROMAN = 'C8.numerals-major';
const NASHVILLE = 'C8.nashville';
const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'];
const NUMERALS = ['IV', 'V', 'vi', 'ii', 'iii', 'vii°'];
const NASHVILLES = ['4', '5', '6m', '2m', '3m', '7°'];

/** The 144 items `C8.numerals-major` held before the split. */
const OLD_ROMAN = KEYS.flatMap((k) =>
  NUMERALS.flatMap((r) => [`numeral:${r}@key=${k}`, `numeral-of:${r}@key=${k}`]),
);
/** The 72 items `C8.nashville` held. */
const OLD_NASHVILLE = KEYS.flatMap((k) => NASHVILLES.map((r) => `nashville:${r}@key=${k}`));

const card = (itemId: string, skillId = ROMAN) => ({
  itemId,
  skillId,
  fsrs: { due: new Date('2026-10-20T09:00:00Z'), stability: 9, state: 2 } as CardRecord['fsrs'],
  createdAt: new Date('2026-10-01T09:00:00Z'),
  lastReviewedAt: new Date('2026-10-18T09:00:00Z'),
});

let uids = 0;
const log = (itemId: string, skillId = ROMAN) => ({
  uid: `log-${uids++}`,
  itemId,
  skillId,
  drillType: 'numerals',
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

/** A schema v3 database holding `rows`, as a device had it before M10-02. */
async function v3Db(rows: Record<string, unknown[]>): Promise<string> {
  const name = `c8-stages-${n++}`;
  const legacy = new Dexie(name);
  for (const v of SCHEMA_VERSIONS.filter((v) => v.version <= 3))
    legacy.version(v.version).stores(v.stores);
  await legacy.open();
  for (const [table, list] of Object.entries(rows)) await legacy.table(table).bulkAdd(list);
  legacy.close();
  return name;
}

let ids = 0;
const clock: SyncClock = { now: () => 888, newId: () => `id-${ids++}` };

async function upgraded(rows: Record<string, unknown[]>): Promise<FretworkDB> {
  const db = new FretworkDB(await v3Db(rows), clock);
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
const ownerOf = (id: string, old: string) =>
  [old, ...STAGES[old]!].find((s) => itemIds(s).includes(id));

describe('stageOf', () => {
  it('maps each old item to the stage that now owns it', () => {
    for (const [old, items] of [
      [ROMAN, OLD_ROMAN],
      [NASHVILLE, OLD_NASHVILLE],
    ] as const) {
      const all = [old, ...STAGES[old]!].flatMap(itemIds);
      expect(new Set(all)).toEqual(new Set(items));
      for (const id of items) expect(stageOf(old, id) ?? old, id).toBe(ownerOf(id, old));
    }
  });

  it('leaves stage-1 keys and other skills alone', () => {
    expect(stageOf(ROMAN, 'numeral:vi@key=D')).toBeUndefined();
    expect(stageOf(ROMAN, 'note@s6f5')).toBeUndefined();
    expect(stageOf('I4.minor-keys', 'numeral:iv@key=A')).toBeUndefined();
    const kept = card('numeral:IV@key=G');
    expect(restage(kept)).toBe(kept);
    const other = card('numeral:IV@key=A', 'C8.numerals-a-e-f');
    expect(restage(other)).toBe(other);
  });
});

describe('stageStates', () => {
  it('carries mastered to every stage, practising to stages with cards', () => {
    expect(stageStates(state(ROMAN, 'mastered'), new Set()).map((s) => s.skillId)).toEqual([
      ...STAGES[ROMAN]!,
    ]);
    expect(
      stageStates(state(NASHVILLE, 'practising'), new Set(['C8.nashville-other-keys'])).map((s) => [
        s.skillId,
        s.status,
        s.guideLevel,
      ]),
    ).toEqual([['C8.nashville-other-keys', 'practising', 1]]);
    expect(stageStates(state(ROMAN, 'unlocked'), new Set(STAGES[ROMAN]))).toEqual([]);
    expect(stageStates(state('C5.triads', 'mastered'), new Set())).toEqual([]);
  });
});

describe('schema v4 upgrade', () => {
  it('moves cards and reviews of the later keys onto their stage', async () => {
    const db = await upgraded({
      cards: [
        ...OLD_ROMAN.map((id) => card(id)),
        ...OLD_NASHVILLE.map((id) => card(id, NASHVILLE)),
        card('note@s6f5', 'F2.string6-naturals'),
      ],
      reviewLogs: [
        log('numeral:IV@key=C'),
        log('numeral-of:vi@key=E'),
        log('nashville:5@key=Ab', NASHVILLE),
        log('note@s6f5', 'F2.string6-naturals'),
      ],
    });
    const cards = await skillOf(db);
    expect(Object.keys(cards)).toHaveLength(OLD_ROMAN.length + OLD_NASHVILLE.length + 1);
    for (const id of OLD_ROMAN) expect(cards[id], id).toBe(ownerOf(id, ROMAN));
    for (const id of OLD_NASHVILLE) expect(cards[id], id).toBe(ownerOf(id, NASHVILLE));
    expect(cards['numeral:V@key=D']).toBe(ROMAN);
    expect(cards['numeral:V@key=F']).toBe('C8.numerals-a-e-f');
    expect(cards['nashville:6m@key=Db']).toBe('C8.nashville-other-keys');
    expect(cards['note@s6f5']).toBe('F2.string6-naturals');
    // FSRS progress is untouched.
    expect((await db.cards.get('numeral:IV@key=Bb'))?.fsrs.stability).toBe(9);
    expect((await db.reviewLogs.toArray()).map((l) => l.skillId)).toEqual([
      ROMAN,
      'C8.numerals-a-e-f',
      'C8.nashville-other-keys',
      'F2.string6-naturals',
    ]);
    // Queued for sync, so the first push carries the restaged rows.
    const queued = (await db.outbox.toArray()).map((o) => `${o.table}/${o.id}`);
    expect(queued).toContain('cards/numeral:IV@key=Bb');
  });

  it('keeps the old state on stage 1 and carries practising to stages with cards', async () => {
    const db = await upgraded({
      cards: [card('numeral:IV@key=C'), card('numeral:IV@key=A')],
      skillStates: [state(ROMAN, 'practising'), state(NASHVILLE, 'unlocked')],
    });
    const states = await db.skillStates.toArray();
    expect(states.map((s) => [s.skillId, s.status]).sort()).toEqual([
      ['C8.nashville', 'unlocked'],
      ['C8.numerals-a-e-f', 'practising'],
      ['C8.numerals-major', 'practising'],
    ]);
  });

  it('keeps a learner who had mastered C8 mastered at every stage', async () => {
    const db = await upgraded({
      cards: OLD_ROMAN.map((id) => card(id)),
      skillStates: [
        state(ROMAN, 'mastered'),
        state(NASHVILLE, 'mastered'),
        state('C9.pop', 'practising'),
      ],
    });
    const states = new Map((await db.skillStates.toArray()).map((s) => [s.skillId, s]));
    for (const s of [ROMAN, NASHVILLE, ...STAGES[ROMAN]!, ...STAGES[NASHVILLE]!])
      expect(states.get(s), s).toEqual(state(s, 'mastered'));
    expect(states.get('C9.pop')?.status).toBe('practising');
  });

  it('opens a database with nothing to move', async () => {
    const db = await upgraded({ cards: [card('numeral:IV@key=G')] });
    expect(await skillOf(db)).toEqual({ 'numeral:IV@key=G': ROMAN });
    expect(await db.skillStates.count()).toBe(0);
  });
});

describe('importing an export from before the split', () => {
  it('restages its rows as the upgrade does', async () => {
    const source = await upgraded({});
    await source.cards.bulkAdd(OLD_ROMAN.map((id) => card(id)));
    await source.reviewLogs.add(log('numeral:ii@key=Eb'));
    await source.skillStates.add(state(ROMAN, 'mastered'));
    const v3File = { ...(await exportData(source)), schemaVersion: 3 };

    const target = new FretworkDB(`c8-stages-${n++}`, clock);
    open.push(target);
    await importData(target, v3File);
    expect(await skillOf(target)).toEqual(
      Object.fromEntries(OLD_ROMAN.map((id) => [id, ownerOf(id, ROMAN)])),
    );
    expect((await target.reviewLogs.toArray()).map((l) => l.skillId)).toEqual([
      'C8.numerals-other-keys',
    ]);
    expect((await target.skillStates.toArray()).map((s) => s.skillId).sort()).toEqual(
      [ROMAN, ...STAGES[ROMAN]!].sort(),
    );
  });

  it('imports a current export unchanged', async () => {
    expect(restageTables({})).toEqual({});
    const states = [state('C9.pop', 'practising')];
    expect(restageTables({ skillStates: states }).skillStates).toBe(states);
    const source = await upgraded({});
    await source.cards.add(card('numeral:IV@key=C'));
    const target = new FretworkDB(`c8-stages-${n++}`, clock);
    open.push(target);
    await importData(target, await exportData(source));
    expect(await skillOf(target)).toEqual({ 'numeral:IV@key=C': ROMAN });
  });
});
