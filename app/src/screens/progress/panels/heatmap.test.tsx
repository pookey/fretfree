import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Rating } from 'ts-fsrs';
import { createScheduler } from '../../../engine';
import { getDb, recordAnswer } from '../../../storage';
import { PROGRESS_PANELS } from '../registry';
import { Panel, id, order, title } from './heatmap';

const scheduler = createScheduler({ enableFuzz: false });

afterEach(async () => {
  const db = getDb();
  await Promise.all([db.cards.clear(), db.reviewLogs.clear()]);
});

describe('Progress heatmap panel', () => {
  it('is registered first, ahead of the stats and the achievements', () => {
    const ids = PROGRESS_PANELS.map((p) => p.id);
    expect(ids[0]).toBe(id);
    expect(title).toBe('Mastery map');
    expect(PROGRESS_PANELS.filter((p) => p.order === order)).toHaveLength(1);
  });

  it('starts empty, then fills in live as answers are stored', async () => {
    render(<Panel revision={0} onDataChanged={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('heatmap-panel')).toHaveAttribute('data-loaded', 'true'),
    );
    expect(screen.queryAllByTestId('heat-tile')).toHaveLength(0);
    expect(screen.getByTestId('retention-forecast')).toHaveTextContent(/Practise a session/);
    expect(screen.getByTestId('heatmap-legend')).toBeInTheDocument();

    const now = new Date();
    const card = scheduler.review(
      scheduler.newCard({ id: 'note@s5f7', skillId: 'F2.string5-naturals' }, now),
      Rating.Good,
      now,
    );
    // One transaction, as the session runner writes it.
    await act(() =>
      recordAnswer(getDb(), {
        card,
        log: {
          itemId: 'note@s5f7',
          skillId: 'F2.string5-naturals',
          drillType: 'name-the-note',
          correct: true,
          responseMs: 1500,
          rating: Rating.Good,
          hintUsed: false,
          answerGiven: 'E',
          at: now,
        },
      }),
    );

    // The live query re-renders asynchronously; under load it can take over a second.
    await waitFor(() => expect(screen.getAllByTestId('heat-tile')).toHaveLength(1), {
      timeout: 5000,
    });
    expect(screen.getByTestId('forecast-string-5')).toHaveTextContent(
      /You'll remember ~\d+% of string 5 next week/,
    );

    fireEvent.click(screen.getByRole('button', { name: /^string 5, fret 7, E: stable for/ }));
    expect(screen.getByTestId('heat-cell-detail')).toHaveTextContent('String 5, fret 7 · E');
    expect(screen.getByTestId('heat-answers')).toHaveTextContent('1 of 1 right');
    expect(screen.getByTestId('heat-median')).toHaveTextContent('1.5s');
  });

  it('reads only neck items, so other topics never land on the map', async () => {
    const now = new Date();
    const card = scheduler.review(
      scheduler.newCard({ id: 'marker:f7', skillId: 'F3.markers' }, now),
      Rating.Good,
      now,
    );
    await getDb().cards.put(card);
    render(<Panel revision={0} onDataChanged={() => {}} />);
    await waitFor(() =>
      expect(screen.getByTestId('heatmap-panel')).toHaveAttribute('data-loaded', 'true'),
    );
    expect(screen.queryAllByTestId('heat-tile')).toHaveLength(0);
    expect(screen.getByTestId('retention-forecast')).toHaveTextContent(/Practise a session/);
  });
});
