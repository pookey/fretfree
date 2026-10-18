import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../../../app-store';
import { getDb, getGamification } from '../../../storage';
import styles from '../../screens.module.css';

export const id = 'hero';
export const order = 10;

/** The streak and the one big start button (design §7 Today). */
export function Card() {
  const minutes = useAppStore((s) => s.settings.sessionMinutes);
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void getGamification(getDb()).then((g) => live && setStreak(g.streakCurrent));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className={styles.hero}>
      <div className={styles.streak} data-testid="streak">
        <span aria-hidden>🔥</span>
        <strong>{streak ?? 0}</strong>
        <span>day streak</span>
      </div>
      <Link to="/session" className={styles.startButton} data-testid="start-session">
        Start session ({minutes} min)
      </Link>
    </div>
  );
}
