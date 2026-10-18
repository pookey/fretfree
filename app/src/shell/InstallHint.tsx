import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getDb } from '../storage';
import { downloadExport } from '../storage/download-export';
import {
  browserInstallEnv,
  captureInstallPrompt,
  getInstallPrompt,
  hasLocalProgress,
  installOffer,
  promptInstall,
  subscribeInstallPrompt,
  type InstallBrowser,
  type InstallEnv,
  type InstallOffer,
  type InstallPlatform,
} from './install';
import { Logo } from './Logo';
import styles from './InstallHint.module.css';

// Chromium can fire `beforeinstallprompt` before anything mounts, so listen
// from the start. The onboarding step and the Today card both import this.
if (typeof window !== 'undefined') captureInstallPrompt(window);

/**
 * The install tip's pieces, shared by the onboarding step
 * (`onboarding/steps/install.tsx`) and the Today card
 * (`screens/today/cards/install.tsx`), design §2.
 */

/** What to offer here, if anything, kept current as an install prompt arrives. */
export function useInstallOffer(env?: InstallEnv): InstallOffer | null {
  const [base] = useState(() => env ?? browserInstallEnv());
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null);
  // A prompt is used up once shown; keep offering it so the outcome stays on screen.
  const [prompted, setPrompted] = useState(false);
  if (prompt && !prompted) setPrompted(true);
  return installOffer({ env: base, canPrompt: prompted || prompt !== null });
}

/** Whether this browser holds progress; null while checking. */
export function useHasProgress(): boolean | null {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    hasLocalProgress(getDb())
      .then((h) => live && setHas(h))
      .catch(() => live && setHas(false));
    return () => {
      live = false;
    };
  }, []);
  return has;
}

export const BROWSER_NAMES: Record<InstallBrowser, string> = {
  safari: 'Safari',
  chrome: 'Chrome',
  edge: 'Edge',
};

export function ShareIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M8.5 10H6v11h12V10h-2.5" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="6" cy="12" r="1.25" />
      <circle cx="12" cy="12" r="1.25" />
      <circle cx="18" cy="12" r="1.25" />
    </svg>
  );
}

/** Where the learner's browser keeps its Share button. */
export function shareInstruction({ device, browser }: InstallPlatform): ReactNode {
  if (browser === 'chrome')
    return (
      <>
        Tap <b>Share</b> at the right of the address bar.
      </>
    );
  if (browser === 'edge')
    return (
      <>
        Tap the <b>⋯</b> menu, then <b>Share</b>.
      </>
    );
  return device === 'ipad' ? (
    <>
      Tap <b>Share</b> at the top right.
    </>
  ) : (
    <>
      Tap <b>Share</b> at the bottom of the screen (or <b>⋯</b> first, if Share isn’t there).
    </>
  );
}

/** The illustrated Share → "Add to Home Screen" steps for the learner's browser. */
export function InstallSteps({ platform }: { platform: InstallPlatform }) {
  return (
    <ol className={styles.steps} data-testid="install-steps">
      <li>
        <span className={styles.badge}>
          {platform.browser === 'edge' ? <MoreIcon /> : <ShareIcon />}
        </span>
        <span>{shareInstruction(platform)}</span>
      </li>
      <li>
        <span className={styles.badge}>
          <AddIcon />
        </span>
        <span>
          Choose <b>Add to Home Screen</b>. You may need to scroll down the list.
        </span>
      </li>
      <li>
        <span className={`${styles.badge} ${styles.app}`}>
          <Logo className={styles.logo} size={22} />
        </span>
        <span>
          Leave <b>Open as Web App</b> on if you see it, then tap <b>Add</b>.
        </span>
      </li>
    </ol>
  );
}

/** Exports this browser's progress, for importing in the installed app. */
export function ExportButton({ className }: { className?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const save = () =>
    downloadExport(getDb()).then(
      (name) => setMessage(`Saved ${name}.`),
      // Say so: this is the step before moving to the installed app.
      (e: unknown) =>
        setMessage(`Couldn’t export: ${e instanceof Error ? e.message : 'something went wrong'}.`),
    );
  return (
    <>
      <button type="button" className={className ?? styles.secondary} onClick={() => void save()}>
        Export my progress
      </button>
      {message && <p role="status">{message}</p>}
    </>
  );
}

/**
 * The storage caveat (design §2): a Home Screen app on iOS has its own
 * storage, separate from the browser, so progress made here stays here. Once
 * sync (M7) exists, signing in will be the other way across.
 */
export function StorageNote({
  browser,
  hasProgress,
  during,
}: {
  browser: InstallBrowser;
  hasProgress: boolean;
  during: 'setup' | 'practice';
}) {
  const name = BROWSER_NAMES[browser];
  if (!hasProgress)
    return (
      <p className={styles.note} data-testid="install-storage">
        The Home Screen app keeps its own progress, separate from {name}. So add it now, then open
        FretFree from your Home Screen and {during === 'setup' ? 'finish setup' : 'practise'} there.
      </p>
    );
  return (
    <div className={styles.note} data-testid="install-storage">
      <p>
        Your progress in {name} won’t carry over by itself: the Home Screen app keeps its own.
        Export it here, then in the installed app open <b>Progress → Your data → Import data</b>.
      </p>
      <ExportButton />
    </div>
  );
}

const OUTCOME_COPY = {
  accepted: 'Installed. Open FretFree from your apps.',
  dismissed: 'You can install FretFree later from the browser menu.',
} as const;

/**
 * Chromium's install prompt behind our own button. A prompt works once, so the
 * button shows only while the browser holds one (it may offer another later).
 */
export function PromptInstall({ className }: { className?: string }) {
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null);
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null);
  return (
    <>
      {prompt && outcome !== 'accepted' && (
        <button
          type="button"
          className={className ?? styles.secondary}
          onClick={() => void promptInstall().then(setOutcome)}
        >
          Install FretFree
        </button>
      )}
      <p role="status" className={styles.status}>
        {outcome && !(prompt && outcome === 'dismissed') ? OUTCOME_COPY[outcome] : ''}
      </p>
    </>
  );
}
