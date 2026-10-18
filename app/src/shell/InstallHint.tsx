import { useState } from 'react';
import styles from './InstallHint.module.css';

/** What the hint needs to know about the browser; injectable for tests. */
export interface InstallEnv {
  userAgent: string;
  maxTouchPoints: number;
  /** iOS Safari's `navigator.standalone`: true when launched from the home screen. */
  standalone: boolean | undefined;
  /** `(display-mode: standalone)` matches. */
  displayStandalone: boolean;
}

export type InstallPlatform = 'ipad' | 'iphone';

// Browsers other than Safari: iOS Chrome, Firefox, Edge, Opera and the Google
// app, plus desktop Chromium and Android, which also say "Safari".
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|Chrome\/|Chromium\/|Android/;

/**
 * Where to show the "Add to Home Screen" hint (design §2: installed PWA on
 * iPad). Only Safari on iPad (and, best effort, iPhone), and never once the
 * app already runs standalone. iPadOS 13+ Safari reports a Mac user agent, so
 * a Mac with multi-touch counts as an iPad.
 */
export function installPlatform(env: InstallEnv): InstallPlatform | null {
  if (env.standalone === true || env.displayStandalone) return null;
  const ua = env.userAgent;
  if (!/Safari\//.test(ua) || NOT_SAFARI.test(ua)) return null;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1)) return 'ipad';
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  return null;
}

export function browserInstallEnv(): InstallEnv {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
  };
}

export const DISMISS_KEY = 'fretwork.installHint.dismissed';

// A per-device convenience: if storage is unavailable the hint just reappears.
function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Ignore: private mode or blocked storage.
  }
}

function ShareIcon() {
  return (
    <svg className={styles.share} viewBox="0 0 20 24" aria-hidden focusable="false">
      <path d="M10 2v13M6 6l4-4 4 4" />
      <path d="M6.5 10H4v12h12V10h-2.5" />
    </svg>
  );
}

/** A dismissible hint to install Fretwork from Safari's Share menu. */
export function InstallHint({ env }: { env?: InstallEnv }) {
  const [platform] = useState(() => installPlatform(env ?? browserInstallEnv()));
  const [dismissed, setDismissed] = useState(isDismissed);
  if (!platform || dismissed) return null;

  const where = platform === 'ipad' ? 'at the top right' : 'at the bottom of the screen';
  return (
    <aside className={styles.hint} aria-label="Install Fretwork" data-platform={platform}>
      <ShareIcon />
      <p>
        <strong>Install Fretwork.</strong> Tap Share {where}, then <b>Add to Home Screen</b>. It
        opens full screen and works offline.
      </p>
      <button
        type="button"
        onClick={() => {
          rememberDismissed();
          setDismissed(true);
        }}
      >
        Not now
      </button>
    </aside>
  );
}
