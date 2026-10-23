import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS } from '../../engine/model';
import { getDb, getSettings } from '../../storage';
import { ONBOARDING_STEPS } from '../registry';
import * as startWithSound from './start-with-sound';

beforeEach(async () => {
  await getDb().settings.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
});

async function choose(name: RegExp) {
  const onNext = vi.fn();
  render(<startWithSound.Step onNext={onNext} />);
  fireEvent.click(screen.getByRole('radio', { name }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(onNext).toHaveBeenCalledOnce());
}

describe('"Start with sound" onboarding step', () => {
  it('comes after the reading question and is skippable', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids.indexOf('start-with-sound')).toBe(ids.indexOf('notation') + 1);
    expect(startWithSound.skippable).toBe(true);
  });

  it('starts with the neck by default', () => {
    render(<startWithSound.Step onNext={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Start with' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^The neck/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Sound/ })).not.toBeChecked();
  });

  it('saves "start with sound" to settings', async () => {
    await choose(/^Sound/);
    expect((await getSettings(getDb())).startWithSound).toBe(true);
    expect(useAppStore.getState().settings.startWithSound).toBe(true);
  });

  it('shows the saved choice, and can switch back to the neck', async () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, startWithSound: true } });
    await choose(/^The neck/);
    expect((await getSettings(getDb())).startWithSound).toBe(false);
  });
});
