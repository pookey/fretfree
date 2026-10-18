import { useId, useSyncExternalStore, type CSSProperties } from 'react';
import type { StatusOverlay } from '../../engine/overlay';
import styles from '../screens.module.css';
import local from './settings.module.css';

/**
 * Developer tools (M1-36), in development builds only (`pnpm dev`, including
 * an iPad on the LAN). "Unlock every skill" lays a status overlay over the
 * derived statuses, so any module can be tried without real mastery of its
 * prerequisites. It is a per-device convenience kept in localStorage: it
 * never writes skill states, cards or review logs, and the session runner
 * stores nothing for the skills only it unlocks.
 *
 * Callers reach every export behind `import.meta.env.DEV`, so a production
 * build drops this module whole, sourcemap included (checked by
 * `e2e/m1-36.spec.ts`). Styles are inline for the same reason: a CSS module
 * would ship in production CSS.
 */

const STORAGE_KEY = 'fretwork.dev.unlockAll';
const UNLOCK_ALL: StatusOverlay = { unlockAll: true };
const listeners = new Set<() => void>();

function readUnlockAll(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeUnlockAll(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage blocked: the switch can't stay on. */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab turned it on or off.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function useStoredUnlockAll(): boolean {
  return useSyncExternalStore(subscribe, readUnlockAll, () => false);
}

/** The status overlay to derive with: null unless the developer switch is on. */
export function useStatusOverlay(): StatusOverlay | null {
  const on = useStoredUnlockAll();
  return import.meta.env.DEV && on ? UNLOCK_ALL : null;
}

/** The "Unlock every skill" switch, for the Developer settings card. */
export function DeveloperTools() {
  const on = useStoredUnlockAll();
  const hint = useId();
  if (!import.meta.env.DEV) return null;
  return (
    <>
      <label className={`${styles.toggle} ${local.row}`}>
        <input
          type="checkbox"
          checked={on}
          aria-describedby={hint}
          onChange={(e) => writeUnlockAll(e.target.checked)}
        />
        <span className={local.grow}>Unlock every skill</span>
      </label>
      <p id={hint} className={`${styles.muted} ${local.hint}`}>
        Development builds only. Every skill joins your sessions so you can try any module now.
        Practice on the skills it unlocks isn&apos;t saved, and turning it off restores your real
        progress.
      </p>
    </>
  );
}

const BADGE: CSSProperties = {
  position: 'fixed',
  top: 'calc(var(--safe-top) + var(--space-1))',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1000,
  margin: 0,
  padding: 'var(--space-1) var(--space-3)',
  borderRadius: 'var(--radius-s)',
  background: 'var(--accent-fill)',
  color: 'var(--accent-text)',
  fontSize: '0.8125rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
  // A label, not a control: taps go through to what's under it.
  pointerEvents: 'none',
};

/**
 * Shown on every screen while the switch is on, so screenshots and QA never
 * mistake overlay statuses for real progress.
 */
export function DevUnlockBadge() {
  const on = useStoredUnlockAll();
  if (!import.meta.env.DEV || !on) return null;
  return (
    <p role="status" style={BADGE} data-testid="dev-unlock-badge">
      Developer: all skills unlocked
    </p>
  );
}
