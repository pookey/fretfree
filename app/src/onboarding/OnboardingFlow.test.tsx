import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAppStore } from '../app-store';
import { DEFAULT_SETTINGS } from '../engine/model';
import { getDb, getSettings } from '../storage';
import { OnboardingFlow } from './OnboardingFlow';
import type { OnboardingStep } from './registry';

const NOW = new Date('2026-10-18T09:00:00Z');

const step = (id: string, order: number): OnboardingStep => ({
  id,
  order,
  title: `Title ${id}`,
  explanation: <p>Why {id}</p>,
  skippable: true,
  Step: ({ onNext }) => (
    <button type="button" onClick={onNext}>
      Choose {id}
    </button>
  ),
});

const STEPS = [step('one', 1), step('two', 2)];

function renderFlow(steps = STEPS) {
  const onDone = vi.fn();
  render(<OnboardingFlow steps={steps} onDone={onDone} now={() => NOW} />);
  return onDone;
}

async function expectOnboarded(onDone: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect((await getSettings(getDb())).onboardedAt).toEqual(NOW);
}

beforeEach(async () => {
  await getDb().settings.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
});

describe('<OnboardingFlow>', () => {
  it('opens with the About copy: adapts to what you know, not a learning style', () => {
    renderFlow();
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Fretwork' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'About Fretwork' })).toHaveTextContent(
      /adapts to what you know and what you want, not to a .learning style./,
    );
    expect(screen.getByText(/2 quick questions/)).toBeInTheDocument();
  });

  it('walks through every step, then marks onboarding done', async () => {
    const onDone = renderFlow();
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Title one' })).toHaveFocus();
    expect(screen.getByText('Why one')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('Step 1 of 2');
    expect(screen.getByRole('region', { name: 'Title one' })).toContainElement(
      screen.getByRole('button', { name: 'Choose one' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose one' }));
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('Step 2 of 2');
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose two' }));
    await expectOnboarded(onDone);
  });

  it('skips single steps and goes back', async () => {
    const onDone = renderFlow();
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip this step' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Title two' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Title one' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Fretwork' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip this step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip this step' }));
    await expectOnboarded(onDone);
  });

  it('skips the whole flow from any screen', async () => {
    const onDone = renderFlow();
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    await expectOnboarded(onDone);
  });

  it('finishes straight away when no steps are registered', async () => {
    const onDone = renderFlow([]);
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    await expectOnboarded(onDone);
  });
});
