import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useAppStore } from '../app-store';
import { DEFAULT_SETTINGS, ENGINE_CONFIG } from '../engine';
import { INTROS } from '../learn/intros';
import { getDb } from '../storage';
import { ConceptCard } from './ConceptCard';
import { SKIP_INTROS_KEY } from './intro-gate';
import { SessionScreen } from './SessionScreen';
import { scaled } from '../test/timeouts';

vi.mock('../audio/audio', () => ({ playNotes: vi.fn(() => Promise.resolve()) }));

const intro = (id: string) => INTROS.find((i) => i.id === id)!;

beforeEach(() => {
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

describe('<ConceptCard>', () => {
  it('shows the title, the words and the diagram, and takes focus', () => {
    render(<ConceptCard intro={intro('c1-octaves')} onDismiss={() => {}} />);
    const card = screen.getByRole('region', { name: 'The octave shape' });
    expect(card).toHaveFocus();
    expect(card).toHaveTextContent('An octave is the same letter, higher in pitch.');
    expect(within(card).getByTestId('intro-diagram')).toHaveAttribute('data-kind', 'neck');
    expect(within(card).getByRole('group', { name: /G at string 6, fret 3/ })).toBeInTheDocument();
    expect(within(card).getAllByTestId('marker-root')).toHaveLength(1);
  });

  it('draws the note wheel for the F1 intros', () => {
    render(<ConceptCard intro={intro('f1-half-steps')} onDismiss={() => {}} />);
    expect(screen.getByTestId('intro-diagram')).toHaveAttribute('data-kind', 'wheel');
    expect(screen.getByTestId('note-wheel')).toHaveAttribute('data-guide-level', '3');
    expect(screen.getByTestId('wheel-note-C')).toHaveAttribute('data-role', 'start');
  });

  it('shows no diagram when the intro has none', () => {
    render(<ConceptCard intro={intro('f4-pulse')} onDismiss={() => {}} />);
    expect(screen.queryByTestId('intro-diagram')).toBeNull();
  });

  it.each([
    ['a tap on the card', () => fireEvent.click(screen.getByText(/The pulse is/))],
    ['its button', () => fireEvent.click(screen.getByRole('button', { name: 'Got it' }))],
    ['Enter', () => fireEvent.keyDown(window, { key: 'Enter' })],
    ['Space', () => fireEvent.keyDown(window, { key: ' ' })],
  ])('is dismissed by %s, once', (_, act) => {
    const onDismiss = vi.fn();
    render(<ConceptCard intro={intro('f4-pulse')} onDismiss={onDismiss} />);
    act();
    // A key that also clicks the focused button, or a second tap, changes nothing.
    act();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores a tap that lands as it appears, then takes one', () => {
    vi.useFakeTimers();
    try {
      const onDismiss = vi.fn();
      render(<ConceptCard intro={intro('f4-pulse')} onDismiss={onDismiss} />);
      const card = screen.getByTestId('concept-card');
      // A pointer tap (detail 1) aimed at the prompt that just auto-advanced.
      fireEvent.click(screen.getByText(/The pulse is/), { detail: 1 });
      expect(onDismiss).not.toHaveBeenCalled();
      expect(card).not.toHaveAttribute('data-ready');
      act(() => vi.advanceTimersByTime(ENGINE_CONFIG.intros.tapGuardMs));
      expect(card).toHaveAttribute('data-ready', 'true');
      fireEvent.click(screen.getByText(/The pulse is/), { detail: 1 });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves Enter and Space to a focused control outside the card', () => {
    const onDismiss = vi.fn();
    render(
      <>
        <button type="button">End session</button>
        <ConceptCard intro={intro('f4-pulse')} onDismiss={onDismiss} />
      </>,
    );
    const end = screen.getByRole('button', { name: 'End session' });
    end.focus();
    fireEvent.keyDown(end, { key: 'Enter' });
    fireEvent.keyDown(end, { key: ' ' });
    expect(onDismiss).not.toHaveBeenCalled();
    // Its own button, or the card itself, still go on.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Got it' }), { key: 'Enter' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys, and stops listening once gone', () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<ConceptCard intro={intro('f4-pulse')} onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Escape' });
    unmount();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('a session with a new skill (M10-04)', { timeout: scaled(40_000) }, () => {
  let now = 0;

  beforeEach(async () => {
    const db = getDb();
    await Promise.all(db.tables.map((t) => t.clear()));
    localStorage.removeItem(SKIP_INTROS_KEY);
    useAppStore.setState({ loaded: true });
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Tap the answer the worked rep shows. */
  async function answerWorkedRep(): Promise<void> {
    const prompt = await screen.findByText(/to continue\./, {}, { timeout: scaled(20_000) });
    const answer = prompt.querySelector('strong')!.textContent!;
    const choices = screen.getByRole('group', { name: prompt.textContent! });
    fireEvent.click(within(choices).getByRole('button', { name: answer }));
  }

  const renderSession = (path = '/session?skill=F1.alphabet') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <SessionScreen />
      </MemoryRouter>,
    );

  it('opens with the intro, then the worked rep, timed from the dismissal', async () => {
    renderSession();
    const card = await screen.findByTestId('concept-card', {}, { timeout: scaled(20_000) });
    expect(card).toHaveAttribute('data-intro', 'f1-alphabet');
    expect(screen.queryByRole('group', { name: /Tap/ })).toBeNull();

    // A minute reading the card, then a second to answer.
    now = 60_000;
    fireEvent.keyDown(window, { key: 'Enter' });
    await screen.findByText(/to continue\./, {}, { timeout: scaled(20_000) });
    expect(screen.queryByTestId('concept-card')).toBeNull();
    now = 61_000;
    await answerWorkedRep();

    await waitFor(async () => expect(await getDb().reviewLogs.count()).toBe(1));
    const [log] = await getDb().reviewLogs.toArray();
    expect(log!.skillId).toBe('F1.alphabet');
    expect(log!.responseMs).toBe(1000);
  });

  it('shows no intro once the skill has cards', async () => {
    const first = renderSession();
    await screen.findByTestId('concept-card', {}, { timeout: scaled(20_000) });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await answerWorkedRep();
    await waitFor(async () => expect(await getDb().cards.count()).toBe(1));
    first.unmount();

    // The next session starts on the drill.
    renderSession();
    await waitFor(() => expect(screen.queryByText('Preparing your session…')).toBeNull(), {
      timeout: scaled(20_000),
    });
    expect(document.querySelector('[data-drill="note-wheel"]')).not.toBeNull();
    expect(screen.queryByTestId('concept-card')).toBeNull();
  });

  it('shows no intro under the e2e switch', async () => {
    localStorage.setItem(SKIP_INTROS_KEY, '1');
    renderSession();
    await screen.findByText(/to continue\./, {}, { timeout: scaled(20_000) });
    expect(screen.queryByTestId('concept-card')).toBeNull();
    localStorage.removeItem(SKIP_INTROS_KEY);
  });
});
