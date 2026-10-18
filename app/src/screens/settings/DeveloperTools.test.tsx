import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS } from '../../engine';
import { getDb, putSkillState } from '../../storage';
import { LearnScreen } from '../learn/LearnScreen';
import { DevUnlockBadge, DeveloperTools } from './DeveloperTools';
import { SettingsGroups } from './SettingsGroups';

vi.mock('../../audio/audio', () => ({
  unlockAudio: vi.fn(() => Promise.resolve()),
  playNotes: vi.fn(() => Promise.resolve()),
}));

const KEY = 'fretwork.dev.unlockAll';
const db = getDb();
const toggle = () => screen.getByRole('checkbox', { name: 'Unlock every skill' });
const badge = () => screen.queryByText('Developer: all skills unlocked');

/** Everything the switch must never write. */
async function learnerData() {
  const [cards, reviewLogs, skillStates] = await Promise.all([
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.skillStates.toArray(),
  ]);
  return { cards, reviewLogs, skillStates };
}

beforeEach(() => {
  localStorage.clear();
  Object.assign(window, { innerWidth: 1194, innerHeight: 834 });
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

afterEach(async () => {
  localStorage.clear();
  await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.skillStates.clear()]);
});

describe('<DeveloperTools> (development builds)', () => {
  it('adds a Developer card to the settings', () => {
    render(
      <MemoryRouter>
        <SettingsGroups />
      </MemoryRouter>,
    );
    const card = screen.getByRole('group', { name: 'Developer' });
    expect(within(card).getByRole('checkbox', { name: 'Unlock every skill' })).not.toBeChecked();
    expect(within(card).getByText(/Development builds only/)).toBeInTheDocument();
  });

  it('shows the badge only while the switch is on, and remembers it on this device', () => {
    render(
      <>
        <DeveloperTools />
        <DevUnlockBadge />
      </>,
    );
    expect(badge()).toBeNull();
    fireEvent.click(toggle());
    expect(toggle()).toBeChecked();
    expect(badge()).toBeInTheDocument();
    expect(screen.getByTestId('dev-unlock-badge')).toHaveAttribute('role', 'status');
    expect(localStorage.getItem(KEY)).toBe('1');
    fireEvent.click(toggle());
    expect(badge()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('follows the switch turned on in another tab', () => {
    render(<DevUnlockBadge />);
    act(() => {
      localStorage.setItem(KEY, '1');
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    });
    expect(badge()).toBeInTheDocument();
  });

  it('unlocks Chords on the Learn map without writing, and restores it when off', async () => {
    await putSkillState(db, {
      skillId: 'C3.thirds',
      status: 'practising',
      guideLevel: 2,
      rollingAccuracy: 0.8,
    });
    render(
      <MemoryRouter initialEntries={['/learn?module=chords']}>
        <DeveloperTools />
        <LearnScreen />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector('[data-loaded="true"]')).not.toBeNull());
    const triads = () => screen.getByTestId('skill-C5.triads');
    const before = await learnerData();
    expect(before.skillStates).toHaveLength(1);
    expect(triads()).toHaveAttribute('data-status', 'locked');
    expect(within(triads()).queryByRole('link', { name: 'Practise this now' })).toBeNull();

    fireEvent.click(toggle());
    expect(triads()).toHaveAttribute('data-status', 'unlocked');
    expect(within(triads()).getByRole('link', { name: 'Practise this now' })).toHaveAttribute(
      'href',
      '/session?skill=C5.triads',
    );
    expect(screen.getByTestId('module-chords')).toHaveAttribute('data-state', 'open');

    fireEvent.click(toggle());
    expect(triads()).toHaveAttribute('data-status', 'locked');
    expect(screen.getByTestId('module-chords')).toHaveAttribute('data-state', 'locked');
    expect(await learnerData()).toEqual(before);
  });

  it('survives blocked storage', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      render(
        <>
          <DeveloperTools />
          <DevUnlockBadge />
        </>,
      );
      fireEvent.click(toggle());
      expect(toggle()).not.toBeChecked();
      expect(badge()).toBeNull();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
