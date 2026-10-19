import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import type { DrillFeedback } from '../types';
import { D10View } from './D10View';
import { d10Check, d10MakePrompt, type D10Answer, type D10Prompt } from './logic';

/** Returns `values` in turn, then the last one for ever. */
const seq =
  (...values: number[]) =>
  () =>
    (values.length > 1 ? values.shift() : values[0]) ?? 0;

const prompt = (id: string, rng: () => number = () => 0, scopeLevel = 0) =>
  d10MakePrompt(
    { id, skillId: 'C6.major-shapes' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng },
  );
/** "After the A shape of C, which comes next?" (answer: G). */
const next = () => prompt('caged:G-shape@major', seq(0.6, 0, 0, 0));

function view(
  p: D10Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<D10Answer> | null;
  } = {},
) {
  const onAnswer = vi.fn();
  const props = {
    prompt: p,
    guideLevel: over.guideLevel ?? 1,
    guided: over.guided ?? false,
    handedness: 'right',
    sizeClass: over.sizeClass ?? 'regular-wide',
    compactFrets: 5,
    tuning: STANDARD_TUNING,
    feedback: over.feedback ?? null,
    onAnswer,
  } as const;
  const utils = render(<D10View {...props} />);
  return { ...utils, onAnswer };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard:/ });
const markers = (style: string) =>
  [...neck().querySelectorAll(`[data-testid="marker-${style}"]`)].map((m) => ({
    string: Number(m.getAttribute('data-string')),
    fret: Number(m.getAttribute('data-fret')),
    label: m.textContent,
  }));
const cells = (style: string) => markers(style).map((m) => `s${m.string}f${m.fret}`);
const fb = (p: D10Prompt, answer: D10Answer): DrillFeedback<D10Answer> => ({
  answer,
  result: d10Check(p, answer),
});
const choice = (shape: string) => screen.getByRole('button', { name: `${shape} shape` });

