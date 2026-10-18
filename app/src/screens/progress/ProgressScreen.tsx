import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../app-store';
import type { Settings } from '../engine';
import { ScreenLayout } from '../shell/ScreenLayout';
import {
  allCards,
  exportData,
  exportToJson,
  getDb,
  importData,
  parseExport,
  reviewCount,
} from '../storage';
import styles from './screens.module.css';

async function loadStats() {
  const db = getDb();
  return { reviews: await reviewCount(db), cards: (await allCards(db)).length };
}

export function ProgressScreen() {
  const { settings, update, load } = useAppStore();
  const [stats, setStats] = useState({ reviews: 0, cards: 0 });
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => loadStats().then(setStats);

  useEffect(() => {
    void loadStats().then(setStats);
  }, []);

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
      await refresh();
      setMessage('Import complete.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    }
  };

  return (
    <ScreenLayout title="Progress">
      <dl className={styles.stats}>
        <div>
          <dt>Answers logged</dt>
          <dd data-testid="review-count">{stats.reviews}</dd>
        </div>
        <div>
          <dt>Notes in rotation</dt>
          <dd data-testid="card-count">{stats.cards}</dd>
        </div>
      </dl>

      <h2 className={styles.sectionTitle}>Settings</h2>
      <div className={styles.settings}>
        <label>
          Handedness
          <select
            value={settings.handedness}
            onChange={(e) => void update({ handedness: e.target.value as Settings['handedness'] })}
          >
            <option value="right">Right-handed</option>
            <option value="left">Left-handed</option>
          </select>
        </label>
        <label>
          Session length
          <select
            value={settings.sessionMinutes}
            onChange={(e) =>
              void update({ sessionMinutes: Number(e.target.value) as Settings['sessionMinutes'] })
            }
          >
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
          </select>
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.soundOn}
            onChange={(e) => void update({ soundOn: e.target.checked })}
          />
          Sound
        </label>
      </div>

      <h2 className={styles.sectionTitle}>Your data</h2>
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
    </ScreenLayout>
  );
}
