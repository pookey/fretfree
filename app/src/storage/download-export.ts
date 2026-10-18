import type { FretworkDB } from './db';
import { exportData, exportToJson } from './export-import';

/** The backup's file name, e.g. fretwork-2026-10-18.json. */
export function exportFileName(now: Date): string {
  return `fretwork-${now.toISOString().slice(0, 10)}.json`;
}

/** Export all local data and hand it to the browser as a JSON download. */
export async function downloadExport(db: FretworkDB, now: Date = new Date()): Promise<string> {
  const json = exportToJson(await exportData(db, now));
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const name = exportFileName(now);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}