describe('<D10View>', () => {
  it('draws the shape with root squares and asks which it is, without naming it', () => {
    const { onAnswer } = view(prompt('caged:C-shape@major'));
    expect(screen.getByTestId('d10-prompt')).toHaveTextContent(
      'Which CAGED shape is this C chord?',
    );
    expect(cells('root')).toEqual(['s5f3', 's2f1']);
    expect(cells('tone')).toEqual(['s4f2', 's3f0', 's1f0']);
    // Below guide level 2 the degrees stay hidden (rule 9).
    expect(markers('third')).toEqual([]);
    expect(screen.getByTestId('d10-explain')).toHaveTextContent('The squares are the roots, C.');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['C', 'A', 'G']);
    // The iPad shows the whole neck.
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '15');
    fireEvent.click(choice('A'));
    expect(onAnswer).toHaveBeenCalledWith('A');
  });

  it('labels degrees by shape while guides are up', () => {
    view(prompt('caged:C-shape@major'), { guideLevel: 2 });
    expect(markers('third').map((m) => m.label)).toEqual(['3', '3']);
    expect(markers('fifth')).toEqual([{ string: 3, fret: 0, label: '5' }]);
    expect(markers('root').map((m) => m.label)).toEqual(['C', 'C']);
  });

  it('drops the hint at guide level 0', () => {
    view(prompt('caged:C-shape@major'), { guideLevel: 0 });
    expect(screen.getByTestId('d10-explain')).toHaveTextContent(/^$/);
  });

  it('names the shape in a worked example (rule 8)', () => {
    view(prompt('caged:A-shape@major'), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d10-prompt')).toHaveTextContent(
      'This is the A shape of C. Tap A to continue.',
    );
    expect(markers('fifth')).toHaveLength(2);
  });

  it('asks for the next shape up the neck from a named one', () => {
    view(next());
    expect(screen.getByTestId('d10-prompt')).toHaveTextContent(
      'This is the A shape of C. Which shape comes next, up the neck?',
    );
    expect(screen.getByTestId('d10-explain')).toHaveTextContent('Up the neck is toward the body.');
    expect(cells('root')).toEqual(['s5f3', 's3f5']);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['C', 'G', 'E']);
  });

  it('asks for the one before, down the neck', () => {
    view(prompt('caged:A-shape@major', seq(0.9, 0, 0, 0)));
    expect(screen.getByTestId('d10-prompt')).toHaveTextContent(
      'This is the G shape of C. Which shape comes before it, down the neck?',
    );
    expect(screen.getByTestId('d10-explain')).toHaveTextContent('Down the neck is toward the nut.');
  });

  it('shows the next shape beside the shown one in a worked example', () => {
    view(next(), { guided: true });
    expect(screen.getByTestId('d10-prompt')).toHaveTextContent(
      'After the A shape of C comes the G shape. Tap G to continue.',
    );
    // The G shape by degree; the A shape's other notes stay as rings.
    expect(cells('root')).toEqual(['s6f8', 's3f5', 's1f8']);
    expect(cells('ghost')).toEqual(['s5f3', 's1f3']);
  });

  it('marks the pick and the answer after a wrong answer, and explains', () => {
    const p = next();
    view(p, { feedback: fb(p, 'C') });
    expect(choice('C')).toHaveAttribute('data-state', 'wrong');
    expect(choice('G')).toHaveAttribute('data-state', 'expected');
    expect(choice('E')).not.toHaveAttribute('data-state');
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
    expect(screen.getByTestId('d10-explain')).toHaveTextContent(
      'You picked the C shape. Up the neck the chain runs C A G E D',
    );
    expect(cells('root')).toEqual(['s6f8', 's3f5', 's1f8']);
  });

  it('marks a right answer and names the shape with its degrees', () => {
    const p = prompt('caged:A-shape@major');
    view(p, { feedback: fb(p, 'A') });
    expect(choice('A')).toHaveAttribute('data-state', 'correct');
    expect(screen.getByTestId('d10-explain')).toHaveTextContent(
      "That's the A shape of C: R 5 R 3 5 on strings 5–1.",
    );
    expect(markers('fifth')).toHaveLength(2);
  });

  it('answers by letter from a hardware keyboard, until the answer is in', () => {
    const p = prompt('caged:C-shape@major');
    const { onAnswer, rerender } = view(p);
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'g' });
    expect(onAnswer).toHaveBeenCalledWith('G');
    rerender(
      <D10View
        prompt={p}
        guideLevel={1}
        guided={false}
        handedness="right"
        sizeClass="regular-wide"
        tuning={STANDARD_TUNING}
        feedback={fb(p, 'G')}
        onAnswer={onAnswer}
      />,
    );
    fireEvent.keyDown(window, { key: 'c' });
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('shows 12 frets on iPad portrait and a window on compact, around both shapes', () => {
    const { unmount } = view(next(), { sizeClass: 'regular' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    unmount();
    view(next(), { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '3');
    expect(neck()).toHaveAttribute('data-fret-to', '9');
    expect(screen.getByTestId('d10-drill')).toHaveAttribute('data-ask', 'next');
  });

  it('places the session aside beside the prompt on iPad landscape, below elsewhere', () => {
    const aside = <aside data-testid="aside">help</aside>;
    const p = prompt('caged:C-shape@major');
    const base = {
      prompt: p,
      guideLevel: 1 as const,
      guided: false,
      handedness: 'right' as const,
      tuning: STANDARD_TUNING,
      feedback: null,
      onAnswer: () => {},
      aside,
    };
    const { rerender } = render(<D10View {...base} sizeClass="regular-wide" />);
    expect(screen.getByTestId('aside').previousElementSibling).toHaveClass(/top/);
    rerender(<D10View {...base} sizeClass="regular" />);
    expect(screen.getByTestId('aside').previousElementSibling).toHaveClass(/neckArea/);
  });
});
