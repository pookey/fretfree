import { useId, useState } from 'react';
import { useAppStore } from '../../app-store';
import { Calibration } from './Calibration';
import styles from './Calibration.module.css';

/** The Settings row: the stored tap time, and a re-run of the calibration in place. */
export function CalibrationSetting() {
  const baseline = useAppStore((s) => s.settings.latencyBaselineMs);
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className={styles.setting}>
      <div className={styles.settingRow}>
        <span>
          Tap time{' '}
          <span className={styles.muted} data-testid="latency-baseline">
            {baseline === null ? 'not measured' : `${baseline} ms`}
          </span>
        </span>
        <button
          type="button"
          className={styles.settingButton}
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close' : baseline === null ? 'Measure' : 'Recalibrate'}
        </button>
      </div>
      {open && (
        <div id={panel} className={styles.settingPanel}>
          <Calibration
            doneAction={
              <button type="button" className={styles.settingButton} onClick={() => setOpen(false)}>
                Done
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}
