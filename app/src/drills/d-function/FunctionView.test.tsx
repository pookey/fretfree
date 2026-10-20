import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { FunctionView } from './FunctionView';
import { dfCheck, dfMakePrompt, type DfAnswer, type DfPrompt } from './logic';

const prompt = (id = 'minor-chord:V7@key=Am', scopeLevel = 0) =>
  dfMakePrompt(
    { id, skillId: 'I4.harmonic-minor' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

interface Opts {
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<DfAnswer> | null;
  withAside?: boolean;
}

function renderView(p: DfPrompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const { unmount } = render(
    <FunctionView
      prompt={p}
      guideLevel={0}
      guided={opts.guided ?? false}
      handedness="right"
      sizeClass={opts.sizeClass ?? 'regular-wide'}
      tuning={STANDARD_TUNING}
      feedback={opts.feedback ?? null}
      onAnswer={onAnswer}
      aside={opts.withAside ? <aside data-testid="context-panel" /> : undefined}
    />,
  );
  return { onAnswer, unmount };
}

const fb = (p: DfPrompt, answer: DfAnswer) => ({ answer, result: dfCheck(p, answer) });
const choices = () => within(screen.getByRole('group')).getAllByRole('button');

describe('<FunctionView>', () => {
  it('is registered as the function drill for I4’s and I5’s choice skills', async () => {
    const drill = getDrill('function');
    expect(await resolveView(drill!.render)).toBe(FunctionView);
    expect(drill?.skills).toEqual([
      'I4.harmonic-minor',
      'I4.minor-ii-V-i',
      'I5.function-major',
      'I5.function-minor',
      'I5.secondary-dominants',
      'I5.borrowed',
      'I5.substitutes',
    ]);
    expect(drill?.inputModes).toEqual(['choice', 'keyboard']);
  });

  it('asks for the harmonic-minor V7 by name', () => {
    const { onAnswer } = renderView(prompt());
    expect(screen.getByTestId('df-key')).toHaveTextContent('A minor');
    expect(screen.getByTestId('df-cue')).toHaveTextContent('V7');
    expect(screen.getByText('Which chord is V7 in A minor?')).toBeInTheDocument();
    expect(choices()).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'E seven' }));
    expect(onAnswer).toHaveBeenCalledWith('E7');
    expect(screen.queryByTestId('df-feedback')).toBeNull();
  });

  it('labels source and function choices in words', () => {
    renderView(prompt('minor-source:V7@key=Am'));
    expect(choices().map((b) => b.textContent)).toEqual([
      'A natural minor',
      'A harmonic minor',
      'Borrowed from A major (in neither minor scale)',
    ]);
    expect(screen.getByRole('group')).toHaveAttribute('data-wide', 'true');
  });

  it('shows a function card’s numeral under its chord', () => {
    renderView(prompt('function:vi@major'));
    expect(screen.getByTestId('df-cue')).toHaveTextContent('Am');
    expect(screen.getByText('vi in C major')).toBeInTheDocument();
    expect(choices().map((b) => b.textContent)).toEqual(['Tonic', 'Subdominant', 'Dominant']);
  });

  it('lays a borrowed card’s progression out as its choices, with no cue', () => {
    const p = prompt('borrowed:bVII@key=C');
    renderView(p);
    expect(screen.queryByTestId('df-cue')).toBeNull();
    expect(choices().map((b) => b.textContent)).toEqual(
      p.progression!.map((c) => c.replace('b', '♭')),
    );
    expect(choices()[0]).toHaveTextContent('C');
    expect(screen.getByRole('group')).toHaveAttribute('data-progression', 'true');
  });

  it('answers from the keyboard by place, and not once answered', () => {
    const p = prompt();
    const { onAnswer } = renderView(p);
    fireEvent.keyDown(window, { key: '9' });
    fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenCalledWith(p.choices[1]);
    expect(choices()[1]).toHaveAttribute('aria-keyshortcuts', '2');
  });

  it('walks through the fact on the first rep', () => {
    renderView(prompt(), { guided: true });
    expect(screen.getByText(/A harmonic minor raises G to G♯/)).toHaveTextContent(
      'Tap E7 to continue.',
    );
  });

  it('marks a right answer and states the fact', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'E7') });
    expect(screen.getByRole('button', { name: 'E seven' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    for (const b of choices()) expect(b).toBeDisabled();
    expect(screen.queryByTestId('df-explanation')).toBeNull();
    expect(screen.getByTestId('df-feedback')).toHaveTextContent('V7 in A minor is E7.');
    fireEvent.keyDown(window, { key: '1' });
  });

  it('marks a wrong answer, shows the answer and explains the misconception', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'Em7') });
    expect(screen.getByRole('button', { name: 'E minor seven' })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    expect(screen.getByRole('button', { name: 'E seven' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    expect(screen.getByTestId('df-explanation')).toHaveTextContent(
      'Em7 is v7, from natural minor, with G.',
    );
  });

  it('puts the context panel beside the prompt on iPad landscape, below it otherwise', () => {
    const { unmount } = renderView(prompt(), { withAside: true });
    const drill = screen.getByTestId('df-drill');
    expect(drill.lastElementChild).not.toBe(screen.getByTestId('context-panel'));
    unmount();
    renderView(prompt(), { sizeClass: 'compact', withAside: true });
    expect(screen.getByTestId('df-drill').lastElementChild).toBe(
      screen.getByTestId('context-panel'),
    );
    expect(screen.getByTestId('df-drill')).toHaveAttribute('data-size-class', 'compact');
  });
});
