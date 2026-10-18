import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS } from '../../engine/model';
import { getDb, getGamification, getSettings, saveGamification } from '../../storage';
import { OnboardingFlow } from '../OnboardingFlow';
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

  describe('reading music', () => {
    const reads = () => within(screen.getByRole('group', { name: 'What can you already read?' }));
    const learn = () =>
      within(screen.getByRole('group', { name: 'What would you like to learn to read?' }));

    it('asks what you read and what you want to learn, neither ticked by default', () => {
      renderStep(notation.Step);
      for (const group of [reads(), learn()]) {
        expect(group.getAllByRole('checkbox')).toHaveLength(2);
        expect(group.getByRole('checkbox', { name: /^Tab/ })).not.toBeChecked();
        expect(group.getByRole('checkbox', { name: /Standard notation/ })).not.toBeChecked();
      }
      expect(screen.queryByRole('radio')).toBeNull();
    });

    it('says the neck is taught either way and reading is extra', () => {
      render(notation.explanation);
      expect(
        screen.getByText(/teaches the neck by name, position and sound either way/),
      ).toBeVisible();
      expect(screen.getByText(/is extra/)).toBeVisible();
    });

    it('saves several picks in each question', async () => {
      const onNext = renderStep(notation.Step);
      fireEvent.click(reads().getByRole('checkbox', { name: /^Tab/ }));
      fireEvent.click(learn().getByRole('checkbox', { name: /^Tab/ }));
      fireEvent.click(learn().getByRole('checkbox', { name: /Standard notation/ }));
      expect(learn().getByRole('checkbox', { name: /^Tab/ })).toBeChecked();
      expect(learn().getByRole('checkbox', { name: /Standard notation/ })).toBeChecked();
      await submit(onNext);
      expect((await getSettings(getDb())).reading).toEqual({
        reads: { tab: true, staff: false },
        learn: { tab: true, staff: true },
      });
      expect(useAppStore.getState().settings.reading.learn.staff).toBe(true);
    });

    it('saves both notations as already read', async () => {
      const onNext = renderStep(notation.Step);
      fireEvent.click(reads().getByRole('checkbox', { name: /^Tab/ }));
      fireEvent.click(reads().getByRole('checkbox', { name: /Standard notation/ }));
      await submit(onNext);
      expect((await getSettings(getDb())).reading).toEqual({
        reads: { tab: true, staff: true },
        learn: { tab: false, staff: false },
      });
    });

    it('saves neither, and a second tap unticks', async () => {
      useAppStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          reading: { reads: { tab: true, staff: false }, learn: { tab: false, staff: false } },
        },
      });
      const onNext = renderStep(notation.Step);
      const tab = reads().getByRole('checkbox', { name: /^Tab/ });
      expect(tab).toBeChecked();
      fireEvent.click(tab);
      expect(tab).not.toBeChecked();
      await submit(onNext);
      expect((await getSettings(getDb())).reading).toEqual(DEFAULT_SETTINGS.reading);
    });

    it('can be skipped, keeping what was stored', async () => {
      const onDone = vi.fn();
      render(<OnboardingFlow steps={[notation]} onDone={onDone} now={() => new Date(0)} />);
      fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
      fireEvent.click(learn().getByRole('checkbox', { name: /Standard notation/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Skip this step' }));
      await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
      expect((await getSettings(getDb())).reading).toEqual(DEFAULT_SETTINGS.reading);
    });

    it('starts from a legacy notation choice', async () => {
      // A row saved before M1-26: `notation` and no `reading`.
      const { reading: _reading, ...legacy } = DEFAULT_SETTINGS;
      await getDb().settings.put({ ...legacy, key: 'singleton', notation: 'staff' } as never);
      useAppStore.setState({ settings: await getSettings(getDb()) });
      renderStep(notation.Step);
      expect(reads().getByRole('checkbox', { name: /Standard notation/ })).toBeChecked();
      expect(reads().getByRole('checkbox', { name: /^Tab/ })).not.toBeChecked();
    });
  });

  it('saves the session length to settings', async () => {
    const onNext = renderStep(sessionLength.Step);
    expect(screen.getByRole('radio', { name: /10 minutes/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^5 minutes/ }));
    await submit(onNext);
    expect((await getSettings(getDb())).sessionMinutes).toBe(5);
  });
});
