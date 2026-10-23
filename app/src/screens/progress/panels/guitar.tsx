import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Guitar, guitarLabel } from '../../../components/guitar';
import { GARAGE_PATH, toSpendText, useXp } from '../../../components/xp';
import type { GarageBuild } from '../../../engine/garage';
import { getDb } from '../../../storage';
import { getGarage } from '../../../storage/garage-repo';
import { resolveLook } from '../../garage/model';
import type { PanelProps } from '../registry';
import styles from './guitar.module.css';

export const id = 'guitar';
// After the calendar, before the achievements whose badges unlock finishes.
export const order = 14;
export const title = 'Your guitar';

/**
 * The equipped build, its name and the Garage balance (design §3.8), with a
 * way into the Garage. Live, so an equip or a purchase shows without a reload.
 */
export function Panel({ revision }: PanelProps) {
  const [build, setBuild] = useState<GarageBuild | null>(null);
  const xp = useXp();

  useEffect(() => {
    const sub = liveQuery(() => getGarage(getDb())).subscribe({
      next: setBuild,
      error: (e: unknown) => console.error('Loading your guitar failed', e),
    });
    return () => sub.unsubscribe();
  }, [revision]);

  if (!build) return null;
  const look = resolveLook(build.spec);
  return (
    <div className={styles.card} data-testid="progress-guitar">
      <Guitar spec={look} size={11} label={`${build.name}: ${guitarLabel(look)}`} />
      <div className={styles.info}>
        <p className={styles.name} data-testid="progress-guitar-name">
          {build.name}
        </p>
        <p className={styles.balance} data-testid="progress-guitar-balance">
          {toSpendText(xp?.toSpend ?? 0)}
        </p>
        {GARAGE_PATH && (
          <Link to={GARAGE_PATH} className={styles.open}>
            Open the Garage
          </Link>
        )}
      </div>
    </div>
  );
}
