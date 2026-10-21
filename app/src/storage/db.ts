import Dexie, { type EntityTable } from 'dexie';
import type {
  CardRecord,
  ConfusionRecord,
  ReviewLogRecord,
  SessionLogRecord,
  Settings,
  SkillStateRecord,
} from '../engine/model';
import type {
  AchievementRecord,
  DailyProgressRecord,
  GamificationEventRecord,
  GamificationRecord,
} from './gamification-model';
import {
  OUTBOX,
  SYNC_BOOKKEEPING_TABLES,
  SYNC_META,
  SYNC_STATE,
  backfillSyncMeta,
  syncTracking,
  systemClock,
  type OutboxRow,
  type SyncClock,
  type SyncMetaRow,
  type SyncStateRow,
} from './sync/tracking';

/** Design §3.6 and §3.7. One row per key in `settings` / `gamification` ('singleton'). */

export interface SettingsRow extends Settings {
  key: 'singleton';
}

export interface GamificationRow extends GamificationRecord {
  key: 'singleton';
}

/** An append-only row: sync tracking gives it a stable `uid` on add (sync/tracking.ts). */
export type WithUid<T> = T & { uid?: string };

export const DB_NAME = 'fretwork';

/**
 * Schema history. Never edit a released version: append a new one with an
 * `upgrade` that migrates existing rows, and add a migration test.
 */
export const SCHEMA_VERSIONS: readonly {
  version: number;
  stores: Record<string, string>;
  upgrade?: (tx: import('dexie').Transaction, clock: SyncClock) => Promise<void> | void;
}[] = [
  {
    version: 1,
    stores: {
      settings: 'key',
      cards: 'itemId, skillId, fsrs.due',
      reviewLogs: '++id, itemId, skillId, drillType, at',
      skillStates: 'skillId',
      confusions: '[a+b], a, b',
      sessionLogs: '++id, startedAt',
      gamification: 'key',
      dailyProgress: 'date',
      achievements: 'id',
      gamificationEvents: '++id, type, at',
    },
  },
  {
    // Sync (M7-01, docs/design/sync.md): a stable `uid` on append-only rows,
    // per-record metadata and tombstones, the outbox and the pull cursor.
    version: 2,
    stores: {
      reviewLogs: '++id, itemId, skillId, drillType, at, &uid',
      sessionLogs: '++id, startedAt, &uid',
      gamificationEvents: '++id, type, at, &uid',
      [SYNC_META]: '[table+id], updatedAt',
      [OUTBOX]: '[table+id]',
      [SYNC_STATE]: 'key',
    },
    upgrade: backfillSyncMeta,
  },
  {
    // M3-17: D8's chord tones in stages; old rows move to their stage's skill.
    // Loaded on demand (it runs once per device), so it stays out of first-load
    // JS; `waitFor` keeps the upgrade transaction open while it loads.
    version: 3,
    stores: {},
    upgrade: (tx) =>
      Dexie.waitFor(import('./migrations/c5-tone-stages')).then((m) => m.upgradeC5ToneStages(tx)),
  },
  {
    // M10-02: C8's harmony in key stages; rows of the later keys move to
    // their stage's skill. Loaded on demand, as v3.
    version: 4,
    stores: {},
    upgrade: (tx) =>
      Dexie.waitFor(import('./migrations/c8-stages')).then((m) => m.upgradeC8Stages(tx)),
  },
  {
    // M10-12: C2 in string stages; rows of the earlier stages' items move to
    // their stage's skill. Loaded on demand, as v3.
    version: 5,
    stores: {},
    upgrade: (tx) =>
      Dexie.waitFor(import('./migrations/c2-strings')).then((m) => m.upgradeC2Strings(tx)),
  },
];

export const SCHEMA_VERSION = SCHEMA_VERSIONS.at(-1)?.version ?? 1;

export class FretworkDB extends Dexie {
  settings!: EntityTable<SettingsRow, 'key'>;
  cards!: EntityTable<CardRecord, 'itemId'>;
  reviewLogs!: EntityTable<WithUid<ReviewLogRecord>, 'id'>;
  skillStates!: EntityTable<SkillStateRecord, 'skillId'>;
  confusions!: Dexie.Table<ConfusionRecord, [string, string]>;
  sessionLogs!: EntityTable<WithUid<SessionLogRecord>, 'id'>;
  gamification!: EntityTable<GamificationRow, 'key'>;
  dailyProgress!: EntityTable<DailyProgressRecord, 'date'>;
  achievements!: EntityTable<AchievementRecord, 'id'>;
  gamificationEvents!: EntityTable<WithUid<GamificationEventRecord>, 'id'>;
  syncMeta!: Dexie.Table<SyncMetaRow, [string, string]>;
  outbox!: Dexie.Table<OutboxRow, [string, string]>;
  syncState!: EntityTable<SyncStateRow, 'key'>;

  /** `clock` stamps sync metadata; tests pass a fake for deterministic times and IDs. */
  constructor(name: string = DB_NAME, clock: SyncClock = systemClock) {
    super(name);
    this.use(syncTracking(clock));
    for (const v of SCHEMA_VERSIONS) {
      const version = this.version(v.version).stores(v.stores);
      const { upgrade } = v;
      if (upgrade) version.upgrade((tx) => upgrade(tx, clock));
    }
  }
}

/** Every store, in the order each first appeared. */
export const STORE_NAMES = [...new Set(SCHEMA_VERSIONS.flatMap((v) => Object.keys(v.stores)))];

/** The app's data tables: what export and import carry. Sync bookkeeping is left out. */
export const TABLE_NAMES = STORE_NAMES.filter(
  (name) => !(SYNC_BOOKKEEPING_TABLES as readonly string[]).includes(name),
);

let instance: FretworkDB | null = null;

/** The app-wide database. Tests construct their own `FretworkDB` with a unique name. */
export function getDb(): FretworkDB {
  return (instance ??= new FretworkDB());
}
