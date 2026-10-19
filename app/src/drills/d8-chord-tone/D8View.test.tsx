import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { ChordTonePanel } from './ContextPanel';
import { D8View } from './D8View';
import { d8Check, d8MakePrompt, type D8Answer, type D8Prompt } from './logic';

/** A cycling rng: the first value picks the shape, the second the root (0.75: A). */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

const prompt = (id: string, rng = seq(0, 0.75)) =>
  d8MakePrompt(
    { id, skillId: 'C5.tones-triads' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

function view(
  p: D8Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<D8Answer> | null;
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
  const utils = render(<D8View {...props} />);
  return { ...utils, onAnswer };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard:/ });
const cell = (p: Position) =>
  neck().querySelector(`[data-cell="s${p.string}f${p.fret}"]`) as SVGElement;
const tap = (p: Position) => fireEvent.pointerDown(cell(p));
const markers = (style: string) =>
  [...neck().querySelectorAll(`[data-testid="marker-${style}"]`)].map((m) => ({
    string: Number(m.getAttribute('data-string')),
    fret: Number(m.getAttribute('data-fret')),
    label: m.textContent,
  }));
const fb = (p: D8Prompt, answer: D8Answer): DrillFeedback<D8Answer> => ({
  answer,
  result: d8Check(p, answer),
});

describe('<D8View> tap mode', () => {
  it('draws the shape and asks for a degree without marking it', () => {
    // Am7, A shape: x02010.
    view(prompt('chord-tone:b3@m7'));
    expect(screen.getByTestId('d8-prompt')).toHaveTextContent('Tap the ♭3rd of Am7');
    expect(screen.getByTestId('d8-explain')).toHaveTextContent('Open chord, A shape');
    expect(markers('tone')).toHaveLength(5);
    expect(markers('target')).toEqual([]);
    // Level 1: no roots, no outline, no labels.
    expect(markers('root')).toEqual([]);
    expect(screen.queryByTestId('shape-outline')).toBeNull();
    expect(markers('tone').every((m) => m.label === '')).toBe(true);
    expect(neck()).toHaveAttribute('data-fret-to', '15');
  });

  it('outlines the shape and squares its roots from guide level 2, naming notes at 3', () => {
    view(prompt('chord-tone:b3@m7'), { guideLevel: 3 });
    expect(screen.getByTestId('shape-outline')).toBeInTheDocument();
    expect(markers('root')).toEqual([{ string: 5, fret: 0, label: 'A' }]);
    expect(markers('tone').map((m) => m.label)).toEqual(['E', 'G', 'C', 'E']);
    expect(screen.getByTestId('d8-explain')).toHaveTextContent('The squares are its roots.');
    expect(cell({ string: 5, fret: 0 })).toHaveAccessibleName('string 5, fret 0, root');
    expect(cell({ string: 2, fret: 1 })).toHaveAccessibleName('string 2, fret 1, in the shape');
    expect(cell({ string: 2, fret: 5 })).toHaveAccessibleName('string 2, fret 5');
  });

  it('never squares the roots when the root is the answer', () => {
    view(prompt('chord-tone:1@major'), { guideLevel: 3 });
    expect(markers('root')).toEqual([]);
    expect(screen.getByTestId('d8-explain')).not.toHaveTextContent('squares');
  });

  it('answers with the tapped cell', () => {
    const { onAnswer } = view(prompt('chord-tone:b3@m7'));
    tap({ string: 2, fret: 1 });
    expect(onAnswer).toHaveBeenCalledWith({ string: 2, fret: 1 });
  });

  it('marks the targets in a worked example', () => {
    view(prompt('chord-tone:5@major', seq(0.2, 0.75)), { guided: true });
    // A major, A shape: two 5ths (strings 4 and 1).
    expect(screen.getByTestId('d8-prompt')).toHaveTextContent(
      'The 5ths of A are marked. Tap one to continue.',
    );
    expect(markers('target')).toEqual([
      { string: 4, fret: 2, label: '5' },
      { string: 1, fret: 0, label: '5' },
    ]);
  });

  it('names every degree after an answer, marking a wrong tap', () => {
    const p = prompt('chord-tone:b3@m7');
    const fifth = { string: 4, fret: 2 };
    view(p, { feedback: fb(p, fifth) });
    expect(markers('wrong')).toEqual([{ ...fifth, label: '5' }]);
    expect(markers('correct')).toEqual([{ string: 2, fret: 1, label: '♭3' }]);
    expect(markers('root').map((m) => m.label)).toEqual(['R']);
    expect(markers('seventh')).toEqual([{ string: 3, fret: 0, label: '♭7' }]);
    expect(screen.getByTestId('d8-explain')).toHaveTextContent(
      'You tapped the 5th, E. Am7 here is R 5 ♭7 ♭3 5 from the low string.',
    );
  });

  it('marks a tap off the shape with its note', () => {
    const p = prompt('chord-tone:b3@m7');
    const off = { string: 1, fret: 8 };
    const { onAnswer } = view(p, { feedback: fb(p, off) });
    expect(markers('wrong')).toEqual([{ ...off, label: 'C' }]);
    tap(off);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('frames the shape on compact screens and drops the hint line', () => {
    view(prompt('chord-tone:b3@m7'), { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '4');
    expect(screen.queryByTestId('d8-explain')).toBeNull();
  });
});

describe('<D8View> name mode', () => {
  // The A shape (second of five) at A.
  const named = () => prompt('chord-tone-name:b3@minor', seq(0.2, 0.75, 0));

  it('rings one note and offers both 3rds', () => {
    // Am, A shape: x02210; the ♭3 is on string 2.
    view(named(), { guideLevel: 3 });
    expect(screen.getByTestId('d8-prompt')).toHaveTextContent(
      'Which chord tone of Am is the ringed note?',
    );
    expect(markers('target')).toEqual([{ string: 2, fret: 1, label: '' }]);
    expect(neck()).toHaveAccessibleName(
      'Fretboard: Am, Open chord, A shape; the ringed note is on string 2, fret 1',
    );
    const group = screen.getByRole('group', { name: /^Which chord tone/ });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['R', '♭3', '3', '5']);
    expect(within(group).getByRole('button', { name: 'flat 3rd' })).toHaveAttribute(
      'aria-keyshortcuts',
      '2',
    );
    // The neck isn't an answer surface here.
    expect(cell({ string: 2, fret: 1 })).not.toHaveAttribute('role', 'button');
  });

  it('answers by button and by number key', () => {
    const { onAnswer, unmount } = view(named());
    fireEvent.click(screen.getByRole('button', { name: '3rd' }));
    expect(onAnswer).toHaveBeenLastCalledWith('3');
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenLastCalledWith('b3');
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    fireEvent.keyDown(window, { key: '9' });
    expect(onAnswer).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('names the degree in a worked example', () => {
    view(named(), { guided: true });
    expect(screen.getByTestId('d8-prompt')).toHaveTextContent(
      'The ringed note is the ♭3rd of Am. Tap ♭3 to continue.',
    );
    expect(markers('target')).toEqual([{ string: 2, fret: 1, label: '♭3' }]);
  });

  it('shows the right and wrong buttons after a wrong answer', () => {
    const p = named();
    const { onAnswer } = view(p, { feedback: fb(p, '3') });
    expect(screen.getByRole('button', { name: '3rd' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: 'flat 3rd' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    expect(markers('correct')).toEqual([{ string: 2, fret: 1, label: '♭3' }]);
    expect(screen.getByTestId('d8-explain')).toHaveTextContent(
      'The ringed note is C, the ♭3rd, not the 3rd.',
    );
    fireEvent.keyDown(window, { key: '1' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('marks the right button after a right answer', () => {
    const p = named();
    view(p, { feedback: fb(p, 'b3') });
    expect(screen.getByRole('button', { name: 'flat 3rd' })).toHaveAttribute(
      'data-state',
      'correct',
    );
  });
});

describe('<ChordTonePanel>', () => {
  const panel = (
    p: D8Prompt,
    guideLevel: GuideLevel,
    over: { guided?: boolean; answered?: boolean } = {},
  ) =>
    render(
      <ChordTonePanel
        prompt={p}
        guideLevel={guideLevel}
        guided={over.guided ?? false}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={over.answered ? fb(p, 'b3') : null}
      />,
    );

  it('lists the formula, naming the notes from guide level 2', () => {
    const p = prompt('chord-tone-name:b7@m7', seq(0, 0.75, 0));
    const { rerender } = panel(p, 1);
    const list = screen.getByRole('list', { name: 'Chord tones of Am7' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['R', '♭3', '5', '♭7']);
    rerender(
      <ChordTonePanel
        prompt={p}
        guideLevel={3}
        guided={false}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['RA', '♭3C', '5E', '♭7G']);
    expect(list.querySelector('[aria-current]')).toBeNull();
  });

  it('marks the asked degree only once answered, or in a worked example', () => {
    const p = prompt('chord-tone-name:b7@m7', seq(0, 0.75, 0));
    panel(p, 2, { answered: true });
    expect(screen.getByRole('listitem', { current: true })).toHaveTextContent('♭7');
  });
});
