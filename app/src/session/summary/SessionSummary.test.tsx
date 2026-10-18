import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Celebration } from './celebrations';
import { ComboCounter } from './ComboCounter';
import { SessionSummary } from './SessionSummary';

const base: Celebration = {
  answered: 12,
  accuracy: 0.83,
  newItems: 4,
  xp: 96,
  itemsImproved: 5,
  bestCombo: 2,
  perfect: false,
  personalBest: null,
  competence: [],
  milestones: [],
  confetti: false,
};

function show(c: Partial<Celebration> = {}) {
  return render(
    <MemoryRouter>
      <SessionSummary celebration={{ ...base, ...c }} />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('<SessionSummary>', () => {
  it('shows XP, items improved, accuracy and the spacing copy', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Session complete' })).toBeVisible();
    expect(screen.getByTestId('summary-xp')).toHaveTextContent('96');
    expect(screen.getByTestId('summary-improved')).toHaveTextContent('5');
    expect(screen.getByTestId('summary-accuracy')).toHaveTextContent('83%');
    expect(screen.getByTestId('summary-items')).toHaveTextContent('12');
    expect(screen.getByText(/learning zone/)).toBeVisible();
    expect(screen.getByTestId('summary-spacing')).toHaveTextContent(/^Come back tomorrow/);
    expect(screen.queryByRole('list', { name: 'Moments' })).toBeNull();
    expect(screen.queryByTestId('confetti')).toBeNull();
    expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute('href', '/');
  });

  it('leads with competence and lists the session moments', () => {
    show({
      perfect: true,
      accuracy: 1,
      bestCombo: 9,
      personalBest: { medianMs: 1200, previousMs: 1500 },
      competence: [
        {
          kind: 'reach',
          skillId: 'F2.string6-naturals',
          skillTitle: 'Natural notes on string 6',
          string: 6,
          toFret: 12,
          complete: true,
        },
        {
          kind: 'reach',
          skillId: 'F2.string5-naturals',
          skillTitle: 'Natural notes on string 5',
          string: 5,
          toFret: 0,
          complete: false,
        },
      ],
      milestones: ['7-day streak'],
    });
    expect(
      screen.getByRole('heading', { level: 1, name: 'You now know string 6 to fret 12' }),
    ).toBeVisible();
    expect(screen.getByText('Session complete')).toBeVisible();
    expect(screen.getByText('Natural notes on string 6')).toBeVisible();
    const gains = screen.getByRole('list', { name: 'What you can now do' });
    expect(
      within(gains)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['✓You now know open string 5', '✓7-day streak']);
    expect(screen.getByTestId('moment-perfect')).toHaveTextContent('Perfect session');
    expect(screen.getByTestId('moment-personal-best')).toHaveTextContent(
      'New personal-best speedMedian answer 1.2s, down from 1.5s',
    );
    expect(screen.getByTestId('moment-combo')).toHaveTextContent('9 correct in a row');
    expect(screen.queryByText(/learning zone/)).toBeNull();
  });

  it('frames same-day gains as learned, with a come-back hint and no confetti', () => {
    show({
      competence: [
        {
          kind: 'learned',
          skillId: 'F2.string6-naturals',
          skillTitle: 'Natural notes on string 6',
          string: 6,
          toFret: 5,
          complete: false,
        },
      ],
    });
    expect(
      screen.getByRole('heading', { level: 1, name: 'You learned string 6 to fret 5 today' }),
    ).toBeVisible();
    expect(screen.getByTestId('summary-learned-hint')).toHaveTextContent(/tomorrow/);
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  it('fires confetti for a milestone', () => {
    show({
      confetti: true,
      competence: [{ kind: 'mastered', skillId: 's', skillTitle: 'Natural notes on string 6' }],
    });
    expect(
      screen.getByRole('heading', { name: "You've mastered natural notes on string 6" }),
    ).toBeVisible();
    expect(screen.queryByText('Natural notes on string 6')).toBeNull();
    expect(screen.getByTestId('confetti')).toBeInTheDocument();
  });
});

describe('<ComboCounter>', () => {
  it('appears from a short run of correct answers', () => {
    const { rerender } = render(<ComboCounter combo={2} />);
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    rerender(<ComboCounter combo={3} />);
    expect(screen.getByTestId('combo')).toHaveTextContent('3 in a row');
    rerender(<ComboCounter combo={0} />);
    expect(screen.queryByTestId('combo')).toBeNull();
    rerender(<ComboCounter combo={1} showAt={1} />);
    expect(screen.getByTestId('combo')).toHaveTextContent('1 in a row');
  });
});
