import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getDb, saveGamification } from '../storage';
import { StreakBadge } from './StreakBadge';

describe('<StreakBadge>', () => {
  it('shows the streak, ring and freezes in the full sidebar', async () => {
    await saveGamification(getDb(), { streakCurrent: 4, freezesHeld: 1 });
    render(<StreakBadge variant="full" />);
    const badge = await screen.findByRole('group', {
      name: '4-day streak. Daily goal: 0 of 10 minutes. 1 streak freeze held',
    });
    expect(badge).toHaveAttribute('data-variant', 'full');
    expect(screen.getByTestId('sidebar-streak-count')).toHaveTextContent('4');
    expect(screen.getByRole('img', { name: 'Daily goal: 0 of 10 minutes' })).toBeInTheDocument();
    expect(badge).toHaveTextContent('0/10 min today');
    expect(badge).toHaveTextContent('❄️ 1');
  });

  it('is compact in the icon sidebar', async () => {
    render(<StreakBadge variant="icon" />);
    const badge = await screen.findByTestId('sidebar-streak');
    expect(badge).toHaveAttribute('data-variant', 'icon');
    expect(badge).not.toHaveTextContent('min today');
    expect(screen.getByRole('img', { name: /^Daily goal/ })).toBeInTheDocument();
  });
});
