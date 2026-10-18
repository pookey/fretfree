import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DISMISS_KEY, InstallHint, installPlatform, type InstallEnv } from './InstallHint';

const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// iPadOS 13+ Safari asks for the desktop site by default.
const IPADOS_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_CHROME =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const env = (userAgent: string, over: Partial<InstallEnv> = {}): InstallEnv => ({
  userAgent,
  maxTouchPoints: 5,
  standalone: false,
  displayStandalone: false,
  ...over,
});

describe('installPlatform', () => {
  it('targets Safari on iPad, including the desktop-class user agent', () => {
    expect(installPlatform(env(IPAD_SAFARI))).toBe('ipad');
    expect(installPlatform(env(IPADOS_DESKTOP))).toBe('ipad');
  });

  it('targets Safari on iPhone, best effort', () => {
    expect(installPlatform(env(IPHONE_SAFARI))).toBe('iphone');
  });

  it('skips the app once it runs from the home screen', () => {
    expect(installPlatform(env(IPAD_SAFARI, { standalone: true }))).toBeNull();
    expect(installPlatform(env(IPAD_SAFARI, { displayStandalone: true }))).toBeNull();
    expect(installPlatform(env(IPHONE_SAFARI, { standalone: true }))).toBeNull();
  });

  it('skips other browsers and a desktop Mac', () => {
    expect(installPlatform(env(IPAD_CHROME))).toBeNull();
    expect(installPlatform(env(DESKTOP_CHROME))).toBeNull();
    expect(installPlatform(env(IPADOS_DESKTOP, { maxTouchPoints: 0 }))).toBeNull();
  });
});

describe('<InstallHint>', () => {
  afterEach(() => localStorage.clear());

  it('tells an iPad Safari user how to add Fretwork to the home screen', () => {
    render(<InstallHint env={env(IPAD_SAFARI)} />);
    const hint = screen.getByRole('complementary', { name: 'Install Fretwork' });
    expect(hint).toHaveAttribute('data-platform', 'ipad');
    expect(hint).toHaveTextContent('Tap Share at the top right, then Add to Home Screen');
    expect(hint).toHaveTextContent('works offline');
  });

  it('points iPhone users to the bottom toolbar', () => {
    render(<InstallHint env={env(IPHONE_SAFARI)} />);
    expect(screen.getByRole('complementary', { name: 'Install Fretwork' })).toHaveTextContent(
      'Tap Share at the bottom of the screen',
    );
  });

  it('renders nothing in standalone mode', () => {
    const { container } = render(<InstallHint env={env(IPAD_SAFARI, { standalone: true })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays dismissed on this device', async () => {
    const { unmount } = render(<InstallHint env={env(IPAD_SAFARI)} />);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('complementary', { name: 'Install Fretwork' })).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1');
    unmount();
    render(<InstallHint env={env(IPAD_SAFARI)} />);
    expect(screen.queryByRole('complementary', { name: 'Install Fretwork' })).toBeNull();
  });

  it('reads the real browser when no env is given', () => {
    // jsdom is neither Safari nor iOS.
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });
});
