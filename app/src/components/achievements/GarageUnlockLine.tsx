import { Fragment } from 'react';
import { garageUnlocks } from './garage-unlocks';
import styles from './Achievements.module.css';

/**
 * "Unlocks the *Gold leaf* finish in the Garage" under a badge that unlocks a
 * mastery finish (design §3.8). Secondary to the badge's competence copy, and
 * plain text, not a link: nothing nudges a visit to the Garage. Renders
 * nothing for badges that unlock nothing.
 */
export function GarageUnlockLine({ badgeId }: { badgeId: string }) {
  const parts = garageUnlocks(badgeId);
  if (parts.length === 0) return null;
  return (
    <p className={styles.unlocks} data-testid="garage-unlock">
      Unlocks{' '}
      {parts.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && (i === parts.length - 1 ? ' and ' : ', ')}
          the <em>{p.name}</em> {p.noun}
        </Fragment>
      ))}{' '}
      in the Garage
    </p>
  );
}
