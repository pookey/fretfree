import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { Rating } from 'ts-fsrs';
import { getSkill } from '../../engine/skills';
import type { CardRecord, SkillStateRecord } from '../../engine/model';
import { FretworkDB, SCHEMA_VERSIONS } from '../db';
import { exportData, importData } from '../export-import';
import type { SyncClock } from '../sync/tracking';
import { OLD_SKILL, STAGES, restage, restageTables, stageOf, stageStates } from './c5-tone-stages';

let n = 0;
const open: FretworkDB[] = [];

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete();
});

/** The twelve items `C5.tones-triads` held, in its order. */
const OLD_ITEMS = (['1', '3', '5'] as const).flatMap((d) =>
  (['major', 'minor'] as const).flatMap((chord) => {
    const degree = d === '3' && chord === 'minor' ? 'b3' : d;
    return [`chord-tone:${degree}@${chord}`, `chord-tone-name:${degree}@${chord}`];
  }),
);

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
  drillType: 'chord-tone',
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

/** A schema v2 database holding `rows`, as a device had it before M3-17. */
async function v2Db(rows: Record<string, unknown[]>): Promise<string> {
  const name = `c5-tone-stages-${n++}`;
  const legacy = new Dexie(name);
  for (const v of SCHEMA_VERSIONS.filter((v) => v.version <= 2))
    legacy.version(v.version).stores(v.stores);
  await legacy.open();
  for (const [table, list] of Object.entries(rows)) await legacy.table(table).bulkAdd(list);
  legacy.close();
  return name;
}

let ids = 0;
const clock: SyncClock = { now: () => 888, newId: () => `id-${ids++}` };

async function upgraded(rows: Record<string, unknown[]>): Promise<FretworkDB> {
  const db = new FretworkDB(await v2Db(rows), clock);
  open.push(db);
  await db.open();
  return db;
}

const skillOf = async (db: FretworkDB) =>
  Object.fromEntries((await db.cards.toArray()).map((c) => [c.itemId, c.skillId]));

describe('stageOf', () => {
  it('maps each old item to the stage that now owns it', () => {
    expect(OLD_ITEMS).toHaveLength(getSkill('C5.tones-roots')!.items().length * 3);
    for (const id of OLD_ITEMS) {
      const stage = stageOf(id)!;
      expect(STAGES, id).toContain(stage);
      expect(
        getSkill(stage)!
          .items()
          .map((i) => i.id),
      ).toContain(id);
    }
    const staged = STAGES.flatMap((s) =>
      getSkill(s)!
        .items()
        .map((i) => i.id),
    );
    expect(new Set(staged)).toEqual(new Set(OLD_ITEMS));
  });

  it("leaves items that weren't the old skill's alone", () => {
    expect(stageOf('chord-tone:b7@7')).toBeUndefined();
    expect(stageOf('note@s6f5')).toBeUndefined();
    const other = card('chord-tone:1@major', 'C5.tones-roots');
    expect(restage(other)).toBe(other);
    const odd = card('chord-tone:b7@7');
    expect(restage(odd)).toBe(odd);
  });
});

describe('stageStates', () => {
  it('carries mastered to every stage, practising to stages with cards', () => {
    expect(stageStates(state(OLD_SKILL, 'mastered'), new Set()).map((s) => s.skillId)).toEqual([
      ...STAGES,
    ]);
    expect(
      stageStates(state(OLD_SKILL, 'practising'), new Set(['C5.tones-thirds'])).map((s) => [
        s.skillId,
        s.status,
        s.guideLevel,
      ]),
    ).toEqual([
      ['C5.tones-roots', 'practising', 1],
      ['C5.tones-thirds', 'practising', 1],
    ]);
    expect(stageStates(state(OLD_SKILL, 'unlocked'), new Set(STAGES))).toEqual([
      state('C5.tones-roots', 'unlocked'),
    ]);
  });
});

