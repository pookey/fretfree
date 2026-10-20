import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS, type GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { EarContextPanel } from './ContextPanel';
import { D14View } from './D14View';
import { d14Check, d14Clip, d14MakePrompt, type D14Answer, type D14Prompt } from './logic';
import { playClip, stopClip } from './play';

vi.mock('./play', () => ({
  playClip: vi.fn(() => Promise.resolve()),
  stopClip: vi.fn(),
}));

const prompt = (id = 'ear-interval:M3:up', scopeLevel = 0, r = 0) =>
  d14MakePrompt(
    { id, skillId: 'I6.test' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => r },
  );

interface Opts {
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D14Answer> | null;
}

function renderView(p: D14Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const props = {
    prompt: p,
    guideLevel: 3 as GuideLevel,
    guided: opts.guided ?? false,
    handedness: 'right' as const,
    sizeClass: opts.sizeClass ?? ('regular-wide' as SizeClass),
    tuning: STANDARD_TUNING,
    feedback: opts.feedback ?? null,
    onAnswer,
    aside: <aside data-testid="context-panel" />,
  };
  const utils = render(<D14View {...props} />);
  return { onAnswer, props, ...utils };
}

const answers = () =>
  within(screen.getByRole('group', { name: /Which|Major 3rd/ })).getAllByRole('button');
const fb = (p: D14Prompt, answer: D14Answer) => ({ answer, result: d14Check(p, answer) });

beforeEach(() => {
  vi.mocked(playClip).mockClear();
  vi.mocked(stopClip).mockClear();
});

afterEach(() => {
  useAppStore.setState({ settings: DEFAULT_SETTINGS });
});

