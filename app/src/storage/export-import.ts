import { SCHEMA_VERSION, TABLE_NAMES, type FretworkDB } from './db';
import { decodeDates, encodeDates, withLegacyUids } from './sync/model';

/** Design §3.6: JSON export/import of all local data. */

export const EXPORT_APP_ID = 'fretwork';

export interface ExportFile {
  app: typeof EXPORT_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportData(db: FretworkDB, now: Date = new Date()): Promise<ExportFile> {
  const tables: Record<string, unknown[]> = {};
  await db.transaction('r', db.tables, async () => {
    for (const name of TABLE_NAMES)
      tables[name] = (await db.table(name).toArray()).map((row) => encodeDates(row));
  });
  return {
    app: EXPORT_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    tables,
  };
}

export function exportToJson(file: ExportFile): string {
  return JSON.stringify(file, null, 2);
}

export class ImportError extends Error {}

export function parseExport(json: string): ExportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ImportError('This file is not valid JSON.');
  }
  const file = parsed as Partial<ExportFile>;
  if (
    !file ||
    file.app !== EXPORT_APP_ID ||
    typeof file.tables !== 'object' ||
    file.tables === null
  ) {
    throw new ImportError('This is not a FretFree export file.');
  }
  if (typeof file.schemaVersion !== 'number' || file.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError(
      'This export comes from a newer version of FretFree. Update the app first.',
    );
  }
  return file as ExportFile;
}

type Tables = ExportFile['tables'];

/**
 * The schema versions that moved rows to new skills, each with its frozen
 * restage, in version order: v3 staged D8's chord tones (M3-17), v4 C8's
 * harmony by key (M10-02), and v5 C2's notes by string (M10-12). Loaded on
 * demand, as the upgrades are.
 */
const RESTAGES: readonly [number, () => Promise<{ restageTables: (t: Tables) => Tables }>][] = [
  [3, () => import('./migrations/c5-tone-stages')],
  [4, () => import('./migrations/c8-stages')],
  [5, () => import('./migrations/c2-strings')],
];

/**
 * Replace all local data with the export's contents. Older exports are
 * written into the current schema; Dexie migrations only run on open, so
 * future versions that change row shapes must transform rows here.
 */
export async function importData(db: FretworkDB, file: ExportFile): Promise<void> {
  let tables = file.tables;
  for (const [version, load] of RESTAGES)
    if (file.schemaVersion < version) tables = (await load()).restageTables(tables);
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name);
      await table.clear();
      const rows = tables[name];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      // Rows from a v1 file have no uid: give them the same content-derived
      // uids a v1 database gets on upgrade, so sync doesn't duplicate them.
      const decoded = rows.map((row) => decodeDates(row) as Record<string, unknown>);
      await table.bulkAdd(withLegacyUids(name, decoded));
    }
  });
}
