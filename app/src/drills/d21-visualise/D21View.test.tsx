import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { D21View } from './D21View';
import { d21Check, d21MakePrompt, type D21Answer, type D21Prompt } from './logic';

// rng 0 at scope 0: the A shape of C, at fret 3 (x-3-5-5-5-3), roots at s5f3 and s3f5.
const prompt = (id = 'caged:A-shape@major') =>
  d21MakePrompt(
    { id, skillId: 'C6.major-shapes' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

function view(
  p: D21Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<D21Answer> | null;
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
  const utils = render(<D21View {...props} />);
  return { ...utils, onAnswer, props };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard:/ });
const cell = (string: number, fret: number) =>
  neck().querySelector(`[data-cell="s${string}f${fret}"]`) as SVGElement;
const tap = (p: Position) => fireEvent.pointerDown(cell(p.string, p.fret));
const markers = (style: string) =>
  [...neck().querySelectorAll(`[data-testid="marker-${style}"]`)].map((m) => ({
    string: Number(m.getAttribute('data-string')),
    fret: Number(m.getAttribute('data-fret')),
    label: m.textContent,
  }));
const allMarkers = () => neck().querySelectorAll('[data-testid^="marker-"]');
const fb = (p: D21Prompt, answer: D21Answer): DrillFeedback<D21Answer> => ({
  answer,
  result: d21Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });

describe('<D21View>', () => {
  it('names the shape and position and leaves the neck blank (rule 4)', () => {
    const p = prompt();
    expect(p.position).toBe(3);
    view(p);
    expect(screen.getByTestId('d21-prompt')).toHaveTextContent(
      'Picture the A shape at fret 3, then tap every root.',
    );
    expect(screen.getByTestId('d21-explain')).toHaveTextContent(/Fret 3 is its lowest fret/);
    expect(allMarkers()).toHaveLength(0);
    // Nothing names the chord before the answer.
    expect(screen.queryByText(/\bC\b/)).toBeNull();
    expect(neck()).toHaveAccessibleName(
      'Fretboard: picture the A shape at fret 3 and tap every root',
    );
    // At guide level 1 the count hides the total (rule 9).
    expect(screen.getByTestId('d21-count')).toHaveTextContent(/^Found 0$/);
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '15');
  });

  it('marks each found root by shape, and answers at the last one', () => {
    const p = prompt();
    const { onAnswer } = view(p, { guideLevel: 2 });
    expect(screen.getByTestId('d21-count')).toHaveTextContent('Found 0 of 2');
    tap(at(5, 3));
    tap(at(5, 3)); // a second tap on a found root does nothing
    expect(markers('root')).toEqual([{ string: 5, fret: 3, label: 'R' }]);
    expect(screen.getByTestId('d21-count')).toHaveTextContent('Found 1 of 2');
    expect(onAnswer).not.toHaveBeenCalled();
    tap(at(3, 5));
    expect(onAnswer).toHaveBeenCalledWith([at(5, 3), at(3, 5)]);
  });

  it('answers at the first wrong tap, and on Done', () => {
    const p = prompt();
    const wrong = view(p);
    tap(at(2, 4));
    expect(wrong.onAnswer).toHaveBeenCalledWith([at(2, 4)]);
    wrong.unmount();

    const done = view(p);
    tap(at(5, 3));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(done.onAnswer).toHaveBeenCalledWith([at(5, 3)]);
  });

  it('draws the shape in the worked example, for the learner to copy', () => {
    view(prompt(), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d21-prompt')).toHaveTextContent(
      'This is the A shape of C at fret 3. Tap every root to continue.',
    );
    expect(markers('target').map((m) => [m.string, m.fret])).toEqual([
      [5, 3],
      [3, 5],
    ]);
    expect(markers('fifth')).toHaveLength(2);
    expect(markers('third')).toEqual([{ string: 2, fret: 5, label: '3' }]);
    expect(screen.getByTestId('d21-count')).toHaveTextContent('Found 0 of 2');
  });

  it('shows the whole shape by degree in feedback, ringing what was missed', () => {
    const p = prompt();
    // The C shape at fret 3 roots at string 2, fret 4.
    view(p, { feedback: fb(p, [at(5, 3), at(2, 4)]) });
    expect(markers('root')).toEqual([{ string: 5, fret: 3, label: 'R' }]);
    expect(markers('ghost')).toEqual([{ string: 3, fret: 5, label: 'R' }]);
    expect(markers('wrong')).toEqual([{ string: 2, fret: 4, label: 'D♯' }]);
    expect(markers('fifth')).toHaveLength(2);
    expect(screen.getByTestId('d21-explain')).toHaveTextContent(
      "You tapped string 2, fret 4. That's a root of the C shape at fret 3.",
    );
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    // A tap after the answer does nothing.
    tap(at(3, 5));
    expect(markers('ghost')).toHaveLength(1);
  });

  it('follows the position on iPad portrait and phones', () => {
    const p = prompt();
    const portrait = view(p, { sizeClass: 'regular' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    portrait.unmount();
    view(p, { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '2');
    expect(neck()).toHaveAttribute('data-fret-to', '8');
    // Compact keeps the height for the neck: no hint line before an answer.
    expect(screen.queryByTestId('d21-explain')).toBeNull();
  });

  it('starts a new round when the prompt changes', () => {
    const p = prompt();
    const { rerender, props } = view(p);
    tap(at(5, 3));
    expect(markers('root')).toHaveLength(1);
    rerender(<D21View {...props} prompt={prompt('caged:E-shape@major')} />);
    expect(allMarkers()).toHaveLength(0);
  });
});
