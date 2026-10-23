import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createEmptyCard } from 'ts-fsrs';
import { useAppStore } from '../../../app-store';
import { DEFAULT_SETTINGS, type Settings } from '../../../engine';
import { toLocalDate } from '../../../engine/gamification/local-date';
import { emptyDailyProgress } from '../../../engine/gamification/daily';
import { getDb, saveDailyProgress, saveGamification } from '../../../storage';
import { Card } from './hero';

const EXPLAINER =
  'A freeze covers a missed day automatically; you earn one for every 7 days in a row and can hold 2.';

function renderHero() {
  return render(
    <MemoryRouter>
      <Card />
    </MemoryRouter>,
  );
}

function useSettings(patch: Partial<Settings>) {
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, ...patch } });
}

async function addCard() {
  const now = new Date();
  await getDb().cards.put({
    itemId: 'note@s6f5',
    skillId: 'F2.string6-naturals',
    fsrs: createEmptyCard(now),
    createdAt: now,
    lastReviewedAt: null,
  });
}

beforeEach(async () => {
  const db = getDb();
  await Promise.all([
    db.cards.clear(),
    db.skillStates.clear(),
    db.gamification.clear(),
    db.dailyProgress.clear(),
  ]);
  localStorage.clear();
  useSettings({});
});

describe('Today hero', () => {
  it('shows the streak, the goal ring, freezes and the start button', async () => {
    await addCard();
    await saveGamification(getDb(), { streakCurrent: 12, freezesHeld: 2, dailyGoalMinutes: 15 });
    await saveDailyProgress(getDb(), {
      ...emptyDailyProgress(toLocalDate(new Date())),
      minutes: 6,
    });
    renderHero();
    expect(await screen.findByRole('img', { name: 'Daily goal: 6 of 15 minutes' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Streak and daily goal' })).toBeInTheDocument();
    expect(screen.getByTestId('streak')).toHaveTextContent('12day streak');
    expect(await screen.findByTestId('goal-copy')).toHaveTextContent(
      "9 min to go for today's 15-minute goal",
    );
    expect(screen.getByTestId('freezes')).toHaveTextContent('❄️❄️2 streak freezes held');
    expect(screen.getByTestId('start-session')).toHaveAttribute('href', '/session');
    expect(screen.queryByTestId('first-day')).not.toBeInTheDocument();
  });

  it('says come back tomorrow once the goal is met, not "do more"', async () => {
    await addCard();
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
    expect(await screen.findByTestId('goal-copy')).toHaveTextContent(/come back tomorrow/i);
  });
});

describe('Today hero on day one (M10-15)', () => {
  it('says how long the first session takes and what it starts with', async () => {
    renderHero();
    expect(await screen.findByTestId('first-day')).toHaveTextContent(
      'Your first session takes about 10 minutes and starts with the musical alphabet.',
    );
    // The first-day line replaces the goal's "N min to go": one cue besides the button.
    expect(await screen.findByRole('img', { name: 'Daily goal: 0 of 10 minutes' })).toBeVisible();
    expect(screen.queryByTestId('goal-copy')).not.toBeInTheDocument();
    expect(screen.getByTestId('start-session')).toHaveTextContent('Start session (10 min)');
  });

  it('takes the minutes from the session length and the topic from the frontier', async () => {
    useSettings({ sessionMinutes: 5, startWithSound: true });
    renderHero();
    expect(await screen.findByTestId('first-day')).toHaveTextContent(
      'Your first session takes about 5 minutes and starts with hear it, find it on the neck.',
    );
  });

  it('moves past skills placement already mastered', async () => {
    for (const skillId of ['F1.alphabet', 'F1.b-c-e-f', 'F1.half-steps', 'F1.whole-steps']) {
      await getDb().skillStates.put({
        skillId,
        status: 'mastered',
        guideLevel: 0,
        rollingAccuracy: 1,
      });
    }
    renderHero();
    const line = await screen.findByTestId('first-day');
    expect(line).toHaveTextContent(/^Your first session takes about 10 minutes and starts with /);
    expect(line).not.toHaveTextContent(/musical alphabet/);
  });

  it('keeps the goal copy beside the line once minutes are logged', async () => {
    await saveDailyProgress(getDb(), {
      ...emptyDailyProgress(toLocalDate(new Date())),
      minutes: 3,
    });
    renderHero();
    expect(await screen.findByTestId('first-day')).toBeVisible();
    expect(await screen.findByTestId('goal-copy')).toHaveTextContent('7 min to go');
  });

  it('drops the line once the learner has cards', async () => {
    await addCard();
    renderHero();
    expect(await screen.findByTestId('goal-copy')).toBeVisible();
    expect(screen.queryByTestId('first-day')).not.toBeInTheDocument();
  });
});

describe('Today hero streak freezes (M10-15)', () => {
  it('hides the freezes line until a freeze is held', async () => {
    renderHero();
    expect(await screen.findByTestId('streak-count')).toHaveTextContent('0');
    expect(await screen.findByTestId('first-day')).toBeVisible();
    expect(screen.queryByTestId('freezes')).not.toBeInTheDocument();
    expect(screen.queryByText(/no streak freezes/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('freezes-explainer')).not.toBeInTheDocument();
  });

  it('explains the first freeze once, then shows only the count', async () => {
    await saveGamification(getDb(), { streakCurrent: 7, freezesHeld: 1 });
    const first = renderHero();
    expect(await screen.findByTestId('freezes')).toHaveTextContent('1 streak freeze held');
    expect(screen.getByTestId('freezes-explainer')).toHaveTextContent(EXPLAINER);
    first.unmount();

    renderHero();
    expect(await screen.findByTestId('freezes')).toHaveTextContent('1 streak freeze held');
    expect(screen.queryByTestId('freezes-explainer')).not.toBeInTheDocument();
  });

  it('keeps the explainer up for the visit when a freeze is earned while Today is open', async () => {
    renderHero();
    expect(await screen.findByTestId('first-day')).toBeVisible();
    await saveGamification(getDb(), { streakCurrent: 7, freezesHeld: 1 });
    expect(await screen.findByTestId('freezes-explainer')).toHaveTextContent(EXPLAINER);
    expect(localStorage.getItem('fretwork.today.freezeExplained')).toBe('1');
  });
});
