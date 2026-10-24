import { useRef, useState } from 'react';
import { useAppStore } from '../../app-store';
import { getDb, importData, parseExport } from '../../storage';
import { downloadExport } from '../../storage/download-export';
import styles from '../screens.module.css';

/** Export and import of all local data (design §3.6). */
export function YourData() {
  const load = useAppStore((s) => s.load);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onExport = () => downloadExport(getDb());

  const onImport = async (file: File) => {
    try {
      await importData(getDb(), parseExport(await file.text()));
      await load();
      setMessage('Import complete.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <>
      <p className={styles.muted}>
        Your progress is saved on this device. Export a backup any time, signed in or not.
      </p>
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
