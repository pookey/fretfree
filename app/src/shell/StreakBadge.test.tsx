import { describe, expect, it } from 'vitest';
import { act, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { getDb, saveGamification } from '../storage';
import { StreakBadge } from './StreakBadge';

// The guitar above the badge links to the Garage, so it needs a router.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

describe('<StreakBadge>', () => {
  it('shows the streak, ring and freezes in the full sidebar', async () => {
    await saveGamification(getDb(), { streakCurrent: 4, freezesHeld: 1, xpTotal: 1240 });
    render(<StreakBadge variant="full" />);
    const badge = await screen.findByRole('group', {
      name: '4-day streak. Daily goal: 0 of 10 minutes. 1 streak freeze held. 1,240 XP earned',
    });
    expect(badge).toHaveAttribute('data-variant', 'full');
    expect(screen.getByTestId('sidebar-streak-count')).toHaveTextContent('4');
    expect(screen.getByRole('img', { name: 'Daily goal: 0 of 10 minutes' })).toBeInTheDocument();
    expect(badge).toHaveTextContent('0/10 min today');
    expect(badge).toHaveTextContent('❄️ 1');
    expect(screen.getByTestId('sidebar-xp')).toHaveTextContent('1,240 XP earned');
  });

  it('is compact in the icon sidebar', async () => {
    await saveGamification(getDb(), { xpTotal: 1240 });
    render(<StreakBadge variant="icon" />);
    const badge = await screen.findByTestId('sidebar-streak');
    expect(badge).toHaveAttribute('data-variant', 'icon');
    expect(badge).not.toHaveTextContent('min today');
    expect(screen.getByRole('img', { name: /^Daily goal/ })).toBeInTheDocument();
    expect(await screen.findByTestId('sidebar-xp')).toHaveTextContent('1.2k XP');
  });

  it('keeps XP earned live as a session adds to it', async () => {
    await saveGamification(getDb(), { xpTotal: 1240 });
    render(<StreakBadge variant="full" />);
    expect(await screen.findByTestId('sidebar-xp')).toHaveTextContent('1,240 XP earned');
    await act(async () => {
      await saveGamification(getDb(), { xpTotal: 1300 });
    });
    await waitFor(() =>
      expect(screen.getByTestId('sidebar-xp')).toHaveTextContent('1,300 XP earned'),
    );
  });

  it('stacks the equipped guitar on the badge, linking to the Garage', async () => {
    render(<StreakBadge variant="icon" />);
    const badge = await screen.findByTestId('sidebar-streak');
    const guitar = await screen.findByRole('link', { name: 'Your guitar: My guitar' });
    expect(guitar).toHaveAttribute('data-variant', 'icon');
    expect(guitar.parentElement).toBe(badge.parentElement);
    expect(badge).not.toContainElement(guitar);
  });
});
