import { useAppStore } from '../../../app-store';
import type { Settings } from '../../../engine';
import { CalibrationSetting } from '../../../onboarding/calibration/CalibrationSetting';
import styles from '../../screens.module.css';

export const id = 'settings';
export const order = 20;
export const title = 'Settings';

export function Panel() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.update);
  return (
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
      <CalibrationSetting />
    </div>
  );
}
