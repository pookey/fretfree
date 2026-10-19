import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useAppStore } from '../app-store';
import { SKILLS } from '../engine';
import { getDb } from '../storage';
import { SessionScreen } from './SessionScreen';

vi.mock('../audio/audio', () => ({ playNotes: vi.fn(() => Promise.resolve()) }));

const DAY = 86_400_000;

/**
 * One known card, due now: string 6, fret 3 (G), in D1 recall. Every skill is
 * mastered at guide level 0, so nothing else joins the session.
 */
async function seedOneReview(): Promise<void> {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
  const now = Date.now();
  await db.cards.put({
    itemId: 'note@s6f3',
    skillId: 'F2.string6-naturals',
    fsrs: {
      due: new Date(now - DAY),
      stability: 3,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 3,
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      state: 2,
      last_review: new Date(now - 4 * DAY),
    },
    createdAt: new Date(now - 6 * DAY),
    lastReviewedAt: new Date(now - 4 * DAY),
  });
  await db.skillStates.bulkPut(
    SKILLS.map((s) => ({
      skillId: s.id,
      status: 'mastered' as const,
      guideLevel: 0 as const,
      rollingAccuracy: 1,
    })),
  );
}

function renderSession() {
  return render(
    <MemoryRouter initialEntries={['/session?skill=F2.string6-naturals']}>
      <SessionScreen />
    </MemoryRouter>,
  );
}

async function choice(name: string): Promise<HTMLElement> {
  const group = await screen.findByRole('group', { name: 'Name the highlighted note' });
  return within(group).getByRole('button', { name });
}

async function answerWrong(): Promise<HTMLElement> {
  fireEvent.click(await choice('C'));
  expect(await screen.findByTestId('feedback-wrong')).toHaveTextContent(
    "That was G. You'll see it again shortly.",
  );
  const button = screen.getByRole('button', { name: 'Continue' });
  // The effect that focuses Continue also listens for Enter and Space.
  await waitFor(() => expect(button).toHaveFocus());
  return button;
}

async function expectNextPrompt(): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId('feedback-wrong')).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  expect(screen.getByTestId('feedback-bar')).not.toHaveAttribute('data-state');
  // The miss comes back, ready to answer.
  await waitFor(async () => expect(await choice('G')).toBeEnabled());
}

describe('<SessionScreen> feedback bar (M1-28)', () => {
  beforeEach(async () => {
    await seedOneReview();
    useAppStore.setState({ loaded: true });
  });

  it('marks a wrong answer and focuses Continue', async () => {
    renderSession();
    const button = await answerWrong();
    const bar = screen.getByTestId('feedback-bar');
    expect(bar).toHaveAttribute('data-state', 'wrong');
    expect(bar).toHaveAttribute('aria-live', 'polite');
    expect(bar).toContainElement(button);
    await waitFor(() => expect(button).toHaveFocus());
  });

  it('continues on Enter', async () => {
    renderSession();
    await answerWrong();
    fireEvent.keyDown(window, { key: 'Enter' });
    await expectNextPrompt();
  });

  it('continues on Space', async () => {
    renderSession();
    await answerWrong();
    fireEvent.keyDown(window, { key: ' ' });
    await expectNextPrompt();
  });

  it('continues on a tap of Continue', async () => {
    renderSession();
    fireEvent.click(await answerWrong());
    await expectNextPrompt();
  });

  it('ignores other keys while waiting for Continue', async () => {
    renderSession();
    await answerWrong();
    fireEvent.keyDown(window, { key: 'g' });
    expect(screen.getByTestId('feedback-wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
  });

  it('shows a brief ✓ for a right answer and moves on without Continue', async () => {
    renderSession();
    fireEvent.click(await choice('G'));
    expect(await screen.findByTestId('feedback-correct')).toHaveTextContent('✓ G');
    expect(screen.getByTestId('feedback-bar')).toHaveAttribute('data-state', 'correct');
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    // One item, answered right: the session is over.
    await waitFor(() => expect(screen.queryByTestId('feedback-correct')).not.toBeInTheDocument());
  });
});

describe('<SessionScreen> with nothing to serve', () => {
  beforeEach(async () => {
    // Every skill mastered and the one card reviewed: nothing is due or new.
    await seedOneReview();
    await getDb().cards.clear();
    useAppStore.setState({ loaded: true });
  });

  it('says so instead of finishing a session with no answers', async () => {
    renderSession();
    expect(await screen.findByTestId('session-empty')).toHaveTextContent(
      'Nothing to practise right now',
    );
    expect(screen.queryByText('Session complete')).toBeNull();
    expect(screen.getByRole('link', { name: 'Done' })).toHaveAttribute('href', '/');
    expect(await getDb().gamificationEvents.count()).toBe(0);
  });
});

describe('<SessionScreen> context panel (M3-11)', () => {
  beforeEach(async () => {
    await seedOneReview();
    useAppStore.setState({ loaded: true });
  });

  it('is hidden at guide level 0, even with help open', async () => {
    renderSession();
    await choice('G');
    expect(screen.getByRole('button', { name: 'Hide help' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();
  });

  it('shows from level 1, and the help toggle hides it', async () => {
    await getDb().skillStates.update('F2.string6-naturals', { guideLevel: 1 });
    renderSession();
    await choice('G');
    expect(screen.getByTestId('context-panel')).toHaveAccessibleName('Context');
    fireEvent.click(screen.getByRole('button', { name: 'Hide help' }));
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();
  });
});
