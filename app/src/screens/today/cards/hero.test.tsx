import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { toLocalDate } from '../../../engine/gamification/local-date';
import { emptyDailyProgress } from '../../../engine/gamification/daily';
import { getDb, saveDailyProgress, saveGamification } from '../../../storage';
import { Card } from './hero';

function renderHero() {
  return render(
    <MemoryRouter>
      <Card />
    </MemoryRouter>,
  );
}

describe('Today hero', () => {
  it('shows the streak, the goal ring, freezes and the start button', async () => {
    await saveGamification(getDb(), { streakCurrent: 12, freezesHeld: 2, dailyGoalMinutes: 15 });
    await saveDailyProgress(getDb(), {
      ...emptyDailyProgress(toLocalDate(new Date())),
      minutes: 6,
    });
    renderHero();
    expect(await screen.findByRole('img', { name: 'Daily goal: 6 of 15 minutes' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Streak and daily goal' })).toBeInTheDocument();
    expect(screen.getByTestId('streak')).toHaveTextContent('12day streak');
    expect(screen.getByTestId('goal-copy')).toHaveTextContent(
      "9 min to go for today's 15-minute goal",
    );
    expect(screen.getByTestId('freezes')).toHaveTextContent('❄️❄️2 streak freezes held');
    expect(screen.getByTestId('start-session')).toHaveAttribute('href', '/session');
  });

  it('says come back tomorrow once the goal is met, not "do more"', async () => {
    await saveGamification(getDb(), { streakCurrent: 1, freezesHeld: 0, dailyGoalMinutes: 5 });
    await saveDailyProgress(getDb(), {
      ...emptyDailyProgress(toLocalDate(new Date())),
      minutes: 5,
      goalMet: true,
    });
    renderHero();
    expect(
      await screen.findByRole('img', { name: 'Daily goal met: 5 of 5 minutes' }),
    ).toBeVisible();
    expect(screen.getByTestId('goal-copy')).toHaveTextContent(/come back tomorrow/i);
    expect(screen.getByTestId('freezes')).toHaveTextContent('No streak freezes held');
  });
});
