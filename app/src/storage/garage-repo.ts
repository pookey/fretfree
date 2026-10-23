import { catalogueItem } from '../engine/garage/catalogue';
import { STARTER_BUILD, cleanGuitarName } from '../engine/garage/starter';
import {
  CATEGORIES,
  type BuyResult,
  type GarageBuild,
  type GaragePurchase,
  type GuitarSpec,
  type WalletState,
} from '../engine/garage/types';
import { buy, owned } from '../engine/garage/wallet';
import type { FretworkDB } from './db';
import { getGamification } from './repository';

/**
 * Persistence for the Garage (design §3.8): the owned parts and the equipped
 * build. The garage only reads XP: `xpTotal` is never written here, and the
 * balance is always derived from it and the purchases.
 */

export class GarageError extends Error {}

/** The stored build, part by part, with the starter part wherever one is missing or unknown. */
export async function getGarage(db: FretworkDB): Promise<GarageBuild> {
  const row = await db.garage.get('singleton');
  const spec = { ...STARTER_BUILD.spec };
  for (const category of CATEGORIES) {
    const id = row?.spec?.[category];
    if (id !== undefined && catalogueItem(id)?.category === category) spec[category] = id;
  }
  return { spec, name: typeof row?.name === 'string' ? row.name : STARTER_BUILD.name };
}

/** Every owned part that was bought, oldest first. Starter and badge parts have no row. */
export async function listPurchases(db: FretworkDB): Promise<GaragePurchase[]> {
  const rows = await db.garagePurchases.toArray();
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime() || a.itemId.localeCompare(b.itemId));
}

/** What the wallet needs, read from the database. */
export async function getWalletState(db: FretworkDB): Promise<WalletState> {
  return db.transaction('r', db.gamification, db.achievements, db.garagePurchases, async () => ({
    xpTotal: (await getGamification(db)).xpTotal,
    purchases: await listPurchases(db),
    achievements: await db.achievements.toArray(),
  }));
}

export interface BuildPatch {
  spec?: Partial<GuitarSpec>;
  name?: string;
}

/**
 * Equip parts and/or rename the guitar. Equipping is free, but only owned
 * parts can be equipped: a try-on stays in the UI until it is bought.
 * Throws `GarageError` for an unknown, misfiled or unowned part.
 */
export async function saveGarage(db: FretworkDB, patch: BuildPatch): Promise<GarageBuild> {
  return db.transaction('rw', [db.garage, db.garagePurchases, db.achievements], async () => {
    const current = await getGarage(db);
    const next: GarageBuild = {
      spec: { ...current.spec, ...patch.spec },
      name: patch.name === undefined ? current.name : cleanGuitarName(patch.name),
    };
    if (patch.spec) {
      const mine = owned(await db.garagePurchases.toArray(), await db.achievements.toArray());
      for (const category of CATEGORIES) {
        const id = next.spec[category];
        if (catalogueItem(id)?.category !== category) {
          throw new GarageError(`${id} is not a ${category} part`);
        }
        if (!mine.has(id)) throw new GarageError(`${id} is not owned`);
      }
    }
    await db.garage.put({ ...next, key: 'singleton' });
    return next;
  });
}

export interface PurchaseOptions {
  /** Also equip the part, in the same transaction. */
  equip?: boolean;
}

/**
 * Buy one part with the garage balance. `canBuy` is re-checked inside the
 * transaction against the stored XP, purchases and badges, so a stale screen
 * can't overspend or buy a part twice.
 */
export async function purchase(
  db: FretworkDB,
  itemId: string,
  now: Date,
  options: PurchaseOptions = {},
): Promise<BuyResult> {
  const item = catalogueItem(itemId);
  if (!item) return { ok: false, reason: 'unknown-item' };
  return db.transaction(
    'rw',
    [db.gamification, db.achievements, db.garagePurchases, db.garage],
    async () => {
      const result = buy(item, await getWalletState(db), now);
      if (!result.ok) return result;
      await db.garagePurchases.add(result.purchase);
      if (options.equip) {
        const current = await getGarage(db);
        await db.garage.put({
          ...current,
          spec: { ...current.spec, [item.category]: item.id },
          key: 'singleton',
        });
      }
      return result;
    },
  );
}
