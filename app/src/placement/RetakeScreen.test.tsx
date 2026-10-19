import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useAppStore } from '../app-store';
import { getDrill } from '../drills/registry';
import { DEFAULT_SETTINGS, type Skill } from '../engine';
import { getSkill } from '../engine/skills';
import { getDb } from '../storage';
import { RetakeScreen } from './RetakeScreen';

const SKILLS = ['F2.string6-naturals', 'C2.all-notes'].map((id) => getSkill(id) as Skill);
const DRILLS = [getDrill('name-the-note')!];

function renderScreen() {
  return render(
    <MemoryRouter>
      <RetakeScreen skills={SKILLS} drills={DRILLS} />
    </MemoryRouter>,
  );
}

const { load } = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({ load });
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, soundOn: false }, loaded: true });
});
afterEach(async () => {
  const db = getDb();
  await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.skillStates.clear()]);
});

describe('<RetakeScreen>', () => {
  it('explains what the retake does and that it can’t lose progress', () => {
    renderScreen();
    expect(
      screen.getByRole('heading', { name: 'Retake the placement test', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/skips material you already know/)).toBeInTheDocument();
    expect(screen.getByText('It checks Neck basics and Whole neck.')).toBeInTheDocument();
    expect(screen.getByText(/can’t make you lose progress/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('runs the same test, then points to Learn', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Start the test' }));
    // The first probe waits for the drill views to download.
    expect(await screen.findByRole('dialog', { name: 'Placement test' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish now' }));
    expect(await screen.findByTestId('placement-result')).toHaveTextContent(/Nothing to skip/);
    expect(screen.getByRole('link', { name: 'See your skills in Learn' })).toHaveAttribute(
      'href',
      '/learn',
    );
  });

  it('waits for the stored settings before showing the test', () => {
    const pending = vi.fn(() => Promise.resolve());
    useAppStore.setState({ loaded: false, load: pending });
    const { container } = renderScreen();
    expect(container).toBeEmptyDOMElement();
    expect(pending).toHaveBeenCalled();
  });
});
