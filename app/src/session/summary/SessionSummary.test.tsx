import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Celebration } from './celebrations';
import { ComboCounter } from './ComboCounter';
import { SessionSummary } from './SessionSummary';

const base: Celebration = {
  answered: 12,
  accuracy: 0.83,
  progress: {
    learning: 10,
    stable: 0,
    becameStable: 0,
    nextReview: { date: '2026-10-19', inDays: 1 },
  },
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

  it('says why a session ended at its new-item cap, and only then', () => {
    show();
    expect(screen.queryByTestId('summary-enough-new')).toBeNull();
    render(
      <MemoryRouter>
        <SessionSummary celebration={base} enoughNew />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('summary-enough-new')).toHaveTextContent(
      "That's enough new material for today: it sticks better after a sleep.",
    );
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

describe('<SessionSummary> learning and stable (M1-35)', () => {
  it("a first session: today's accuracy, items learning and none stable yet", () => {
    show({
      accuracy: 0.96,
      answered: 25,
      newItems: 14,
      itemsImproved: 14,
      progress: {
        learning: 14,
        stable: 0,
        becameStable: 0,
        nextReview: { date: '2026-10-20', inDays: 2 },
      },
    });
    const terms = screen.getAllByRole('term').map((t) => t.textContent);
    expect(terms).toEqual(['Today’s accuracy', 'Learning', 'Became stable', 'XP earned']);
    expect(screen.getByTestId('summary-accuracy')).toHaveTextContent('96%');
    expect(screen.getByTestId('summary-items')).toHaveTextContent('25');
    expect(screen.getByTestId('summary-learning')).toHaveTextContent('14');
    expect(screen.getByTestId('summary-stable')).toHaveTextContent('0');
    expect(screen.getByTestId('summary-improved')).toHaveTextContent('14');
    expect(screen.getByTestId('summary-stable-of')).toHaveTextContent('of the 14 learning');
    expect(screen.queryByTestId('summary-stable-total')).toBeNull();
    expect(screen.getByTestId('summary-progress')).toHaveTextContent(
      "14 items learning. They become stable as you recall them over the next few days; today's items come back Tuesday.",
    );
    // The spacing explanation stays, and Done stays last.
    expect(screen.getByTestId('summary-spacing')).toHaveTextContent(/^Come back tomorrow/);
    expect(screen.getByRole('link', { name: 'Done' })).toBeVisible();
  });

  it('a session that stabilises items says how many became stable', () => {
    show({
      progress: {
        learning: 12,
        stable: 3,
        becameStable: 3,
        nextReview: { date: '2026-10-19', inDays: 1 },
      },
    });
    expect(screen.getByTestId('summary-learning')).toHaveTextContent('12');
    expect(screen.getByTestId('summary-stable')).toHaveTextContent('3');
    // Every stable item is new today: the tile says it all.
    expect(screen.queryByTestId('summary-stable-total')).toBeNull();
    expect(screen.getByTestId('summary-progress')).toHaveTextContent(
      /^12 items learning, 3 of them newly stable\. The rest become stable .* today's items come back tomorrow\.$/,
    );
  });

  it('an all-review session of stable items forecasts the next review', () => {
    show({
      newItems: 0,
      accuracy: 1,
      progress: {
        learning: 8,
        stable: 8,
        becameStable: 0,
        nextReview: { date: '2026-11-03', inDays: 16 },
      },
    });
    expect(screen.getByTestId('summary-learning')).toHaveTextContent('8');
    expect(screen.getByTestId('summary-stable')).toHaveTextContent('0');
    expect(screen.getByTestId('summary-stable-of')).toHaveTextContent('of the 8 learning');
    // The tile's 0 sits next to how many are stable in all.
    expect(screen.getByTestId('summary-stable-total')).toHaveTextContent('8');
    expect(screen.getByTestId('summary-stable-total').parentElement).toHaveTextContent(
      /^8 stable · \d+ stronger$/,
    );
    expect(screen.getByTestId('summary-progress')).toHaveTextContent(
      "8 items are stable. Each recall stretches the gap, and today's items come back on 3 November.",
    );
  });

  // M1-38: "Learning 7 · Became stable 7" read as 14 items.
  it('frames the stable tile as a subset of the learning one', () => {
    show({
      progress: {
        learning: 7,
        stable: 7,
        becameStable: 7,
        nextReview: { date: '2026-10-19', inDays: 1 },
      },
    });
    const stable = screen.getByText('Became stable').parentElement!;
    expect(stable).toContainElement(screen.getByTestId('summary-stable'));
    expect(screen.getByTestId('summary-stable')).toHaveTextContent('7');
    expect(within(stable).getByTestId('summary-stable-of')).toHaveTextContent(
      /^of the 7 learning$/,
    );
    expect(stable).toHaveTextContent(/^Became stable7of the 7 learning\d+ stronger$/);
    expect(screen.getByTestId('summary-learning')).toHaveTextContent('7');
  });

  it('leaves the line out when nothing was answered', () => {
    show({
      answered: 0,
      accuracy: 0,
      progress: { learning: 0, stable: 0, becameStable: 0, nextReview: null },
    });
    // No "of the 0 learning" under an empty tile.
    expect(screen.queryByTestId('summary-stable-of')).toBeNull();
    expect(screen.queryByTestId('summary-progress')).toBeNull();
    expect(screen.getByTestId('summary-spacing')).toBeVisible();
  });
});

// M1-33: at short heights what's next sits beside the recap, so Done's place
// doesn't depend on how much the session earned.
describe('<SessionSummary> layout', () => {
  it("keeps the recap apart from what's next, with Done last", () => {
    show({
      perfect: true,
      accuracy: 1,
      bestCombo: 9,
      competence: [
        {
          kind: 'learned',
          skillId: 'F2.string6-naturals',
          skillTitle: 'Natural notes on string 6',
          string: 6,
          toFret: 12,
          complete: true,
        },
      ],
    });
    const article = screen.getByRole('article');
    const [recap, next] = Array.from(article.children);
    const done = screen.getByRole('link', { name: 'Done' });
    expect(article.children).toHaveLength(2);
    expect(next?.tagName).toBe('FOOTER');
    expect(next?.lastElementChild).toBe(done);
    expect(next).toContainElement(screen.getByTestId('summary-spacing'));
    for (const id of [
      'summary-headline',
      'summary-learned-hint',
      'moment-perfect',
      'summary-accuracy',
      'summary-progress',
    ]) {
      expect(recap).toContainElement(screen.getByTestId(id));
    }
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
