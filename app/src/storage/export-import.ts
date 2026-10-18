import { SCHEMA_VERSION, TABLE_NAMES, type FretworkDB } from './db';

/** Design §3.6: JSON export/import of all local data. */

export const EXPORT_APP_ID = 'fretwork';

export interface ExportFile {
  app: typeof EXPORT_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

const DATE_TAG = '$date';

function encode(value: unknown): unknown {
  if (value instanceof Date) return { [DATE_TAG]: value.toISOString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === DATE_TAG && typeof obj[DATE_TAG] === 'string') {
      return new Date(obj[DATE_TAG]);
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, decode(v)]));
  }
  return value;
}

export async function exportData(db: FretworkDB, now: Date = new Date()): Promise<ExportFile> {
  const tables: Record<string, unknown[]> = {};
  await db.transaction('r', db.tables, async () => {
    for (const name of TABLE_NAMES) tables[name] = (await db.table(name).toArray()).map(encode);
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

/**
 * Replace all local data with the export's contents. Older exports are
 * written into the current schema; Dexie migrations only run on open, so
 * future versions that change row shapes must transform rows here.
 */
export async function importData(db: FretworkDB, file: ExportFile): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name);
      await table.clear();
      const rows = file.tables[name];
      if (Array.isArray(rows) && rows.length > 0) await table.bulkAdd(rows.map(decode));
    }
  });
}
