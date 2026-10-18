import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router';
import { Rating, State, createEmptyCard } from 'ts-fsrs';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS, getSkill } from '../../engine';
import { getDb } from '../../storage';
import { LearnScreen } from './LearnScreen';
import { MasteryRing } from './MasteryRing';

function setWidth(width: number, height = 834) {
  Object.assign(window, { innerWidth: width, innerHeight: height });
  window.dispatchEvent(new Event('resize'));
}

function renderAt(path = '/learn') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LearnScreen />
    </MemoryRouter>,
  );
}

const loaded = () =>
  waitFor(() => expect(document.querySelector('[data-loaded="true"]')).not.toBeNull());

beforeEach(() => {
  setWidth(1194);
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

afterEach(async () => {
  const db = getDb();
  await Promise.all([
    db.cards.clear(),
    db.reviewLogs.clear(),
    db.skillStates.clear(),
    db.settings.clear(),
  ]);
});

describe('<LearnScreen>', () => {
  it('shows the module map beside the first open module on iPad', async () => {
    renderAt();
    await loaded();
    const map = screen.getByRole('region', { name: 'Modules' });
    expect(within(map).getAllByRole('link', { name: /stable|mastered|coming soon/ }).length).toBe(
      18,
    );
    const detail = screen.getByTestId('module-detail');
    expect(within(detail).getByRole('heading', { level: 2 })).toHaveTextContent('Neck basics');
    expect(screen.getByTestId('module-notes-1')).toHaveAttribute('aria-current', 'true');
    expect(within(detail).getByTestId('skill-F2.string6-naturals')).toHaveTextContent('Ready');
    expect(screen.getByRole('combobox', { name: 'Ordered for your goal' })).toHaveValue('general');
  });

  it('previews a locked module (soft unlocking)', async () => {
    renderAt();
    await loaded();
    fireEvent.click(screen.getByTestId('module-notes-2'));
    const detail = screen.getByTestId('module-detail');
    expect(within(detail).getByRole('heading', { level: 2 })).toHaveTextContent('Whole neck');
    expect(within(detail).getByTestId('module-state')).toHaveTextContent('Locked: preview');
    expect(within(detail).getByTestId('preview-note')).toBeInTheDocument();
    expect(within(detail).getByTestId('skill-C2.all-notes')).toHaveTextContent(
      /Preview only.*practising Natural notes on string 6 and Natural notes on string 5/,
    );
    expect(within(detail).getByRole('complementary', { name: 'Watch out for' })).toBeVisible();
  });

  it('shows modules that are not built yet as coming soon', async () => {
    renderAt('/learn?module=pentatonic');
    await loaded();
    expect(screen.getByTestId('coming-soon')).toBeInTheDocument();
    expect(within(screen.getByTestId('module-pentatonic')).getByRole('img')).toHaveAccessibleName(
      'Pentatonic: coming soon',
    );
  });

  it('fills rings from stored progress and marks mastered skills', async () => {
    const db = getDb();
    const skill = getSkill('F2.string6-naturals')!;
    const items = skill.items();
    const now = new Date();
    const stable = Math.ceil(items.length / 2);
    await db.cards.bulkPut(
      items.slice(0, stable).map((i) => ({
        itemId: i.id,
        skillId: skill.id,
        fsrs: { ...createEmptyCard(now), stability: 10 },
        createdAt: now,
        lastReviewedAt: now,
      })),
    );
    await db.skillStates.put({
      skillId: 'F3.markers',
      status: 'mastered',
      guideLevel: 0,
      rollingAccuracy: 1,
    });
    renderAt();
    await loaded();
    const f2 = screen.getByTestId('skill-F2.string6-naturals');
    expect(within(f2).getByRole('img')).toHaveAttribute(
      'data-mastery',
      String(Math.round((stable / items.length) * 100)),
    );
    const f3 = screen.getByTestId('skill-F3.markers');
    expect(within(f3).getByRole('img')).toHaveAttribute('data-state', 'mastered');
    expect(f3).toHaveTextContent('Mastered. Reviews keep it fresh.');
    expect(screen.getByTestId('module-notes-1')).toHaveTextContent('1/8 skills');
  });

  it('shows learning before stable after a first session', async () => {
    const db = getDb();
    const skill = getSkill('F2.string6-naturals')!;
    const items = skill.items();
    const now = new Date();
    const reviewed = items.slice(0, 3);
    await db.cards.bulkPut(
      reviewed.map((i) => ({
        itemId: i.id,
        skillId: skill.id,
        fsrs: { ...createEmptyCard(now), state: State.Learning, stability: 2.3, reps: 2 },
        createdAt: now,
        lastReviewedAt: now,
      })),
    );
    await db.reviewLogs.bulkAdd(
      reviewed.map((i, n) => ({
        itemId: i.id,
        skillId: skill.id,
        drillType: 'D1',
        correct: n < 2,
        responseMs: 1000,
        rating: n < 2 ? Rating.Good : Rating.Again,
        hintUsed: false,
        answerGiven: 'C',
        at: now,
      })),
    );
    renderAt();
    await loaded();
    const f2 = screen.getByTestId('skill-F2.string6-naturals');
    expect(within(f2).getByTestId('skill-progress')).toHaveTextContent(
      `2 learning · 0 stable of ${items.length}`,
    );
    expect(within(f2).getByRole('img')).toHaveAttribute(
      'data-learning',
      String(Math.round((2 / items.length) * 100)),
    );
    const ring = within(screen.getByTestId('module-notes-1')).getByRole('img');
    expect(Number(ring.getAttribute('data-learning'))).toBeGreaterThan(0);
    expect(ring).toHaveAttribute('data-mastery', '0');
    expect(ring).toHaveAccessibleName(/^Neck basics: \d+% learning, 0% stable$/);
    expect(screen.getByTestId('module-progress')).toHaveTextContent(/^\d+% learning · 0% stable$/);
    expect(screen.getByTestId('module-notes-1')).toHaveTextContent(
      /[1-9]\d*% learning · 0% stable/,
    );
  });

  it('orders the map by the learner’s goal', async () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, goal: 'songs' } });
    renderAt();
    await loaded();
    const links = within(screen.getByRole('region', { name: 'Modules' })).getAllByRole('link');
    expect(links[0]).toHaveAttribute('data-testid', 'module-harmony');
    expect(screen.getByRole('combobox', { name: 'Ordered for your goal' })).toHaveValue('songs');
    // Harmony has no skills yet, so the detail opens on the first open module.
    expect(screen.getByTestId('module-detail')).toHaveTextContent('Neck basics');
  });

  it('lets the learner change their goal, which reorders the map', async () => {
    renderAt();
    await loaded();
    const select = screen.getByRole('combobox', { name: 'Ordered for your goal' });
    fireEvent.change(select, { target: { value: 'improvise' } });
    await waitFor(() => expect(useAppStore.getState().settings.goal).toBe('improvise'));
    const links = within(screen.getByRole('region', { name: 'Modules' })).getAllByRole('link');
    expect(links[0]).toHaveAttribute('data-testid', 'module-pentatonic');
  });

  it('shows one pane at a time on compact', async () => {
    setWidth(390, 844);
    renderAt();
    await loaded();
    expect(screen.queryByTestId('module-detail')).toBeNull();
    fireEvent.click(screen.getByTestId('module-notes-1'));
    expect(screen.queryByRole('region', { name: 'Modules' })).toBeNull();
    expect(screen.getByTestId('module-detail')).toHaveTextContent('Neck basics');
    fireEvent.click(screen.getByRole('link', { name: '← All modules' }));
    expect(screen.getByRole('region', { name: 'Modules' })).toBeInTheDocument();
  });

  it('goes back to the map without leaving the detail in history on compact', async () => {
    setWidth(390, 844);
    const router = createMemoryRouter([{ path: '/learn', element: <LearnScreen /> }], {
      initialEntries: ['/learn'],
    });
    render(<RouterProvider router={router} />);
    await loaded();
    fireEvent.click(screen.getByTestId('module-notes-1'));
    fireEvent.click(screen.getByRole('link', { name: '← All modules' }));
    // A back gesture from the map must not reopen the detail it just left.
    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('');
    expect(screen.queryByTestId('module-detail')).toBeNull();
  });
});

