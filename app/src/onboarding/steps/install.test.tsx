import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS } from '../../engine/model';
import { getDb } from '../../storage';
import { dismissInstallTip, type InstallEnv } from '../../shell/install';
import { OnboardingFlow } from '../OnboardingFlow';
import { ONBOARDING_STEPS, type OnboardingStep } from '../registry';
import * as install from './install';

const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const env = (userAgent: string, over: Partial<InstallEnv> = {}): InstallEnv => ({
  userAgent,
  maxTouchPoints: 5,
  standalone: false,
  displayStandalone: false,
  ...over,
});

beforeEach(async () => {
  await getDb().cards.clear();
  await getDb().reviewLogs.clear();
  await getDb().settings.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
});

afterEach(() => localStorage.clear());

describe('install step', () => {
  it('comes first in onboarding', () => {
    expect(ONBOARDING_STEPS[0]?.id).toBe('install');
    expect(install.title).toBe('Install FretFree');
  });

  it('explains why: full screen, offline, one tap, progress kept safe', () => {
    render(<>{install.explanation}</>);
    const reasons = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(reasons).toHaveLength(4);
    expect(reasons.join(' ')).toMatch(/full screen.*offline.*One tap.*progress is kept safe/s);
  });

  it('applies only where the app can be installed, not standalone, and not dismissed', () => {
    expect(install.available(env(IPAD_SAFARI))).toBe(true);
    expect(install.available(env(IPAD_SAFARI, { standalone: true }))).toBe(false);
    expect(install.available(env(IPAD_SAFARI, { displayStandalone: true }))).toBe(false);
    // jsdom is no iOS browser and has no install prompt.
    expect(install.available()).toBe(false);
    dismissInstallTip();
    expect(install.available(env(IPAD_SAFARI))).toBe(false);
  });

  it('shows the iPad Safari steps and says to finish setup in the installed app', async () => {
    const onNext = vi.fn();
    render(<install.InstallStep onNext={onNext} env={env(IPAD_SAFARI)} />);
    expect(screen.getByTestId('install-steps')).toHaveTextContent('Tap Share at the top right.');
    expect(screen.getByTestId('install-steps')).toHaveTextContent('Add to Home Screen');
    expect(await screen.findByTestId('install-storage')).toHaveTextContent(
      'open FretFree from your Home Screen and finish setup there',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue in the browser' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('points iPhone users to the bottom toolbar', () => {
    render(<install.InstallStep onNext={() => {}} env={env(IPHONE_SAFARI)} />);
    expect(screen.getByTestId('install-steps')).toHaveTextContent(
      'Tap Share at the bottom of the screen',
    );
  });

  it('warns that existing progress won’t carry over, and offers an export', async () => {
    await getDb().cards.put({ itemId: 'F1.alphabet:A' } as never);
    render(<install.InstallStep onNext={() => {}} env={env(IPAD_SAFARI)} />);
    expect(await screen.findByRole('button', { name: 'Export my progress' })).toBeVisible();
    expect(screen.getByTestId('install-storage')).toHaveTextContent(
      'Your progress in Safari won’t carry over by itself',
    );
  });

  it('never gates setup: with nothing to install it is just a way on', () => {
    const onNext = vi.fn();
    render(<install.Step onNext={onNext} />);
    expect(screen.queryByTestId('install-steps')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue in the browser' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe('<OnboardingFlow> with steps that do not apply', () => {
  const step = (id: string, available?: () => boolean): OnboardingStep => ({
    id,
    order: 1,
    title: `Title ${id}`,
    explanation: <p>Why {id}</p>,
    skippable: true,
    available,
    Step: ({ onNext }) => (
      <button type="button" onClick={onNext}>
        Choose {id}
      </button>
    ),
  });

  it('leaves them out of the flow and the count', () => {
    render(
      <OnboardingFlow
        steps={[step('install', () => false), step('goal'), step('daily', () => true)]}
        onDone={() => {}}
      />,
    );
    expect(screen.getByText(/2 quick questions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Title goal' })).toBeVisible();
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('Step 1 of 2');
  });
});
