import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D11View } from './D11View';
import { d11Check, d11MakePrompt, type D11Answer, type D11Prompt } from './logic';

const prompt = (id = 'numeral:vi@key=D', scopeLevel = 0) =>
  d11MakePrompt(
    { id, skillId: 'C8.numerals-major' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

interface Opts {
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D11Answer> | null;
  withAside?: boolean;
}

function renderView(p: D11Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  render(
    <D11View
      prompt={p}
      guideLevel={opts.guideLevel ?? 0}
      guided={opts.guided ?? false}
      handedness="right"
      sizeClass={opts.sizeClass ?? 'regular-wide'}
      tuning={STANDARD_TUNING}
      feedback={opts.feedback ?? null}
      onAnswer={onAnswer}
      aside={opts.withAside ? <aside data-testid="context-panel" /> : undefined}
    />,
  );
  return { onAnswer };
}

const fb = (p: D11Prompt, answer: D11Answer) => ({ answer, result: d11Check(p, answer) });
const choices = () => within(screen.getByRole('group')).getAllByRole('button');

describe('<D11View>', () => {
  it('is registered as the numerals drill for both C8 skills', async () => {
    const drill = getDrill('numerals');
    expect(await resolveView(drill!.render)).toBe(D11View);
    expect(drill?.skills).toEqual(['C8.numerals-major', 'C8.nashville']);
    expect(drill?.inputModes).toEqual(['choice', 'keyboard']);
  });

  it('asks for the chord a numeral names in the key', () => {
    const { onAnswer } = renderView(prompt());
    expect(screen.getByTestId('d11-key')).toHaveTextContent('D major');
    expect(screen.getByTestId('d11-cue')).toHaveAccessibleName('vi: 6 minor');
    expect(screen.getByText('Which chord is vi in D major?')).toBeInTheDocument();
    expect(choices()).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'B minor' }));
    expect(onAnswer).toHaveBeenCalledWith('Bm');
    // The key's chords stay hidden until answered (rule 4).
    expect(screen.queryByTestId('d11-strip')).toBeNull();
    expect(screen.queryByTestId('d11-convention')).toBeNull();
  });

  it('asks for the numeral of a chord', () => {
    const { onAnswer } = renderView(prompt('numeral-of:vii°@key=Bb', 2));
    expect(screen.getByTestId('d11-cue')).toHaveAccessibleName('A diminished');
    expect(screen.getByTestId('d11-cue')).toHaveTextContent('Adim');
    expect(choices().map((b) => b.textContent)).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii',
      'vii°',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '7 diminished' }));
    expect(onAnswer).toHaveBeenCalledWith('vii°');
  });

  it('sets a Nashville suffix apart from its number', () => {
    renderView(prompt('nashville:6m@key=D'));
    const cue = screen.getByTestId('d11-cue');
    expect(cue).toHaveAccessibleName('Nashville 6 minor');
    expect(cue.querySelector('span span')).toHaveTextContent('m');
    expect(screen.getByText('Which chord is Nashville 6m in D major?')).toBeInTheDocument();
  });

  it('states how a minor key is numbered', () => {
    renderView(prompt('numeral-of:bVII@key=Am'));
    expect(screen.getByTestId('d11-convention')).toHaveTextContent(
      'Numbered from A major, so the chords on C, F and G are ♭III, ♭VI and ♭VII.',
    );
    expect(screen.getByTestId('d11-cue')).toHaveTextContent('G');
  });

  it('answers from the keyboard by place, and not once answered', () => {
    const p = prompt();
    const { onAnswer } = renderView(p);
    fireEvent.keyDown(window, { key: '9' });
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenCalledWith(p.choices[1]);
    expect(choices()[1]).toHaveAttribute('aria-keyshortcuts', '2');
  });

  it('walks through the answer on the first rep, with the key’s chords', () => {
    renderView(prompt(), { guided: true });
    expect(screen.getByText(/vi is the chord on the 6th note of D major/)).toBeInTheDocument();
    expect(screen.getByText(/to continue/)).toHaveTextContent('Tap Bm to continue.');
    const strip = screen.getByTestId('d11-strip');
    expect(within(strip).getByLabelText('vi: Bm, the answer')).toBeInTheDocument();
  });

  it('marks a right answer', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'Bm') });
    expect(screen.getByRole('button', { name: 'B minor' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    for (const b of choices()) expect(b).toBeDisabled();
    expect(screen.queryByTestId('d11-explanation')).toBeNull();
    expect(within(screen.getByTestId('d11-strip')).getAllByRole('listitem')).toHaveLength(7);
  });

  it('marks a wrong answer, shows the answer and explains it', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, 'A') });
    expect(screen.getByRole('button', { name: 'A major' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: 'B minor' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    const strip = screen.getByTestId('d11-strip');
    expect(within(strip).getByLabelText('V: A, your answer')).toHaveAttribute(
      'data-state',
      'given',
    );
    expect(within(strip).getByLabelText('vi: Bm, the answer')).toBeInTheDocument();
    expect(screen.getByTestId('d11-explanation')).toHaveTextContent('A is V in D major.');
    fireEvent.keyDown(window, { key: '1' });
  });

  it('puts the context panel beside the prompt on iPad landscape, below it otherwise', () => {
    const { unmount } = render(
      <D11View
        prompt={prompt()}
        guideLevel={0}
        guided={false}
        handedness="right"
        sizeClass="regular-wide"
        tuning={STANDARD_TUNING}
        feedback={null}
        onAnswer={() => {}}
        aside={<aside data-testid="context-panel" />}
      />,
    );
    const drill = screen.getByTestId('d11-drill');
    expect(drill.lastElementChild).not.toBe(screen.getByTestId('context-panel'));
    unmount();
    renderView(prompt(), { sizeClass: 'regular', withAside: true });
    expect(screen.getByTestId('d11-drill').lastElementChild).toBe(
      screen.getByTestId('context-panel'),
    );
    expect(screen.getByTestId('d11-drill')).toHaveAttribute('data-size-class', 'regular');
  });
});
