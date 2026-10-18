import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS } from '../../engine/model';
import { getDb, getGamification, getSettings, saveGamification } from '../../storage';
import * as dailyGoal from './daily-goal';
import * as goal from './goal';
import * as handAndTuning from './hand-and-tuning';
import * as notation from './notation';
import * as sessionLength from './session-length';

beforeEach(async () => {
  await getDb().settings.clear();
  await getDb().gamification.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
});

function renderStep(Step: typeof goal.Step) {
  const onNext = vi.fn();
  render(<Step onNext={onNext} />);
  return onNext;
}

async function submit(onNext: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(onNext).toHaveBeenCalledOnce());
}

describe('onboarding steps', () => {
  it('saves handedness and tuning to settings', async () => {
    const onNext = renderStep(handAndTuning.Step);
    expect(screen.getByRole('radio', { name: /Right-handed/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Standard/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Left-handed/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Drop D/ }));
    await submit(onNext);
    const settings = await getSettings(getDb());
    expect([settings.handedness, settings.tuning]).toEqual(['left', 'drop-d']);
    expect(useAppStore.getState().settings.handedness).toBe('left');
  });

  it('saves the goal to settings', async () => {
    const onNext = renderStep(goal.Step);
    for (const name of [/Play songs/, /Solo and improvise/, /Jazz/, /Understand everything/])
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Solo and improvise/ }));
    await submit(onNext);
    expect((await getSettings(getDb())).goal).toBe('improvise');
  });

  it('offers Casual 5 / Regular 10 / Serious 15 / Intense 20 and saves the daily goal to gamification', async () => {
    await saveGamification(getDb(), { dailyGoalMinutes: 15 });
    const onNext = renderStep(dailyGoal.Step);
    expect(await screen.findByRole('radio', { name: /Serious/ })).toBeChecked();
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Casual5 minutes a day',
      'Regular10 minutes a day',
      'Serious15 minutes a day',
      'Intense20 minutes a day',
    ]);
    fireEvent.click(screen.getByRole('radio', { name: /Intense/ }));
    await submit(onNext);
    expect((await getGamification(getDb())).dailyGoalMinutes).toBe(20);
  });

  it('saves the notation preference to settings', async () => {
    const onNext = renderStep(notation.Step);
    expect(screen.getByRole('radio', { name: /No notation/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Standard notation/ }));
    await submit(onNext);
    expect((await getSettings(getDb())).notation).toBe('staff');
  });

  it('saves the session length to settings', async () => {
    const onNext = renderStep(sessionLength.Step);
    expect(screen.getByRole('radio', { name: /10 minutes/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^5 minutes/ }));
    await submit(onNext);
    expect((await getSettings(getDb())).sessionMinutes).toBe(5);
  });
});
