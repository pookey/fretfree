import { useId } from 'react';
import { Link } from 'react-router';
import { Guitar, guitarLabel } from '../components/guitar';
import { GARAGE_PATH } from '../components/xp';
import { resolveLook } from '../screens/garage/model';
import { useGarageBuild } from '../screens/garage/useGarageBuild';
import styles from './GuitarAvatar.module.css';

/**
 * The equipped guitar on the iPad sidebar, linking to the Garage (design
 * §3.8, §7 Garage). `StreakBadge` loads this module lazily. `full` shows the
 * whole guitar beside its name; `icon` (the collapsed rail) the body only.
 * The parts are read out as the link's description, after its name.
 */
export function GuitarAvatar({ variant }: { variant: 'full' | 'icon' }) {
  const build = useGarageBuild();
  const describedBy = useId();
  if (!build || !GARAGE_PATH) return null;
  const look = resolveLook(build.spec);
  const icon = variant === 'icon';
  return (
    <Link
      to={GARAGE_PATH}
      className={styles.avatar}
      data-variant={variant}
      data-testid="sidebar-guitar"
      aria-label={`Your guitar: ${build.name}`}
      aria-describedby={describedBy}
    >
      <span className={styles.art} aria-hidden>
        <Guitar spec={look} size={icon ? 2.25 : 4.5} crop={icon ? 'body' : 'full'} />
      </span>
      {!icon && (
        <span className={styles.text} aria-hidden>
          <span className={styles.label}>Your guitar</span>
          <strong className={styles.name}>{build.name}</strong>
        </span>
      )}
      <span id={describedBy} hidden>
        {guitarLabel(look)}
      </span>
    </Link>
  );
}