describe('<D14View>', () => {
  it('is registered as the ear drill for every I6 skill', async () => {
    const drill = getDrill('ear-identify');
    expect(await resolveView(drill!.render)).toBe(D14View);
    expect(await resolveView(drill!.contextPanel!)).toBe(EarContextPanel);
    expect(drill!.skills).toContain('I6.intervals-fourths-fifths');
    expect(drill!.skills).toContain('I6.progressions-pop');
  });

  it('plays the clip as the prompt opens, and again on demand', () => {
    const p = prompt();
    const { unmount } = renderView(p);
    expect(playClip).toHaveBeenCalledTimes(1);
    expect(playClip).toHaveBeenLastCalledWith(d14Clip(p, 'M3'));

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(playClip).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: 'r' });
    expect(playClip).toHaveBeenCalledTimes(3);

    unmount();
    expect(stopClip).toHaveBeenCalled();
  });

  it('asks with buttons that name each sound, and nothing that gives it away', () => {
    const { onAnswer, container } = renderView(prompt());
    expect(screen.getByText('Which interval? Two notes, rising.')).toBeVisible();
    expect(answers().map((b) => b.getAttribute('aria-label'))).toEqual(['minor 3rd', 'major 3rd']);
    expect(screen.getByRole('button', { name: 'major 3rd' })).toHaveAttribute(
      'aria-keyshortcuts',
      '2',
    );
    // No neck or chart until the answer is in.
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByTestId('d14-feedback')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'major 3rd' }));
    expect(onAnswer).toHaveBeenCalledWith('M3');
    fireEvent.keyDown(window, { key: '1' });
    expect(onAnswer).toHaveBeenLastCalledWith('m3');
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    fireEvent.keyDown(window, { key: '9' });
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it('walks a new item through first: names the sound, then asks for it (rule 8)', () => {
    renderView(prompt('ear-chord:minor'), { guided: true });
    expect(screen.getByText(/Minor chord \(1 ♭3 5\): darker and sadder\./)).toBeVisible();
    expect(screen.getByText(/Listen, then tap/)).toHaveTextContent('Listen, then tap Minor.');
  });

  it('shows a right answer on the neck, with its name (rule 10)', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'M3') });
    expect(screen.getByRole('button', { name: 'major 3rd' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    expect(screen.getByTestId('d14-feedback')).toHaveTextContent(
      'Major 3rd, rising: 4 half steps apart.',
    );
    expect(
      screen.getByRole('group', { name: /Fretboard showing a major 3rd: string \d fret \d+/ }),
    ).toBeInTheDocument();
    // Heard already: no replay on a right answer, and nothing to compare.
    expect(playClip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: 'Compare the sounds' })).toBeNull();
  });

  it('replays a wrong answer’s sound, and both side by side on demand', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'm3') });
    expect(screen.getByRole('button', { name: 'minor 3rd' })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    expect(screen.getByRole('button', { name: 'major 3rd' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    expect(screen.getByTestId('d14-feedback')).toHaveTextContent(
      'A minor 3rd is 1 half step narrower.',
    );
    // The prompt's clip, then the answer's again with its name.
    expect(playClip).toHaveBeenCalledTimes(2);

    const compare = screen.getByRole('group', { name: 'Compare the sounds' });
    fireEvent.click(within(compare).getByRole('button', { name: 'Hear yours: minor 3rd' }));
    expect(playClip).toHaveBeenLastCalledWith(d14Clip(p, 'm3'));
    fireEvent.click(within(compare).getByRole('button', { name: 'Hear the answer: major 3rd' }));
    expect(playClip).toHaveBeenLastCalledWith(d14Clip(p, 'M3'));
    // Answers are closed in feedback; R still replays.
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'R' });
    expect(playClip).toHaveBeenLastCalledWith(d14Clip(p, 'M3'));
  });

  it('marks a chord’s notes by degree on the neck', () => {
    const p = prompt('ear-chord:minor');
    renderView(p, { feedback: fb(p, 'minor') });
    expect(
      screen.getByRole('group', { name: /Fretboard showing a minor chord/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('marker-root')).toHaveLength(2);
    expect(screen.getAllByTestId('marker-third')).toHaveLength(1);
    expect(screen.getAllByTestId('marker-fifth')).toHaveLength(1);
  });

  it('lays out a progression’s chords under their numerals', () => {
    const p = prompt('prog:I-V-vi-IV:ear');
    renderView(p, { feedback: fb(p, 'vi-IV-I-V') });
    const chart = screen.getByRole('list', { name: 'Chords of I–V–vi–IV in C major' });
    expect(
      within(chart)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['CI', 'GV', 'Amvi', 'FIV']);
    expect(screen.getByTestId('d14-feedback')).toHaveTextContent(
      'vi–IV–I–V uses the same chords in another order',
    );
  });

  it('says when silent mode leaves the clip unheard', () => {
    act(() => useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, soundOn: false } }));
    renderView(prompt());
    expect(screen.getByRole('status')).toHaveTextContent('Sound is off');
  });

  it('places the panel beside the card on iPad landscape, below elsewhere', () => {
    const { container } = renderView(prompt(), { sizeClass: 'compact' });
    const drill = container.querySelector('[data-testid="d14-drill"]')!;
    expect(drill.lastElementChild).toBe(screen.getByTestId('context-panel'));
    expect(drill).toHaveAttribute('data-item', 'ear-interval:M3:up');
  });

  it('marks a wide set of buttons so they wrap in rows of six', () => {
    const { container } = renderView(prompt('ear-interval:M3:up', 2));
    expect(container.querySelector('[data-wide]')).not.toBeNull();
    expect(answers()).toHaveLength(12);
  });
});

describe('<EarContextPanel>', () => {
  const panel = (p: D14Prompt, guideLevel: GuideLevel, guided = false) =>
    render(
      <EarContextPanel
        prompt={p}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );

  it('lists every button’s size, and a tune to listen for from level 2', () => {
    panel(prompt(), 2);
    expect(screen.getByRole('heading', { name: 'Interval sizes' })).toBeVisible();
    expect(screen.getByText('Major 3rd')).toBeVisible();
    expect(screen.getByText('When the Saints Go Marching In')).toBeVisible();
  });

  it('fades to sizes only at level 1, with full guides on a worked example', () => {
    const { unmount } = panel(prompt('ear-chord:major'), 1);
    expect(screen.getByRole('heading', { name: 'Chord qualities' })).toBeVisible();
    expect(screen.getByText('1 ♭3 5')).toBeVisible();
    expect(screen.queryByText('darker and sadder')).toBeNull();
    unmount();
    panel(prompt('prog:I-IV-V:ear'), 1, true);
    expect(screen.getByRole('heading', { name: 'Progressions' })).toBeVisible();
    expect(screen.getByText('The 1950s doo-wop progression.')).toBeVisible();
  });
});
