import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS } from '../../engine/model';
import { getDb, getGamification, getSettings, saveGamification } from '../../storage';
import { SettingsGroups } from './SettingsGroups';

const audio = vi.hoisted(() => ({
  unlockAudio: vi.fn(() => Promise.resolve()),
  playNotes: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../audio/audio', () => audio);

const db = getDb();

function renderPanel() {
  return render(
    <MemoryRouter>
      <SettingsGroups />
    </MemoryRouter>,
  );
}

const group = (name: string) => screen.getByRole('group', { name });

beforeEach(() => {
  audio.unlockAudio.mockClear();
  audio.playNotes.mockClear();
});

afterEach(async () => {
  await Promise.all([db.settings.clear(), db.gamification.clear()]);
  useAppStore.setState({ settings: DEFAULT_SETTINGS });
});

describe('<SettingsGroups>', () => {
  it('groups the settings into titled cards', () => {
    renderPanel();
    for (const name of ['Your guitar', 'Practice', 'Sound', 'Reading music', 'Guides and timing'])
      expect(group(name)).toBeInTheDocument();
  });

  it('saves handedness, tuning and the accidental preference', async () => {
    renderPanel();
    const guitar = within(group('Your guitar'));
    await userEvent.selectOptions(guitar.getByRole('combobox', { name: 'Handedness' }), 'left');
    await userEvent.selectOptions(guitar.getByRole('combobox', { name: 'Tuning' }), 'drop-d');
    await userEvent.selectOptions(guitar.getByRole('combobox', { name: 'Note names' }), 'flat');
    await waitFor(async () =>
      expect(await getSettings(db)).toMatchObject({
        handedness: 'left',
        tuning: 'drop-d',
        accidentalPref: 'flat',
      }),
    );
    expect(guitar.getByRole('combobox', { name: 'Tuning' })).toHaveValue('drop-d');
  });

  it('saves the session length to settings and the daily goal and amulet to gamification', async () => {
    renderPanel();
    const practice = within(group('Practice'));
    await userEvent.selectOptions(practice.getByRole('combobox', { name: 'Session length' }), '5');
    const goal = await practice.findByRole('combobox', { name: 'Daily goal' });
    expect(goal).toHaveValue('10');
    expect(within(goal).getByRole('option', { name: 'Intense: 20 minutes a day' })).toBeVisible();
    await userEvent.selectOptions(goal, '20');
    const amulet = practice.getByRole('checkbox', { name: 'Weekend amulet' });
    expect(amulet).toHaveAccessibleDescription(/Saturdays and Sundays/);
    await userEvent.click(amulet);

    await waitFor(() => expect(amulet).toBeChecked());
    expect(goal).toHaveValue('20');
    expect((await getSettings(db)).sessionMinutes).toBe(5);
    expect(await getGamification(db)).toMatchObject({ dailyGoalMinutes: 20, weekendAmulet: true });
  });

  it('shows a daily goal changed elsewhere', async () => {
    renderPanel();
    const goal = await within(group('Practice')).findByRole('combobox', { name: 'Daily goal' });
    await saveGamification(db, { dailyGoalMinutes: 15 });
    await waitFor(() => expect(goal).toHaveValue('15'));
  });

  it('turns sound off, sets the volume and plays a test note at it', async () => {
    renderPanel();
    const sound = within(group('Sound'));
    const volume = sound.getByRole('slider', { name: 'Volume' });
    expect(volume).toHaveValue('80');
    expect(volume).toHaveAttribute('aria-valuetext', '80%');

    fireEvent.change(volume, { target: { value: '35' } });
    await waitFor(() => expect(volume).toHaveValue('35'));
    expect((await getSettings(db)).volume).toBeCloseTo(0.35);

    await userEvent.click(sound.getByRole('button', { name: 'Play a test note' }));
    await waitFor(() =>
      expect(audio.playNotes).toHaveBeenCalledWith(['A3'], { volume: 0.35, muted: false }),
    );
    expect(audio.unlockAudio).toHaveBeenCalled();

    await userEvent.click(sound.getByRole('checkbox', { name: 'Sound' }));
    await waitFor(() => expect(volume).toBeDisabled());
    expect(sound.getByRole('button', { name: 'Play a test note' })).toBeDisabled();
    expect((await getSettings(db)).soundOn).toBe(false);
  });

  it('keeps settings working when audio is unavailable', async () => {
    audio.unlockAudio.mockRejectedValueOnce(new Error('no audio'));
    renderPanel();
    await userEvent.click(within(group('Sound')).getByRole('button', { name: 'Play a test note' }));
    await waitFor(() => expect(audio.unlockAudio).toHaveBeenCalled());
    expect(audio.playNotes).not.toHaveBeenCalled();
  });

  it('edits what the learner reads and wants to learn, as two multi-selects', async () => {
    renderPanel();
    const reading = within(group('Reading music'));
    const reads = within(reading.getByRole('group', { name: 'What can you already read?' }));
    const learn = within(
      reading.getByRole('group', { name: 'What would you like to learn to read?' }),
    );
    await userEvent.click(reads.getByRole('checkbox', { name: /Tab/ }));
    await waitFor(() => expect(reads.getByRole('checkbox', { name: /Tab/ })).toBeChecked());
    await userEvent.click(learn.getByRole('checkbox', { name: /Standard notation/ }));
    await waitFor(() =>
      expect(learn.getByRole('checkbox', { name: /Standard notation/ })).toBeChecked(),
    );
    expect((await getSettings(db)).reading).toEqual({
      reads: { tab: true, staff: false },
      learn: { tab: false, staff: true },
    });
  });

  it('turns blind mode on and off, and saves it', async () => {
    renderPanel();
    const blind = screen.getByRole('checkbox', { name: 'Blind mode' });
    expect(blind).not.toBeChecked();
    expect(blind).toHaveAccessibleDescription(/hide the fret inlays/);

    await userEvent.click(blind);
    await waitFor(() => expect(blind).toBeChecked());
    expect((await getSettings(db)).blindMode).toBe(true);

    await userEvent.click(blind);
    await waitFor(() => expect(blind).not.toBeChecked());
    expect((await getSettings(db)).blindMode).toBe(false);
  });

  it('offers a calibration re-run', () => {
    renderPanel();
    expect(
      within(group('Guides and timing')).getByRole('button', { name: 'Measure' }),
    ).toBeInTheDocument();
  });
});
