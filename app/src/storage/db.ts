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

/** Design §3.6 and §3.7. One row per key in `settings` / `gamification` ('singleton'). */

export interface SettingsRow extends Settings {
  key: 'singleton';
}

export interface GamificationRow extends GamificationRecord {
  key: 'singleton';
}

export const DB_NAME = 'fretwork';

/**
 * Schema history. Never edit a released version: append a new one with an
 * `upgrade` that migrates existing rows, and add a migration test.
 */
export const SCHEMA_VERSIONS: readonly {
  version: number;
  stores: Record<string, string>;
  upgrade?: (tx: import('dexie').Transaction) => Promise<void> | void;
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
];

export const SCHEMA_VERSION = SCHEMA_VERSIONS.at(-1)?.version ?? 1;

export class FretworkDB extends Dexie {
  settings!: EntityTable<SettingsRow, 'key'>;
  cards!: EntityTable<CardRecord, 'itemId'>;
  reviewLogs!: EntityTable<ReviewLogRecord, 'id'>;
  skillStates!: EntityTable<SkillStateRecord, 'skillId'>;
  confusions!: Dexie.Table<ConfusionRecord, [string, string]>;
  sessionLogs!: EntityTable<SessionLogRecord, 'id'>;
  gamification!: EntityTable<GamificationRow, 'key'>;
  dailyProgress!: EntityTable<DailyProgressRecord, 'date'>;
  achievements!: EntityTable<AchievementRecord, 'id'>;
  gamificationEvents!: EntityTable<GamificationEventRecord, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);
    for (const v of SCHEMA_VERSIONS) {
      const version = this.version(v.version).stores(v.stores);
      if (v.upgrade) version.upgrade(v.upgrade);
    }
  }
}

export const TABLE_NAMES = Object.keys(SCHEMA_VERSIONS.at(-1)?.stores ?? {});

let instance: FretworkDB | null = null;

/** The app-wide database. Tests construct their own `FretworkDB` with a unique name. */
export function getDb(): FretworkDB {
  return (instance ??= new FretworkDB());
}
