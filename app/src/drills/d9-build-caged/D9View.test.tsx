import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { D9View } from './D9View';
import { d9Check, d9MakePrompt, type D9Answer, type D9Prompt } from './logic';

const prompt = (id: string) =>
  d9MakePrompt(
    { id, skillId: 'C6.triad-cores' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

function view(
  p: D9Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<D9Answer> | null;
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
  const utils = render(<D9View {...props} />);
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
const fb = (p: D9Prompt, answer: D9Answer): DrillFeedback<D9Answer> => ({
  answer,
  result: d9Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });

describe('<D9View>', () => {
  it('shows the root and asks for the triad core, without giving it away', () => {
    view(prompt('caged-core:A-shape@major'));
    expect(screen.getByTestId('d9-prompt')).toHaveTextContent(
      'Build the A-shape triad of C on strings 3–1',
    );
    expect(markers('root')).toEqual([{ string: 5, fret: 3, label: 'C' }]);
    expect(markers('target')).toEqual([]);
    // Every prompt says how the round ends and what Done does.
    expect(screen.getByTestId('d9-explain')).toHaveTextContent(
      "The square is the root, C, on string 5. Tap the notes in any order. A wrong tap ends the round; tap Done if you can't find the rest.",
    );
    // At guide level 1 the count hides the total (rule 9).
    expect(screen.getByTestId('d9-count')).toHaveTextContent(/^Found 0$/);
    // The iPad shows the whole neck, every fret live.
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '15');
    expect(neck().querySelectorAll('[data-testid="dimmed-fret"]')).toHaveLength(0);
  });

  it('marks each found note by degree, and answers at the last one', () => {
    const p = prompt('caged-core:A-shape@major');
    const { onAnswer } = view(p, { guideLevel: 3 });
    tap(at(5, 3)); // the given root is not an answer
    tap(at(3, 5));
    tap(at(3, 5)); // a repeat is ignored
    expect(markers('root')).toEqual([
      { string: 5, fret: 3, label: 'C' },
      { string: 3, fret: 5, label: 'R' },
    ]);
    expect(screen.getByTestId('d9-count')).toHaveTextContent('Found 1 of 3');
    tap(at(2, 5));
    expect(markers('third')).toEqual([{ string: 2, fret: 5, label: '3' }]);
    expect(onAnswer).not.toHaveBeenCalled();
    tap(at(1, 3));
    expect(onAnswer).toHaveBeenCalledWith([at(3, 5), at(2, 5), at(1, 3)]);
  });

  it('answers at the first wrong tap', () => {
    const { onAnswer } = view(prompt('caged:A-shape@major'));
    tap(at(5, 3));
    expect(onAnswer).not.toHaveBeenCalled();
    tap(at(4, 5));
    tap(at(2, 1));
    expect(onAnswer).toHaveBeenCalledWith([at(4, 5), at(2, 1)]);
  });

  it('ends the round with what was found on "Done"', () => {
    const { onAnswer } = view(prompt('caged:A-shape@major'));
    tap(at(4, 5));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onAnswer).toHaveBeenCalledWith([at(4, 5)]);
  });

  it('shows the whole shape with degree labels on a guided rep', () => {
    view(prompt('caged:C-shape@major'), { guided: true });
    expect(screen.getByTestId('d9-prompt')).toHaveTextContent(
      'This is the C shape of C. Tap each note to continue.',
    );
    expect(markers('target').map((m) => m.label)).toEqual(['3', '5', 'R', '3']);
    expect(screen.getByTestId('d9-count')).toHaveTextContent('Found 0 of 4');
    expect(neck()).toHaveAttribute('data-guide-level', '3');
  });

  it('says it is the A-shape triad on a guided core rep', () => {
    view(prompt('caged-core:A-shape@major'), { guided: true });
    expect(screen.getByTestId('d9-prompt')).toHaveTextContent(
      'This is the A-shape triad of C on strings 3–1. Tap each note to continue.',
    );
    // A worked example gives one clear instruction: no Done clause (rule 8).
    expect(screen.getByTestId('d9-explain')).toHaveTextContent(
      /^The square is the root, C, on string 5\. Tap the notes in any order\. A wrong tap ends the round\.$/,
    );
  });

  it('rings the missed notes and marks the wrong tap in feedback, naming the C shape', () => {
    const p = prompt('caged:A-shape@major');
    view(p, { feedback: fb(p, [at(4, 5), at(2, 1)]) });
    expect(markers('fifth')).toEqual([{ string: 4, fret: 5, label: '5' }]);
    expect(markers('ghost').map((m) => m.label)).toEqual(['R', '3', '5']);
    expect(markers('wrong')).toEqual([{ string: 2, fret: 1, label: 'C' }]);
    expect(screen.getByTestId('d9-explain')).toHaveTextContent('That note is in the C shape.');
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    // Feedback is inert.
    tap(at(3, 5));
    expect(markers('root')).toHaveLength(1);
  });

  it('centres a compact window on the root, without the hint line', () => {
    view(prompt('caged:A-shape@major'), { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '6');
    expect(screen.queryByTestId('d9-explain')).toBeNull();
  });

  it('shows 12 frets on iPad portrait, slid up for a high root, with the panel below', () => {
    render(
      <D9View
        prompt={prompt('caged:D-shape@major')}
        guideLevel={2}
        guided={false}
        handedness="right"
        sizeClass="regular"
        tuning={STANDARD_TUNING}
        feedback={null}
        onAnswer={() => {}}
        aside={<aside data-testid="aside" />}
      />,
    );
    // The D shape of C sits at frets 10–13, so the 12-fret neck shows 1–13.
    expect(neck()).toHaveAttribute('data-fret-from', '1');
    expect(neck()).toHaveAttribute('data-fret-to', '13');
    expect(screen.getByTestId('aside')).toBeInTheDocument();
    expect(screen.getByTestId('d9-prompt')).toHaveTextContent(
      'Build the D shape of C from this root',
    );
  });

  it('starts a new round when the prompt changes', () => {
    const p = prompt('caged:A-shape@major');
    const { rerender, props } = view(p);
    tap(at(4, 5));
    expect(markers('fifth')).toHaveLength(1);
    rerender(<D9View {...props} prompt={prompt('caged:A-shape@major')} />);
    expect(markers('fifth')).toHaveLength(0);
  });
});
