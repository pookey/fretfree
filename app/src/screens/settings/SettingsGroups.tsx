import { liveQuery } from 'dexie';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useAppStore } from '../../app-store';
import { playNotes, unlockAudio } from '../../audio/audio';
import type { Settings } from '../../engine';
import { CalibrationSetting } from '../../onboarding/calibration/CalibrationSetting';
import { DAILY_GOAL_OPTIONS, SESSION_LENGTH_OPTIONS } from '../../onboarding/options';
import { Picks } from '../../onboarding/steps/notation';
import {
  getDb,
  getGamification,
  saveGamification,
  type DailyGoalMinutes,
  type GamificationRecord,
} from '../../storage';
import { TUNINGS } from '../../theory';
import { DeveloperTools } from './DeveloperTools';
import styles from '../screens.module.css';
import local from './settings.module.css';

/** The note the "Play a test note" button sounds (A below middle C). */
const TEST_NOTE = 'A3';

/** A titled card of related settings. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const heading = useId();
  return (
    <div role="group" aria-labelledby={heading} className={local.group}>
      <h2 id={heading} className={local.groupTitle}>
        {title}
      </h2>
      {children}
    </div>
  );
}

/** A line of help under a control, which points at it with `aria-describedby`. */
function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={`${styles.muted} ${local.hint}`}>
      {children}
    </p>
  );
}

/**
 * The gamification record, kept live so imports and sessions show at once,
 * and a save that shows the change straight away rather than after the write.
 */
function useGamification(): [
  GamificationRecord | null,
  (patch: Partial<GamificationRecord>) => void,
] {
  const [record, setRecord] = useState<GamificationRecord | null>(null);
  useEffect(() => {
    const sub = liveQuery(() => getGamification(getDb())).subscribe({
      next: setRecord,
      error: () => setRecord(null),
    });
    return () => sub.unsubscribe();
  }, []);
  const save = (patch: Partial<GamificationRecord>) => {
    setRecord((r) => r && { ...r, ...patch });
    void saveGamification(getDb(), patch);
  };
  return [record, save];
}

function GuitarSettings({ settings, update }: SettingsProps) {
  return (
    <Group title="Your guitar">
      <label className={local.row}>
        Handedness
        <select
          value={settings.handedness}
          onChange={(e) => void update({ handedness: e.target.value as Settings['handedness'] })}
        >
          <option value="right">Right-handed</option>
          <option value="left">Left-handed</option>
        </select>
      </label>
      <label className={local.row}>
        Tuning
        <select value={settings.tuning} onChange={(e) => void update({ tuning: e.target.value })}>
          {TUNINGS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className={local.row}>
        Note names
        <select
          value={settings.accidentalPref}
          onChange={(e) =>
            void update({ accidentalPref: e.target.value as Settings['accidentalPref'] })
          }
        >
          <option value="sharp">Sharps (C♯, F♯)</option>
          <option value="flat">Flats (D♭, G♭)</option>
        </select>
      </label>
    </Group>
  );
}

function PracticeSettings({ settings, update }: SettingsProps) {
  const [gamification, save] = useGamification();
  const amuletHint = useId();
  return (
    <Group title="Practice">
      <label className={local.row}>
        Session length
        <select
          value={settings.sessionMinutes}
          onChange={(e) =>
            void update({ sessionMinutes: Number(e.target.value) as Settings['sessionMinutes'] })
          }
        >
          {SESSION_LENGTH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {gamification && (
        <>
          <label className={local.row}>
            Daily goal
            <select
              value={gamification.dailyGoalMinutes}
              onChange={(e) =>
                save({ dailyGoalMinutes: Number(e.target.value) as DailyGoalMinutes })
              }
            >
              {DAILY_GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.detail ? `${o.label}: ${o.detail}` : o.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles.toggle} ${local.row}`}>
            <input
              type="checkbox"
              checked={gamification.weekendAmulet}
              aria-describedby={amuletHint}
              onChange={(e) => save({ weekendAmulet: e.target.checked })}
            />
            <span className={local.grow}>Weekend amulet</span>
          </label>
          <Hint id={amuletHint}>
            Saturdays and Sundays off won&apos;t break your streak. Practice on them still counts.
          </Hint>
        </>
      )}
    </Group>
  );
}

function SoundSettings({ settings, update }: SettingsProps) {
  const percent = Math.round(settings.volume * 100);
  const testNote = () => {
    void unlockAudio()
      .then(() => playNotes([TEST_NOTE], { volume: settings.volume, muted: !settings.soundOn }))
      .catch(() => {
        /* No audio in this browser; the setting still saves. */
      });
  };
  return (
    <Group title="Sound">
      <label className={`${styles.toggle} ${local.row}`}>
        <input
          type="checkbox"
          checked={settings.soundOn}
          onChange={(e) => void update({ soundOn: e.target.checked })}
        />
        <span className={local.grow}>Sound</span>
      </label>
      <label className={local.row}>
        Volume
        <span className={local.range}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={percent}
            disabled={!settings.soundOn}
            aria-valuetext={`${percent}%`}
            onChange={(e) => void update({ volume: Number(e.target.value) / 100 })}
          />
          <output aria-hidden="true" className={local.value}>
            {percent}%
          </output>
        </span>
      </label>
      <div className={local.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!settings.soundOn}
          onClick={testNote}
        >
          Play a test note
        </button>
      </div>
    </Group>
  );
}

function ReadingSettings({ settings, update }: SettingsProps) {
  const { reading } = settings;
  return (
    <Group title="Reading music">
      <p className={`${styles.muted} ${local.hint}`}>
        The neck is taught by name, position and sound either way. Every reading track stays open to
        try.
      </p>
      <Picks
        legend="What can you already read?"
        value={reading.reads}
        onChange={(reads) => void update({ reading: { ...reading, reads } })}
      />
      <Picks
        legend="What would you like to learn to read?"
        value={reading.learn}
        onChange={(learn) => void update({ reading: { ...reading, learn } })}
      />
    </Group>
  );
}

function GuideSettings({ settings, update }: SettingsProps) {
  const blindHint = useId();
  return (
    <Group title="Guides and timing">
      <label className={`${styles.toggle} ${local.row}`}>
        <input
          type="checkbox"
          checked={settings.blindMode}
          aria-describedby={blindHint}
          onChange={(e) => void update({ blindMode: e.target.checked })}
        />
        <span className={local.grow}>Blind mode</span>
      </label>
      <Hint id={blindHint}>
        Once a skill&apos;s guides have faded completely, hide the fret inlays too.
      </Hint>
      <CalibrationSetting />
    </Group>
  );
}

interface SettingsProps {
  settings: Settings;
  update(patch: Partial<Settings>): Promise<void>;
}

/**
 * The settings cards (design §4, §9): everything onboarding asked, plus
 * sound, the weekend amulet and a calibration re-run. Every change saves at
 * once. None of them can switch off spacing or retrieval (research/02 rule 16).
 * Development builds add a Developer card (`DeveloperTools`); production has none.
 */
export function SettingsGroups() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.update);
  return (
    <div className={local.settings}>
      <GuitarSettings settings={settings} update={update} />
      <PracticeSettings settings={settings} update={update} />
      <SoundSettings settings={settings} update={update} />
      <ReadingSettings settings={settings} update={update} />
      <GuideSettings settings={settings} update={update} />
      {import.meta.env.DEV && (
        <Group title="Developer">
          <DeveloperTools />
        </Group>
      )}
    </div>
  );
}