describe('schema v3 upgrade', () => {
  it('moves cards and reviews onto their stage and leaves other skills alone', async () => {
    const db = await upgraded({
      cards: [
        ...OLD_ITEMS.map((id) => card(id)),
        card('chord-tone:b7@7', 'C5.tones-sevenths'),
        card('note@s6f5', 'F2.string6-naturals'),
      ],
      reviewLogs: [
        log('chord-tone:1@major'),
        log('chord-tone-name:b3@minor'),
        log('chord-tone:5@minor'),
        log('chord-tone:b7@7', 'C5.tones-sevenths'),
      ],
    });
    const cards = await skillOf(db);
    expect(Object.keys(cards)).toHaveLength(OLD_ITEMS.length + 2);
    for (const id of OLD_ITEMS) expect(cards[id]).toBe(stageOf(id));
    expect(cards['chord-tone:b7@7']).toBe('C5.tones-sevenths');
    expect(cards['note@s6f5']).toBe('F2.string6-naturals');
    // FSRS progress is untouched.
    expect((await db.cards.get('chord-tone:3@major'))?.fsrs.stability).toBe(9);
    expect((await db.reviewLogs.toArray()).map((l) => l.skillId)).toEqual([
      'C5.tones-roots',
      'C5.tones-thirds',
      'C5.tones-fifths',
      'C5.tones-sevenths',
    ]);
    expect(await db.reviewLogs.where('skillId').equals(OLD_SKILL).count()).toBe(0);
    // Queued for sync, so the first push carries the restaged rows.
    const queued = (await db.outbox.toArray()).map((o) => `${o.table}/${o.id}`);
    expect(queued).toContain('cards/chord-tone:3@major');
  });

  it("splits the old skill's state across the stages", async () => {
    const db = await upgraded({
      cards: [card('chord-tone:1@major'), card('chord-tone:3@major')],
      skillStates: [state(OLD_SKILL, 'practising'), state('C5.triads', 'mastered')],
    });
    const states = await db.skillStates.toArray();
    expect(states.map((s) => [s.skillId, s.status]).sort()).toEqual([
      ['C5.tones-roots', 'practising'],
      ['C5.tones-thirds', 'practising'],
      ['C5.triads', 'mastered'],
    ]);
  });

  it('keeps a learner who had mastered the old skill mastered at every stage', async () => {
    const db = await upgraded({
      cards: OLD_ITEMS.map((id) => card(id)),
      skillStates: [state(OLD_SKILL, 'mastered'), state('C5.tones-sevenths', 'practising')],
    });
    const states = new Map((await db.skillStates.toArray()).map((s) => [s.skillId, s]));
    for (const s of STAGES) expect(states.get(s)).toEqual(state(s, 'mastered'));
    expect(states.get('C5.tones-sevenths')?.status).toBe('practising');
    expect(states.has(OLD_SKILL)).toBe(false);
  });

  it('opens a database with nothing to move', async () => {
    const db = await upgraded({ cards: [card('note@s6f5', 'F2.string6-naturals')] });
    expect(await skillOf(db)).toEqual({ 'note@s6f5': 'F2.string6-naturals' });
    expect(await db.skillStates.count()).toBe(0);
  });
});

describe('importing an export from before the split', () => {
  it('restages its rows as the upgrade does', async () => {
    const source = await upgraded({});
    await source.cards.bulkAdd(OLD_ITEMS.map((id) => card(id)));
    await source.reviewLogs.add(log('chord-tone:5@major'));
    await source.skillStates.bulkAdd([
      state(OLD_SKILL, 'mastered'),
      state('C5.tones-roots', 'mastered'),
    ]);
    const v2File = { ...(await exportData(source)), schemaVersion: 2 };

    const target = new FretworkDB(`c5-tone-stages-${n++}`, clock);
    open.push(target);
    await importData(target, v2File);
    expect(await skillOf(target)).toEqual(
      Object.fromEntries(OLD_ITEMS.map((id) => [id, stageOf(id)])),
    );
    expect((await target.reviewLogs.toArray()).map((l) => l.skillId)).toEqual(['C5.tones-fifths']);
    expect((await target.skillStates.toArray()).map((s) => s.skillId).sort()).toEqual(
      [...STAGES].sort(),
    );
  });

  it('imports a current export unchanged', async () => {
    const tables = { cards: [card('chord-tone:1@major')] };
    expect(restageTables({})).toEqual({});
    expect(restageTables(tables).cards).toEqual([card('chord-tone:1@major', 'C5.tones-roots')]);
    const source = await upgraded({});
    await source.cards.add(card('chord-tone:1@major', 'C5.tones-thirds'));
    const target = new FretworkDB(`c5-tone-stages-${n++}`, clock);
    open.push(target);
    await importData(target, await exportData(source));
    expect(await skillOf(target)).toEqual({ 'chord-tone:1@major': 'C5.tones-thirds' });
  });
});
