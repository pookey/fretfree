import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as download from '../storage/download-export';
import { getInstallPrompt, promptInstall, type InstallEnv } from './install';
import {
  InstallSteps,
  PromptInstall,
  StorageNote,
  useHasProgress,
  useInstallOffer,
} from './InstallHint';
import { getDb } from '../storage';

const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const env = (userAgent: string, over: Partial<InstallEnv> = {}): InstallEnv => ({
  userAgent,
  maxTouchPoints: 5,
  standalone: false,
  displayStandalone: false,
  ...over,
});

/** Fire Chromium's install prompt at the window, where InstallHint listens. */
function firePrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(e, { prompt, userChoice: Promise.resolve({ outcome }) });
  act(() => {
    window.dispatchEvent(e);
  });
  return prompt;
}

afterEach(async () => {
  // Use up any held prompt so tests don't leak it.
  if (getInstallPrompt()) await act(() => promptInstall());
  vi.restoreAllMocks();
});

describe('<InstallSteps>', () => {
  const steps = () => screen.getAllByRole('listitem').map((li) => li.textContent);

  it('shows Safari on iPad its Share button at the top right', () => {
    render(<InstallSteps platform={{ device: 'ipad', browser: 'safari' }} />);
    expect(steps()).toEqual([
      'Tap Share at the top right.',
      'Choose Add to Home Screen. You may need to scroll down the list.',
      'Leave Open as Web App on if you see it, then tap Add.',
    ]);
  });

  it('points Safari on iPhone to the bottom toolbar', () => {
    render(<InstallSteps platform={{ device: 'iphone', browser: 'safari' }} />);
    expect(steps()[0]).toMatch(/^Tap Share at the bottom of the screen/);
  });

  it('matches iOS Chrome and Edge', () => {
    const { unmount } = render(<InstallSteps platform={{ device: 'ipad', browser: 'chrome' }} />);
    expect(steps()[0]).toBe('Tap Share at the right of the address bar.');
    unmount();
    render(<InstallSteps platform={{ device: 'iphone', browser: 'edge' }} />);
    expect(steps()[0]).toBe('Tap the ⋯ menu, then Share.');
  });
});

describe('<StorageNote>', () => {
  it('says to install first and finish setup in the installed app', () => {
    render(<StorageNote browser="safari" hasProgress={false} during="setup" />);
    expect(screen.getByTestId('install-storage')).toHaveTextContent(
      'The Home Screen app keeps its own progress, separate from Safari. So add it now, then open FretFree from your Home Screen and finish setup there.',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers an export when this browser already holds progress', async () => {
    const save = vi.spyOn(download, 'downloadExport').mockResolvedValue('fretfree-2026-10-18.json');
    render(<StorageNote browser="chrome" hasProgress during="practice" />);
    expect(screen.getByTestId('install-storage')).toHaveTextContent(
      'Your progress in Chrome won’t carry over by itself',
    );
    expect(screen.getByTestId('install-storage')).toHaveTextContent(
      'Progress → Your data → Import data',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export my progress' }));
    expect(save).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('Saved fretfree-2026-10-18.json.');
  });
});

describe('<PromptInstall>', () => {
  it('shows the browser prompt, then says where the app went', async () => {
    const prompt = firePrompt('accepted');
    render(<PromptInstall />);
    await userEvent.click(screen.getByRole('button', { name: 'Install FretFree' }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('Installed.');
    expect(screen.queryByRole('button', { name: 'Install FretFree' })).toBeNull();
  });

  it('keeps the button when the learner declines', async () => {
    firePrompt('dismissed');
    render(<PromptInstall />);
    await userEvent.click(screen.getByRole('button', { name: 'Install FretFree' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Install FretFree' })).toBeVisible();
  });
});

describe('useInstallOffer', () => {
  it('reads the given environment', () => {
    const { result } = renderHook(() => useInstallOffer(env(IPAD_SAFARI)));
    expect(result.current).toEqual({
      kind: 'ios',
      platform: { device: 'ipad', browser: 'safari' },
    });
  });

  it('offers an Install button once Chromium fires its prompt, and keeps it after use', async () => {
    const { result } = renderHook(() => useInstallOffer(env(DESKTOP_CHROME)));
    expect(result.current).toBeNull();
    firePrompt();
    expect(result.current).toEqual({ kind: 'prompt' });
    await act(() => promptInstall());
    expect(result.current).toEqual({ kind: 'prompt' });
  });

  it('reads the real browser when no env is given', () => {
    // jsdom is neither iOS nor offering a prompt.
    const { result } = renderHook(() => useInstallOffer());
    expect(result.current).toBeNull();
  });
});

describe('useHasProgress', () => {
  beforeEach(() => getDb().cards.clear());

  it('checks the database', async () => {
    const { result } = renderHook(() => useHasProgress());
    expect(result.current).toBeNull();
    await vi.waitFor(() => expect(result.current).toBe(false));
  });

  it('treats a failed check as no progress', async () => {
    vi.spyOn(getDb().reviewLogs, 'count').mockRejectedValue(new Error('closed'));
    const { result } = renderHook(() => useHasProgress());
    await vi.waitFor(() => expect(result.current).toBe(false));
  });
});
