import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Rating } from 'ts-fsrs';
import { createScheduler, type CardRecord, type ReviewLogRecord } from '../../../engine';
import { addDays, toLocalDate } from '../../../engine/gamification/local-date';
import { getDb } from '../../../storage';
import { PROGRESS_PANELS } from '../registry';
import { Panel as HeatmapPanel } from '../panels/heatmap';
import ComingUp from './ComingUp';
import OverTime from './OverTime';
import PracticeCalendar from './PracticeCalendar';

const scheduler = createScheduler({ enableFuzz: false });
const SKILL = 'F2.string5-naturals';
const DAY = 86_400_000;
const noop = () => {};

afterEach(async () => {
  const db = getDb();
  await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.dailyProgress.clear()]);
});

/**
 * Three days of D1 answers, ending today: one note answered each day
 * (getting faster), and a second note from the second day.
 */
async function seedThreeDays() {
  const now = new Date();
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY);
  const answers: [string, number, number][] = [
    ['note@s5f0', 2, 3000],
    ['note@s5f0', 1, 2400],
    ['note@s5f2', 1, 2600],
    ['note@s5f0', 0, 1500],
  ];
  const cards = new Map<string, CardRecord>();
  const logs: ReviewLogRecord[] = answers.map(([itemId, daysAgo, responseMs]) => {
    const when = at(daysAgo);
    const card = cards.get(itemId) ?? scheduler.newCard({ id: itemId, skillId: SKILL }, when);
    cards.set(itemId, scheduler.review(card, Rating.Good, when));
    return {
      itemId,
      skillId: SKILL,
      drillType: 'name-the-note',
      correct: true,
      responseMs,
      rating: Rating.Good,
      hintUsed: false,
      answerGiven: '?',
      at: when,
    };
  });
  const db = getDb();
  await db.cards.bulkPut([...cards.values()]);
  await db.reviewLogs.bulkAdd(logs);
  const today = toLocalDate(now);
  await db.dailyProgress.bulkPut([
    {
      date: addDays(today, -1),
      xp: 20,
      minutes: 12,
      goalMet: true,
      freezeUsed: false,
      questsCompleted: [],
    },
    { date: today, xp: 5, minutes: 3, goalMet: false, freezeUsed: false, questsCompleted: [] },
  ]);
  return { today };
}

describe('the over-time panels', () => {
  it('sit after the mastery map, with the calendar after the stats', () => {
    const ids = PROGRESS_PANELS.map((p) => p.id);
    expect(ids.indexOf('over-time')).toBe(ids.indexOf('heatmap') + 1);
    expect(ids.indexOf('coming-up')).toBe(ids.indexOf('over-time') + 1);
    expect(ids.indexOf('calendar')).toBe(ids.indexOf('stats') + 1);
  });

  it('invite a first session when there is no history', async () => {
    render(<OverTime revision={0} onDataChanged={noop} />);
    render(<ComingUp revision={0} onDataChanged={noop} />);
    await waitFor(() => expect(screen.getByText(/start your history/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/upcoming reviews/)).toBeInTheDocument());
  });

  it('chart what you know and your speed, day by day', async () => {
    await seedThreeDays();
    render(<OverTime revision={0} onDataChanged={noop} />);
    await waitFor(() =>
      // Three good answers on consecutive days already make note@s5f0 stable.
      expect(screen.getByTestId('known-headline')).toHaveTextContent(
        '2 learning, 1 of them stable · up 1 since day 1',
      ),
    );
    expect(screen.getByRole('img', { name: /Cards you know, by day/ })).toBeInTheDocument();
    expect(screen.getByTestId('speed-headline')).toHaveTextContent(
      '1.5 s on your latest day · 50% faster than your first day',
    );
    expect(
      screen.getByRole('img', { name: /Name the highlighted note: median answer time/ }),
    ).toBeVisible();
    // A single drill needs no picker.
    expect(screen.queryByTestId('speed-drill')).toBeNull();
  });

  it('lets the learner pick a drill for the speed chart', async () => {
    await seedThreeDays();
    await getDb().reviewLogs.add({
      itemId: 'find:E@s5',
      skillId: SKILL,
      drillType: 'find-the-note',
      correct: true,
      responseMs: 4000,
      rating: Rating.Good,
      hintUsed: false,
      answerGiven: '?',
      at: new Date(),
    });
    render(<OverTime revision={0} onDataChanged={noop} />);
    const picker = await screen.findByTestId('speed-drill');
    fireEvent.change(picker, { target: { value: 'find-the-note' } });
    expect(screen.getByTestId('speed-headline')).toHaveTextContent('4.0 s on your latest day');
  });

  it('forecast the reviews due this week and recall a month out', async () => {
    await seedThreeDays();
    render(<ComingUp revision={0} onDataChanged={noop} />);
    await waitFor(() =>
      expect(screen.getByTestId('coming-up-headline')).toHaveTextContent(
        '1 due today · 1 this week',
      ),
    );
    expect(screen.getByRole('img', { name: /Reviews due each day this week/ })).toBeVisible();
    expect(screen.getByTestId('recall-if-stopped')).toHaveTextContent(/recall about \d+%/);
  });

  it('shade the calendar by minutes and mark goal days', async () => {
    const { today } = await seedThreeDays();
    render(<PracticeCalendar revision={0} onDataChanged={noop} />);
    await waitFor(() =>
      expect(screen.getByTestId('calendar-headline')).toHaveTextContent(
        /Practised 2 of the last 7 days/,
      ),
    );
    const yesterday = screen.getByTestId(`calendar-${addDays(today, -1)}`);
    expect(yesterday).toHaveAttribute('data-level', '3');
    expect(yesterday).toHaveTextContent('goal met');
    expect(screen.getByTestId(`calendar-${today}`)).toHaveAttribute('data-today', 'true');
    const table = screen.getByRole('table', { name: /Practice by day/ });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
  });

  it('rewind the mastery map to an earlier day', async () => {
    await seedThreeDays();
    render(<HeatmapPanel revision={0} onDataChanged={noop} />);
    await waitFor(() => expect(screen.getAllByTestId('heat-tile')).toHaveLength(2), {
      timeout: 5000,
    });
    const slider = screen.getByTestId('heatmap-as-of');
    expect(screen.getByTestId('heatmap-as-of-date')).toHaveTextContent('Today');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(screen.getAllByTestId('heat-tile')).toHaveLength(1);
    expect(screen.getByTestId('heatmap-as-of-date')).not.toHaveTextContent('Today');
    fireEvent.change(slider, { target: { value: '2' } });
    expect(screen.getAllByTestId('heat-tile')).toHaveLength(2);
  });
});
