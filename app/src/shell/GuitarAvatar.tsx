import { liveQuery } from 'dexie';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { Guitar, guitarLabel } from '../components/guitar';
import { GARAGE_PATH } from '../components/xp';
import type { GarageBuild } from '../engine/garage';
import { resolveLook } from '../screens/garage/model';
import { getDb } from '../storage';
import { getGarage } from '../storage/garage-repo';
import styles from './GuitarAvatar.module.css';

/** The equipped build, kept live: equipping a part in the Garage redraws it. */
function useBuild(): GarageBuild | null {
  const [build, setBuild] = useState<GarageBuild | null>(null);
  useEffect(() => {
    const sub = liveQuery(() => getGarage(getDb())).subscribe({
      next: setBuild,
      error: (e: unknown) => console.error('Loading your guitar failed', e),
    });
    return () => sub.unsubscribe();
  }, []);
  return build;
}

/**
 * The equipped guitar on the iPad sidebar, linking to the Garage (design
 * §3.8, §7 Garage). `StreakBadge` loads this module lazily. `full` shows the
 * whole guitar beside its name; `icon` (the collapsed rail) the body only.
 * The parts are read out as the link's description, after its name.
 */
export function GuitarAvatar({ variant }: { variant: 'full' | 'icon' }) {
  const build = useBuild();
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
