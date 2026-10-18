import type { FretworkDB } from '../storage';

/** What the install tip needs to know about the browser; injectable for tests. */
export interface InstallEnv {
  userAgent: string;
  maxTouchPoints: number;
  /** iOS Safari's `navigator.standalone`: true when launched from the Home Screen. */
  standalone: boolean | undefined;
  /** `(display-mode: standalone)` matches. */
  displayStandalone: boolean;
}

export type InstallDevice = 'ipad' | 'iphone';
/** iOS browsers that can add a web app to the Home Screen. */
export type InstallBrowser = 'safari' | 'chrome' | 'edge';

export interface InstallPlatform {
  device: InstallDevice;
  browser: InstallBrowser;
}

// Browsers that can't add to the Home Screen on iOS (Firefox, Opera, the Google
// app), plus desktop Chromium and Android, which also say "Safari".
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|Chrome\/|Chromium\/|Android/;
// iOS 16.4 let other browsers add to the Home Screen from their share menu.
const SHARE_MENU_IOS = 16.4;

export function isStandalone(env: InstallEnv): boolean {
  return env.standalone === true || env.displayStandalone;
}

/** The iOS version in an iPhone or iPad user agent (`OS 17_5` → 17.5), or null. */
export function iosVersion(userAgent: string): number | null {
  const m = /OS (\d+)_(\d+)/.exec(userAgent);
  return m ? Number(m[1]) + Number(m[2]) / 10 : null;
}

function iosBrowser(ua: string): InstallBrowser | null {
  if (/CriOS\//.test(ua)) return 'chrome';
  if (/EdgiOS\//.test(ua)) return 'edge';
  if (/Safari\//.test(ua) && !NOT_SAFARI.test(ua)) return 'safari';
  return null;
}

/**
 * Where "Add to Home Screen" works (design §2: installed PWA on iPad), and
 * never once the app already runs standalone. Safari on iPad and, best
 * effort, iPhone; Chrome and Edge on iOS 16.4 and later. iPadOS 13+ Safari
 * reports a Mac user agent, so a Mac with multi-touch counts as an iPad.
 */
export function installPlatform(env: InstallEnv): InstallPlatform | null {
  if (isStandalone(env)) return null;
  const ua = env.userAgent;
  const browser = iosBrowser(ua);
  if (!browser) return null;
  let device: InstallDevice | null = null;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1)) device = 'ipad';
  else if (/iPhone|iPod/.test(ua)) device = 'iphone';
  if (!device) return null;
  if (browser !== 'safari' && (iosVersion(ua) ?? 0) < SHARE_MENU_IOS) return null;
  return { device, browser };
}

/**
 * What the tip offers, if anything:
 * - `ios`: the Share → "Add to Home Screen" steps for the learner's browser;
 * - `prompt`: an Install button, where `beforeinstallprompt` fired.
 */
export type InstallOffer = { kind: 'ios'; platform: InstallPlatform } | { kind: 'prompt' };

export function installOffer({
  env,
  canPrompt,
}: {
  env: InstallEnv;
  canPrompt: boolean;
}): InstallOffer | null {
  if (isStandalone(env)) return null;
  const platform = installPlatform(env);
  if (platform) return { kind: 'ios', platform };
  return canPrompt ? { kind: 'prompt' } : null;
}

export function browserInstallEnv(): InstallEnv {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
  };
}

// The pre-rebrand key: renaming it would bring the tip back for everyone.
export const DISMISS_KEY = 'fretwork.installHint.dismissed';

// A per-device convenience: if storage is unavailable the tip just reappears.
export function isInstallTipDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstallTip(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Ignore: private mode or blocked storage.
  }
}

/**
 * Whether this browser already holds progress, which a Home Screen app on
 * iOS won't see (it has its own storage) until it's exported and imported.
 */
export async function hasLocalProgress(db: FretworkDB): Promise<boolean> {
  return (await db.reviewLogs.count()) > 0 || (await db.cards.count()) > 0;
}

/** Chromium's `beforeinstallprompt` event. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function setDeferred(e: InstallPromptEvent | null): void {
  deferred = e;
  for (const l of listeners) l();
}

/** The held install prompt, if the browser offered one. */
export function getInstallPrompt(): InstallPromptEvent | null {
  return deferred;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Hold `beforeinstallprompt` (Chromium desktop, Android) so the tip can offer
 * an Install button, and drop it once the app is installed. Returns a cleanup.
 */
export function captureInstallPrompt(target: Window): () => void {
  const onPrompt = (e: Event) => {
    // Our own button replaces the browser's mini-infobar.
    e.preventDefault();
    setDeferred(e as InstallPromptEvent);
  };
  const onInstalled = () => setDeferred(null);
  target.addEventListener('beforeinstallprompt', onPrompt);
  target.addEventListener('appinstalled', onInstalled);
  return () => {
    target.removeEventListener('beforeinstallprompt', onPrompt);
    target.removeEventListener('appinstalled', onInstalled);
  };
}

/** Show the held prompt. A prompt can be used once, so it's dropped either way. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  const e = deferred;
  if (!e) return null;
  setDeferred(null);
  await e.prompt();
  return (await e.userChoice).outcome;
}
