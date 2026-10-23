import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogueItem } from '../engine/garage/types';
import { STARTER_BUILD, STARTER_SPEC } from '../engine/garage/starter';
import { FretworkDB } from './db';
import { exportData, exportToJson, importData, parseExport } from './export-import';
import {
  GarageError,
  getGarage,
  getWalletState,
  listPurchases,
  purchase,
  saveGarage,
} from './garage-repo';
import { saveGamification } from './gamification-repo';
import { getGamification } from './repository';
import { mergeIntoLocal, readSyncRecord } from './sync/tracking';

const now = new Date('2026-10-23T09:00:00Z');
const later = new Date('2026-10-24T09:00:00Z');
let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`garage-test-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

// M11-01 ships only the free starter set, so a stand-in priced part and
// mastery finish join the catalogue here.
vi.mock('../engine/garage/catalogue', async (importOriginal) => {
  const real = await importOriginal<typeof import('../engine/garage/catalogue')>();
  const extra: CatalogueItem[] = [
    {
      id: 'finish.blue',
      category: 'finish',
      name: 'Blue',
      price: 120,
      render: { type: 'solid', stops: [{ offset: 0, colour: '#0072b2' }] },
    },
    {
      id: 'finish.gold-leaf',
      category: 'finish',
      name: 'Gold leaf',
      unlockedBy: 'whole-neck',
      render: { type: 'metallic', stops: [{ offset: 0, colour: '#c9a227' }] },
    },
  ];
  const all = [...real.CATALOGUE, ...extra];
  return { ...real, CATALOGUE: all, catalogueItem: (id: string) => all.find((i) => i.id === id) };
});

/** A bought part, written straight to the table the repo reads. */
async function ownPart(itemId: string, price: number, at = now) {
  await db.garagePurchases.add({ itemId, price, at });
}

describe('the equipped build', () => {
  it('is the starter guitar until one is saved', async () => {
    expect(await getGarage(db)).toEqual(STARTER_BUILD);
  });

  it('saves a name, trimmed and capped', async () => {
    await saveGarage(db, { name: `  ${'Blue Moon '.repeat(6)}` });
    const { name, spec } = await getGarage(db);
    expect(name).toBe('Blue Moon '.repeat(4).trim());
    expect(spec).toEqual(STARTER_SPEC);
  });

  it('re-equips an owned part for free', async () => {
    await saveGarage(db, { spec: { finish: STARTER_SPEC.finish } });
    expect((await getGarage(db)).spec.finish).toBe(STARTER_SPEC.finish);
    expect(await listPurchases(db)).toEqual([]);
  });

  it('refuses to equip a part that is unknown, misfiled or not owned', async () => {
    await expect(saveGarage(db, { spec: { finish: 'finish.nope' } })).rejects.toThrow(GarageError);
    await expect(saveGarage(db, { spec: { finish: STARTER_SPEC.body } })).rejects.toThrow(
      /is not a finish part/,
    );
    await expect(saveGarage(db, { spec: { finish: 'finish.blue' } })).rejects.toThrow(
      /finish\.blue is not owned/,
    );
    expect(await getGarage(db)).toEqual(STARTER_BUILD);
  });

  it('checks only the patched parts, so a build synced before its purchase never blocks', async () => {
    // A sync pull landed the other device's build; its purchase row hasn't arrived yet.
    await db.garage.put({
      key: 'singleton',
      spec: { ...STARTER_SPEC, finish: 'finish.blue' },
      name: 'Blue Moon',
    });
    await saveGarage(db, { spec: { body: STARTER_SPEC.body } });
    await saveGarage(db, { name: 'Still blue' });
    expect(await getGarage(db)).toEqual({
      spec: { ...STARTER_SPEC, finish: 'finish.blue' },
      name: 'Still blue',
    });
    await expect(
      saveGarage(db, { spec: { body: STARTER_SPEC.body, finish: 'finish.blue' } }),
    ).rejects.toThrow(/finish\.blue is not owned/);
  });

  it('falls back to the starter part for a missing or unknown stored part', async () => {
    await db.garage.put({
      key: 'singleton',
      spec: { ...STARTER_SPEC, finish: 'finish.retired', body: STARTER_SPEC.inlay },
      name: 'Old faithful',
    });
    expect(await getGarage(db)).toEqual({ spec: STARTER_SPEC, name: 'Old faithful' });
    await db.garage.put({ key: 'singleton' } as never);
    expect(await getGarage(db)).toEqual(STARTER_BUILD);
  });
});

describe('purchases', () => {
  it('lists bought parts oldest first', async () => {
    await ownPart('finish.blue', 120, later);
    await ownPart('finish.green', 80, now);
    await ownPart('body.telecaster', 200, now);
    expect((await listPurchases(db)).map((p) => p.itemId)).toEqual([
      'body.telecaster',
      'finish.green',
      'finish.blue',
    ]);
  });

  it('reads the wallet from stored XP, purchases and badges', async () => {
    await saveGamification(db, { xpTotal: 500 });
    await ownPart('finish.blue', 120);
    await db.achievements.add({ id: 'whole-neck', unlockedAt: now });
    expect(await getWalletState(db)).toEqual({
      xpTotal: 500,
      purchases: [{ itemId: 'finish.blue', price: 120, at: now }],
      achievements: [{ id: 'whole-neck', unlockedAt: now }],
    });
  });

  it('refuses an unknown part without touching the database', async () => {
    expect(await purchase(db, 'finish.nope', now)).toEqual({ ok: false, reason: 'unknown-item' });
    expect(await listPurchases(db)).toEqual([]);
  });

  it('refuses a starter part as already owned, and never writes XP', async () => {
    await saveGamification(db, { xpTotal: 300 });
    expect(await purchase(db, STARTER_SPEC.body, now, { equip: true })).toEqual({
      ok: false,
      reason: 'owned',
    });
    expect(await listPurchases(db)).toEqual([]);
    expect((await getGamification(db)).xpTotal).toBe(300);
  });
});

describe('buying', () => {
  it('records the part at its price, spending nothing of XP earned', async () => {
    await saveGamification(db, { xpTotal: 150 });
    const result = await purchase(db, 'finish.blue', now);
    expect(result).toEqual({ ok: true, purchase: { itemId: 'finish.blue', price: 120, at: now } });
    expect(await listPurchases(db)).toEqual([{ itemId: 'finish.blue', price: 120, at: now }]);
    expect((await getGamification(db)).xpTotal).toBe(150);
    expect((await getGarage(db)).spec.finish).toBe(STARTER_SPEC.finish);
  });

  it('equips the part in the same transaction when asked', async () => {
    await saveGamification(db, { xpTotal: 150 });
    await saveGarage(db, { name: 'Blue Moon' });
    await purchase(db, 'finish.blue', now, { equip: true });
    expect(await getGarage(db)).toEqual({
      spec: { ...STARTER_SPEC, finish: 'finish.blue' },
      name: 'Blue Moon',
    });
    // Back to the starter finish, for free.
    await saveGarage(db, { spec: { finish: STARTER_SPEC.finish } });
    expect((await getGarage(db)).spec.finish).toBe(STARTER_SPEC.finish);
  });

  it('re-checks against stored XP, so a stale screen cannot overspend or buy twice', async () => {
    await saveGamification(db, { xpTotal: 119 });
    expect(await purchase(db, 'finish.blue', now)).toEqual({ ok: false, reason: 'unaffordable' });
    await saveGamification(db, { xpTotal: 240 });
    await purchase(db, 'finish.blue', now);
    expect(await purchase(db, 'finish.blue', later)).toEqual({ ok: false, reason: 'owned' });
    expect(await listPurchases(db)).toHaveLength(1);
  });

  it('never sells a mastery finish, but equips it once its badge is unlocked', async () => {
    await saveGamification(db, { xpTotal: 10_000 });
    expect(await purchase(db, 'finish.gold-leaf', now)).toEqual({
      ok: false,
      reason: 'mastery-only',
    });
    await expect(saveGarage(db, { spec: { finish: 'finish.gold-leaf' } })).rejects.toThrow(
      /is not owned/,
    );
    await db.achievements.add({ id: 'whole-neck', unlockedAt: now });
    await saveGarage(db, { spec: { finish: 'finish.gold-leaf' } });
    expect((await getGarage(db)).spec.finish).toBe('finish.gold-leaf');
    expect(await listPurchases(db)).toEqual([]);
  });
});

describe('two devices', () => {
  it('that bought the same part sync to one row, dated by the first purchase', async () => {
    const other = new FretworkDB(`garage-other-${n++}`);
    await other.open();
    try {
      await ownPart('finish.blue', 120, later);
      await other.garagePurchases.add({ itemId: 'finish.blue', price: 120, at: now });
      const theirs = await readSyncRecord(other, 'garagePurchases', 'finish.blue');
      await mergeIntoLocal(db, [theirs!]);
      expect(await listPurchases(db)).toEqual([{ itemId: 'finish.blue', price: 120, at: now }]);
    } finally {
      await other.delete();
    }
  });

  it('keep the latest equipped build', async () => {
    const other = new FretworkDB(`garage-other-${n++}`);
    await other.open();
    try {
      await saveGarage(db, { name: 'Mine' });
      await new Promise((r) => setTimeout(r, 5));
      await saveGarage(other, { name: 'Theirs' });
      const theirs = await readSyncRecord(other, 'garage', 'singleton');
      await mergeIntoLocal(db, [theirs!]);
      expect((await getGarage(db)).name).toBe('Theirs');
    } finally {
      await other.delete();
    }
  });
});

describe('export and import', () => {
  it('round-trip the purchases and the build', async () => {
    await ownPart('finish.blue', 120);
    await saveGarage(db, { name: 'Blue Moon' });
    const json = exportToJson(await exportData(db, now));
    const other = new FretworkDB(`garage-import-${n++}`);
    try {
      await importData(other, parseExport(json));
      expect(await listPurchases(other)).toEqual([{ itemId: 'finish.blue', price: 120, at: now }]);
      expect(await getGarage(other)).toEqual({ spec: STARTER_SPEC, name: 'Blue Moon' });
    } finally {
      await other.delete();
    }
  });

  it('still import a v5 file, which has no garage tables', async () => {
    await ownPart('finish.blue', 120);
    const v5 = {
      app: 'fretwork',
      schemaVersion: 5,
      exportedAt: now.toISOString(),
      tables: { gamification: [{ key: 'singleton', xpTotal: 250 }] },
    };
    await importData(db, parseExport(JSON.stringify(v5)));
    expect((await getGamification(db)).xpTotal).toBe(250);
    expect(await listPurchases(db)).toEqual([]);
    expect(await getGarage(db)).toEqual(STARTER_BUILD);
  });
});
