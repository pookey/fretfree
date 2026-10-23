import { useEffect } from 'react';
import type { AchievementDefinition } from '../../engine/gamification/types';
import { BadgeIcon } from './BadgeIcon';
import { GarageUnlockLine } from './GarageUnlockLine';
import { useAchievementUnlocks } from './useAchievementUnlocks';
import styles from './Achievements.module.css';

/** How long the toast stays up before it dismisses itself. */
export const TOAST_MS = 8000;

/** The toast for badges just unlocked (design §3.7 achievements). Renders nothing when empty. */
export function AchievementToast({
  achievements,
  onDismiss,
}: {
  achievements: readonly AchievementDefinition[];
  onDismiss(): void;
}) {
  const count = achievements.length;
  useEffect(() => {
    if (count === 0) return;
    const t = window.setTimeout(onDismiss, TOAST_MS);
    return () => window.clearTimeout(t);
  }, [count, onDismiss]);

  if (count === 0) return null;
  return (
    <div className={styles.toast} role="status" data-testid="achievement-toast">
      <div className={styles.toastBody}>
        <p className={styles.eyebrow}>
          {count === 1 ? 'Achievement unlocked' : `${count} achievements unlocked`}
        </p>
        <ul className={styles.toastList}>
          {achievements.map((a) => (
            <li key={a.id}>
              <BadgeIcon category={a.category} unlocked />
              <div>
                <strong>{a.title}</strong>
                <span>{a.description}</span>
                <GarageUnlockLine badgeId={a.id} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

/** Unlocks badges as they are earned and toasts them. Mount once in the app shell. */
export function AchievementUnlocks() {
  const { unlocked, dismiss } = useAchievementUnlocks();
  return <AchievementToast achievements={unlocked} onDismiss={dismiss} />;
}
