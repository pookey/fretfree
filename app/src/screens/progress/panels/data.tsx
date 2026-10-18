import { useRef, useState } from 'react';
import { useAppStore } from '../../../app-store';
import { exportData, exportToJson, getDb, importData, parseExport } from '../../../storage';
import type { PanelProps } from '../registry';
import styles from '../../screens.module.css';

export const id = 'data';
export const order = 30;
export const title = 'Your data';

export function Panel({ onDataChanged }: PanelProps) {
  const load = useAppStore((s) => s.load);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onExport = async () => {
    const json = exportToJson(await exportData(getDb()));
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `fretwork-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File) => {
    try {
      await importData(getDb(), parseExport(await file.text()));
      await load();
      onDataChanged();
      setMessage('Import complete.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <>
      <p className={styles.muted}>Everything stays on this device. Export a backup any time.</p>
      <div className={styles.toolbar}>
        <button type="button" className={styles.secondaryButton} onClick={() => void onExport()}>
          Export data
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => fileRef.current?.click()}
        >
          Import data
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          data-testid="import-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
          }}
        />
      </div>
      {message && <p role="status">{message}</p>}
    </>
  );
}