describe('<MasteryRing>', () => {
  const arcs = () => ({
    learning: document.querySelectorAll('circle[class*="ringLearning"]'),
    stable: document.querySelectorAll('circle[class*="ringFill"]'),
  });

  it('shows an empty track at 0/0', () => {
    render(<MasteryRing learning={0} stable={0} state="open" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: 0% learning, 0% stable');
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(document.querySelectorAll('circle')).toHaveLength(1);
  });

  it('lights a thin learning arc before anything is stable', () => {
    render(<MasteryRing learning={0.69} stable={0} state="open" label="Neck basics" />);
    const ring = screen.getByRole('img');
    expect(ring).toHaveAccessibleName('Neck basics: 69% learning, 0% stable');
    expect(ring).toHaveAttribute('data-learning', '69');
    expect(ring).toHaveAttribute('data-mastery', '0');
    expect(screen.getByText('69%')).toBeInTheDocument();
    expect(arcs().learning).toHaveLength(1);
    expect(arcs().stable).toHaveLength(0);
  });

  it('draws the solid stable arc over the learning arc when mixed', () => {
    const { rerender } = render(<MasteryRing learning={0.5} stable={0.2} state="open" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: 50% learning, 20% stable');
    const circles = [...document.querySelectorAll('circle')];
    // Track, then learning, then stable on top.
    expect(circles.map((c) => c.getAttribute('class'))).toEqual([
      expect.stringContaining('ringTrack'),
      expect.stringContaining('ringLearning'),
      expect.stringContaining('ringFill'),
    ]);
    const offset = (c: Element) => Number(c.getAttribute('stroke-dashoffset'));
    expect(offset(circles[1]!)).toBeLessThan(offset(circles[2]!));
    rerender(<MasteryRing learning={0.2} stable={0.2} state="locked" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: 20% learning, 20% stable, locked');
    expect(screen.queryByText('20%')).toBeNull();
    // Fully stable: the learning arc is hidden under it, so it isn't drawn.
    expect(arcs().learning).toHaveLength(0);
    rerender(<MasteryRing learning={0.1} stable={0.3} state="open" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: 30% learning, 30% stable');
  });

  it('shows a tick and full ring when mastered, and speaks only that', () => {
    const { rerender } = render(<MasteryRing learning={1} stable={1} state="mastered" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: mastered');
    expect(screen.queryByText('100%')).toBeNull();
    expect(arcs().stable).toHaveLength(1);
    rerender(<MasteryRing learning={0} stable={0} state="soon" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: coming soon');
  });
});
