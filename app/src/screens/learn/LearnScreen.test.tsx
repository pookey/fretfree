import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router';
import { createEmptyCard } from 'ts-fsrs';
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
  await Promise.all([db.cards.clear(), db.skillStates.clear(), db.settings.clear()]);
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
  it('speaks its state and shows the percentage only while in progress', () => {
    const { rerender } = render(<MasteryRing fraction={0.42} state="open" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: 42% stable');
    expect(screen.getByText('42%')).toBeInTheDocument();
    rerender(<MasteryRing fraction={0.2} state="locked" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: 20% stable, locked');
    expect(screen.queryByText('20%')).toBeNull();
    rerender(<MasteryRing fraction={1} state="open" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: 100% stable');
    rerender(<MasteryRing fraction={1} state="mastered" label="X" />);
    expect(screen.getByRole('img')).toHaveAccessibleName('X: mastered');
    rerender(<MasteryRing fraction={0} state="open" label="X" />);
    expect(document.querySelectorAll('circle')).toHaveLength(1);
  });
});
