import { useId } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../../app-store';
import type { PitchSource } from '../../mic';
import { MicStatus, useMicCheck } from '../../onboarding/steps/mic';
import { TOOLS, toolPath, type Tool } from '../tools/registry';
import styles from '../screens.module.css';
import local from './settings.module.css';

/**
 * Mic mode (design §9), the onboarding choice made again. Switching it on
 * asks for the mic from that tap and saves only once the mic runs; switching
 * it off saves at once and releases the mic. Links to the tuner, the fuller
 * mic check, once that tool is registered.
 */
export function MicSettings({
  source,
  tools = TOOLS,
}: {
  source?: PitchSource;
  tools?: readonly Tool[];
}) {
  const micEnabled = useAppStore((s) => s.settings.micEnabled);
  const update = useAppStore((s) => s.update);
  const check = useMicCheck(source);
  const hint = useId();
  const busy = check.phase === 'starting';
  const tuner = tools.find((t) => t.id === 'tuner');

  const toggle = async (on: boolean) => {
    if (!on) {
      check.stop();
      await update({ micEnabled: false });
      return;
    }
    if (await check.listen()) await update({ micEnabled: true });
  };

  return (
    <div role="group" aria-labelledby={`${hint}-title`} className={local.group}>
      <h2 id={`${hint}-title`} className={local.groupTitle}>
        Mic mode
      </h2>
      <label className={`${styles.toggle} ${local.row}`}>
        <input
          type="checkbox"
          checked={micEnabled}
          disabled={busy}
          aria-describedby={hint}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span className={local.grow}>Mic mode</span>
      </label>
      <p id={hint} className={`${styles.muted} ${local.hint}`}>
        Some drills listen to your guitar: you play the note instead of tapping it. Nothing is
        recorded, and no sound leaves this device.
      </p>
      <MicStatus check={check} />
      {micEnabled && (
        <div className={local.actions}>
          {tuner && (
            <Link to={toolPath(tuner.id)} className={styles.secondaryButton}>
              Open the tuner
            </Link>
          )}
          {check.phase === 'listening' ? (
            <button type="button" className={styles.secondaryButton} onClick={check.stop}>
              Stop listening
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy}
              onClick={() => void check.listen()}
            >
              Check the microphone
            </button>
          )}
        </div>
      )}
    </div>
  );
}
