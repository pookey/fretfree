import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../app-store';
import { SKILLS } from '../engine';
import { ScreenLayout } from '../shell/ScreenLayout';
import { allCards, countDue, getDb, getGamification, type GamificationRecord } from '../storage';
import styles from './screens.module.css';

interface TodayStats {
  due: number;
  newAvailable: number;
  gamification: GamificationRecord;
}

async function loadStats(): Promise<TodayStats> {
  const db = getDb();
  const now = new Date();
  const cards = await allCards(db);
  const carded = new Set(cards.map((c) => c.itemId));
  const newAvailable = SKILLS.filter((s) => s.prerequisites.length === 0)
    .flatMap((s) => s.items())
    .filter((i) => !carded.has(i.id)).length;
  return { due: await countDue(db, now), newAvailable, gamification: await getGamification(db) };
}

export function TodayScreen() {
  const minutes = useAppStore((s) => s.settings.sessionMinutes);
  const [stats, setStats] = useState<TodayStats | null>(null);

  useEffect(() => {
    let live = true;
    void loadStats().then((s) => live && setStats(s));
    return () => {
      live = false;
    };
  }, []);

  return (
    <ScreenLayout
      title="Today"
      contextTitle="Why daily practice"
      context={
        <div className={styles.contextCopy}>
          <h2>Short and often</h2>
          <p>
            A few minutes every day beats one long session a week. Spacing your practice makes it
            feel harder — and that is exactly why it sticks.
          </p>
        </div>
      }
    >
      <div className={styles.hero}>
        <div className={styles.streak} data-testid="streak">
          <span aria-hidden>🔥</span>
          <strong>{stats?.gamification.streakCurrent ?? 0}</strong>
          <span>day streak</span>
        </div>
        <Link to="/session" className={styles.startButton} data-testid="start-session">
          Start session ({minutes} min)
        </Link>
      </div>
      <dl className={styles.stats}>
        <div>
          <dt>Due reviews</dt>
          <dd data-testid="due-count">{stats?.due ?? '–'}</dd>
        </div>
        <div>
          <dt>New notes waiting</dt>
          <dd data-testid="new-count">{stats?.newAvailable ?? '–'}</dd>
        </div>
        <div>
          <dt>Streak freezes</dt>
          <dd>{stats?.gamification.freezesHeld ?? '–'}</dd>
        </div>
      </dl>
    </ScreenLayout>
  );
}
