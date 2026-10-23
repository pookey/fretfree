import { Link } from 'react-router';
import { Guitar, guitarLabel } from '../../../../components/guitar';
import { GARAGE_PATH, toSpendText, useXp } from '../../../../components/xp';
import { resolveLook } from '../../../garage/model';
import { useGarageBuild } from '../../../garage/useGarageBuild';
import styles from './GuitarCard.module.css';

/**
 * The "Your guitar" panel's body: the equipped build, its name and the
 * Garage balance (design §3.8), with a way into the Garage. Live, so an
 * equip or a purchase shows without a reload. `panels/guitar.tsx` loads it
 * lazily, keeping the guitar and the catalogue lookups out of first load.
 */
export function GuitarCard({ revision }: { revision: number }) {
  const build = useGarageBuild(revision);
  const xp = useXp();
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
