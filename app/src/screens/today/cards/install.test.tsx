import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getDb } from '../../../storage';
import {
  DISMISS_KEY,
  getInstallPrompt,
  promptInstall,
  type InstallEnv,
} from '../../../shell/install';
import { Card } from './install';

const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const env = (userAgent: string, over: Partial<InstallEnv> = {}): InstallEnv => ({
  userAgent,
  maxTouchPoints: 5,
  standalone: false,
  displayStandalone: false,
  ...over,
});

const card = () => screen.findByRole('region', { name: 'Install FretFree' });

beforeEach(async () => {
  await getDb().cards.clear();
  await getDb().reviewLogs.clear();
});

afterEach(async () => {
  localStorage.clear();
  if (getInstallPrompt()) await act(() => promptInstall());
});

describe('Today install card', () => {
  it('gives iPad Safari the Share → Add to Home Screen tip', async () => {
    render(<Card env={env(IPAD_SAFARI)} />);
    const tip = await card();
    expect(tip).toHaveAttribute('data-platform', 'ipad');
    expect(tip).toHaveTextContent('Tap Share at the top right. Then choose Add to Home Screen.');
    expect(tip).toHaveTextContent('works offline');
    expect(tip).toHaveTextContent('open FretFree from your Home Screen and practise there');
  });

  it('points iPhone users to the bottom toolbar', async () => {
    render(<Card env={env(IPHONE_SAFARI)} />);
    expect(await card()).toHaveTextContent('Tap Share at the bottom of the screen');
  });

  it('offers an export when this browser holds progress', async () => {
    await getDb().reviewLogs.add({ itemId: 'F1.alphabet:A' } as never);
    render(<Card env={env(IPAD_SAFARI)} />);
    await card();
    expect(screen.getByRole('button', { name: 'Export my progress' })).toBeVisible();
    expect(screen.getByTestId('install-storage')).toHaveTextContent('won’t carry over');
  });

  it('never shows in standalone mode', async () => {
    const { container } = render(<Card env={env(IPAD_SAFARI, { standalone: true })} />);
    await act(() => Promise.resolve());
    expect(container).toBeEmptyDOMElement();
  });

  it('stays dismissed on this device', async () => {
    const { unmount } = render(<Card env={env(IPAD_SAFARI)} />);
    await card();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'Install FretFree' })).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1');
    unmount();
    const { container } = render(<Card env={env(IPAD_SAFARI)} />);
    await act(() => Promise.resolve());
    expect(container).toBeEmptyDOMElement();
  });

  it('offers an Install button where Chromium has a prompt', async () => {
    render(<Card env={env(DESKTOP_CHROME)} />);
    await act(() => Promise.resolve());
    expect(screen.queryByRole('region', { name: 'Install FretFree' })).toBeNull();

    const e = new Event('beforeinstallprompt', { cancelable: true });
    const prompt = vi.fn(() => Promise.resolve());
    Object.assign(e, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    act(() => {
      window.dispatchEvent(e);
    });
    const tip = await card();
    expect(tip).toHaveAttribute('data-offer', 'prompt');
    await userEvent.click(screen.getByRole('button', { name: 'Install FretFree' }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('Installed.');
  });
});
