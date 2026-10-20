// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../storage';
import {
  DISMISS_KEY,
  captureInstallPrompt,
  dismissInstallTip,
  getInstallPrompt,
  hasLocalProgress,
  installOffer,
  installPlatform,
  iosVersion,
  isInstallTipDismissed,
  promptInstall,
  subscribeInstallPrompt,
  type InstallEnv,
} from './install';

const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// iPadOS 13+ Safari asks for the desktop site by default.
const IPADOS_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_CHROME =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME_OLD =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0 Mobile/15E148 Safari/604.1';
const IPHONE_EDGE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.0 Mobile/15E148 Safari/605.1.15';
const IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const env = (userAgent: string, over: Partial<InstallEnv> = {}): InstallEnv => ({
  userAgent,
  maxTouchPoints: 5,
  standalone: false,
  displayStandalone: false,
  ...over,
});

describe('installPlatform', () => {
  it('targets Safari on iPad, including the desktop-class (Mac) user agent', () => {
    expect(installPlatform(env(IPAD_SAFARI))).toEqual({ device: 'ipad', browser: 'safari' });
    expect(installPlatform(env(IPADOS_DESKTOP))).toEqual({ device: 'ipad', browser: 'safari' });
  });

  it('tells a real Mac (no multi-touch) from an iPad', () => {
    expect(installPlatform(env(IPADOS_DESKTOP, { maxTouchPoints: 0 }))).toBeNull();
    expect(installPlatform(env(IPADOS_DESKTOP, { maxTouchPoints: 1 }))).toBeNull();
  });

  it('targets Safari on iPhone, best effort', () => {
    expect(installPlatform(env(IPHONE_SAFARI))).toEqual({ device: 'iphone', browser: 'safari' });
  });

  it('targets Chrome and Edge on iOS 16.4 and later', () => {
    expect(installPlatform(env(IPAD_CHROME))).toEqual({ device: 'ipad', browser: 'chrome' });
    expect(installPlatform(env(IPHONE_EDGE))).toEqual({ device: 'iphone', browser: 'edge' });
    expect(installPlatform(env(IPHONE_CHROME_OLD))).toBeNull();
  });

  it('skips the app once it runs from the Home Screen', () => {
    expect(installPlatform(env(IPAD_SAFARI, { standalone: true }))).toBeNull();
    expect(installPlatform(env(IPAD_SAFARI, { displayStandalone: true }))).toBeNull();
    expect(installPlatform(env(IPHONE_SAFARI, { standalone: true }))).toBeNull();
    expect(installPlatform(env(IPAD_CHROME, { displayStandalone: true }))).toBeNull();
  });

  it('skips other browsers and non-iOS devices', () => {
    expect(installPlatform(env(IPHONE_FIREFOX))).toBeNull();
    expect(installPlatform(env(DESKTOP_CHROME))).toBeNull();
    expect(installPlatform(env(ANDROID_CHROME))).toBeNull();
    expect(installPlatform(env('Mozilla/5.0 (X11; Linux x86_64) Safari/537.36'))).toBeNull();
  });
});

describe('iosVersion', () => {
  it('reads the version from an iOS user agent', () => {
    expect(iosVersion(IPHONE_SAFARI)).toBe(17.5);
    expect(iosVersion(IPHONE_CHROME_OLD)).toBe(16.3);
    expect(iosVersion(DESKTOP_CHROME)).toBeNull();
  });
});

describe('installOffer', () => {
  it('offers the Home Screen steps on iOS', () => {
    expect(installOffer({ env: env(IPAD_SAFARI), canPrompt: false })).toEqual({
      kind: 'ios',
      platform: { device: 'ipad', browser: 'safari' },
    });
  });

  it('offers an Install button where the browser has a prompt', () => {
    expect(installOffer({ env: env(DESKTOP_CHROME), canPrompt: true })).toEqual({
      kind: 'prompt',
    });
    expect(installOffer({ env: env(DESKTOP_CHROME), canPrompt: false })).toBeNull();
  });

  it('offers nothing in standalone mode', () => {
    const standalone = env(IPAD_SAFARI, { standalone: true });
    expect(installOffer({ env: standalone, canPrompt: true })).toBeNull();
    expect(installOffer({ env: standalone, canPrompt: false })).toBeNull();
  });
});

describe('dismissal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('stays dismissed on this device, under the pre-rebrand key', () => {
    expect(isInstallTipDismissed()).toBe(false);
    dismissInstallTip();
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1');
    expect(DISMISS_KEY).toBe('fretwork.installHint.dismissed');
    expect(isInstallTipDismissed()).toBe(true);
  });

  it('shrugs off blocked storage: the tip just shows again', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => dismissInstallTip()).not.toThrow();
    expect(isInstallTipDismissed()).toBe(false);
  });
});

describe('hasLocalProgress', () => {
  beforeEach(async () => {
    await getDb().cards.clear();
    await getDb().reviewLogs.clear();
  });

  it('is false for a fresh browser and true once a card exists', async () => {
    expect(await hasLocalProgress(getDb())).toBe(false);
    await getDb().cards.put({ itemId: 'F1.alphabet:A' } as never);
    expect(await hasLocalProgress(getDb())).toBe(true);
  });
});

describe('the install prompt', () => {
  function fakePrompt(outcome: 'accepted' | 'dismissed') {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    const prompt = vi.fn(() => Promise.resolve());
    Object.assign(e, { prompt, userChoice: Promise.resolve({ outcome }) });
    return { e, prompt };
  }

  it('holds the prompt until the button uses it', async () => {
    const target = new EventTarget() as Window;
    const stop = captureInstallPrompt(target);
    const listener = vi.fn();
    const unsubscribe = subscribeInstallPrompt(listener);
    expect(await promptInstall()).toBeNull();

    const { e, prompt } = fakePrompt('accepted');
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(getInstallPrompt()).toBe(e);
    expect(listener).toHaveBeenCalledOnce();

    expect(await promptInstall()).toBe('accepted');
    expect(prompt).toHaveBeenCalledOnce();
    expect(getInstallPrompt()).toBeNull();
    unsubscribe();
    stop();
  });

  it('drops the prompt once the app is installed, and stops listening on cleanup', () => {
    const target = new EventTarget() as Window;
    const stop = captureInstallPrompt(target);
    target.dispatchEvent(fakePrompt('dismissed').e);
    expect(getInstallPrompt()).not.toBeNull();
    target.dispatchEvent(new Event('appinstalled'));
    expect(getInstallPrompt()).toBeNull();
    stop();
    target.dispatchEvent(fakePrompt('dismissed').e);
    expect(getInstallPrompt()).toBeNull();
  });
});
