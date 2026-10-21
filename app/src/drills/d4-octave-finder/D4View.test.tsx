import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { D4View } from './D4View';
import { d4Check, d4MakePrompt, type D4Answer, type D4Prompt } from './logic';

const prompt = (id: string, scopeLevel = 0) =>
  d4MakePrompt(
    { id, skillId: 'C1.octaves' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0.99 },
  );

function view(
  p: D4Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    compactFrets?: number;
    feedback?: DrillFeedback<D4Answer> | null;
  } = {},
) {
  const onAnswer = vi.fn();
  const props = {
    prompt: p,
    guideLevel: over.guideLevel ?? 3,
    guided: over.guided ?? false,
    handedness: 'right',
    sizeClass: over.sizeClass ?? 'regular-wide',
    compactFrets: over.compactFrets ?? 5,
    tuning: STANDARD_TUNING,
    feedback: over.feedback ?? null,
    onAnswer,
  } as const;
  const utils = render(<D4View {...props} />);
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
  }));
const fb = (p: D4Prompt, answer: D4Answer): DrillFeedback<D4Answer> => ({
  answer,
  result: d4Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });

describe('<D4View> single octave', () => {
  it('shows the dot and answers with the tapped cell', () => {
    const p = prompt('octave:s6f5→s4');
    const { onAnswer } = view(p);
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent('Tap the octave of A on string 4');
    expect(markers('root')).toEqual([at(6, 5)]);
    expect(markers('target')).toEqual([]);
    tap(at(4, 7));
    expect(onAnswer).toHaveBeenCalledWith([at(4, 7)]);
  });

  it('ignores taps on dimmed strings until the scope widens', () => {
    const narrow = view(prompt('octave:s6f5→s4'));
    tap(at(3, 2));
    expect(narrow.onAnswer).not.toHaveBeenCalled();
    narrow.unmount();
    const wide = view(prompt('octave:s6f5→s4', 1));
    tap(at(3, 2));
    expect(wide.onAnswer).toHaveBeenCalledWith([at(3, 2)]);
  });

  it('marks the octave on a guided rep, and both cells in feedback', () => {
    const p = prompt('octave:s4f5→s2');
    const { unmount } = view(p, { guided: true });
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent(
      'This is the octave of G on string 2. Tap it to continue.',
    );
    expect(markers('target')).toEqual([at(2, 8)]);
    unmount();

    view(p, { feedback: fb(p, [at(2, 7)]) });
    expect(markers('correct')).toEqual([at(2, 8)]);
    expect(markers('wrong')).toEqual([at(2, 7)]);
    expect(screen.getByTestId('d4-explain')).toHaveTextContent(/without the G–B shift/);
  });

  it('names sharps with ♯ in the prompt, markers and feedback', () => {
    const p = prompt('octave:s6f2→s4');
    const { rerender, props } = view(p);
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent('Tap the octave of F♯ on string 4');
    expect(screen.getByTestId('d4-explain')).toHaveTextContent(
      'Start from the F♯ in the square and use octave shapes.',
    );
    expect(screen.queryByTestId('d4-rule')).toBeNull();
    rerender(<D4View {...props} feedback={fb(p, [at(4, 5)])} />);
    expect(screen.getByTestId('d4-explain')).toHaveTextContent(
      "You tapped G (string 4, fret 5). This shape doesn't cross the G–B strings",
    );
    expect(screen.getByTestId('d4-explain')).toHaveTextContent(
      '2 strings up (toward string 1), 2 frets higher.',
    );
    expect(neck().querySelector('[data-testid="marker-root"]')).toHaveTextContent('F♯');
    expect(screen.queryByText(/#/)).toBeNull();
  });

  it('shows a window around the dot on compact screens', () => {
    view(prompt('octave:s6f5→s4'), { sizeClass: 'compact' });
    expect(neck().getAttribute('data-fret-from')).toBe('2');
    expect(neck().getAttribute('data-fret-to')).toBe('8');
    expect(screen.queryByTestId('d4-count')).toBeNull();
  });
});

describe('<D4View> every octave', () => {
  const G = 'octaves:G';

  it('marks each target as it is found and answers on the last one', () => {
    const p = prompt(G);
    const { onAnswer } = view(p);
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent('Tap every G');
    expect(markers('root')).toEqual([p.source]);
    expect(neck().getAttribute('data-fret-to')).toBe('15');
    expect(screen.getByTestId('d4-count')).toHaveTextContent('Found 0 of 6');
    expect(screen.getByTestId('d4-rule')).toHaveTextContent(
      "Tap them in any order. A wrong tap ends the round; tap Done if you can't find the rest.",
    );

    const [first, ...rest] = p.targets;
    tap(first!);
    expect(markers('correct')).toEqual([first]);
    expect(screen.getByTestId('d4-count')).toHaveTextContent('Found 1 of 6');
    // Tapping the dot or a found cell again does nothing.
    tap(p.source);
    tap(first!);
    expect(onAnswer).not.toHaveBeenCalled();
    for (const t of rest) tap(t);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(p.targets);
  });

  it('says how the round ends on compact screens too', () => {
    view(prompt(G), { sizeClass: 'compact' });
    expect(screen.queryByTestId('d4-explain')).toBeNull();
    expect(screen.getByTestId('d4-rule')).toHaveTextContent(/A wrong tap ends the round/);
  });

  it('hides the target count at low guide levels', () => {
    view(prompt(G), { guideLevel: 1 });
    expect(screen.getByTestId('d4-count')).toHaveTextContent(/^Found 0$/);
  });

  it('ends the round on a wrong tap', () => {
    const p = prompt(G);
    const { onAnswer } = view(p);
    tap(p.targets[0]!);
    tap(at(4, 6));
    expect(onAnswer).toHaveBeenCalledWith([p.targets[0], at(4, 6)]);
  });

  it('ignores the dimmed frets above 12', () => {
    const { onAnswer } = view(prompt(G));
    tap(at(1, 15));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('answers what was found when the learner is done', () => {
    const p = prompt(G);
    const { onAnswer } = view(p);
    tap(p.targets[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onAnswer).toHaveBeenCalledWith([p.targets[0]]);
  });

  it('shows found, missed and wrong cells in feedback', () => {
    const p = prompt(G);
    const answer = [p.targets[0]!, at(4, 6)];
    view(p, { feedback: fb(p, answer) });
    expect(markers('correct')).toEqual([p.targets[0]]);
    expect(markers('ghost')).toHaveLength(p.targets.length - 1);
    expect(markers('wrong')).toEqual([at(4, 6)]);
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(screen.getByTestId('d4-explain')).toHaveTextContent(/You tapped G♯/);
    expect(screen.queryByTestId('d4-rule')).toBeNull();
  });

  it('marks every target on a guided rep', () => {
    const p = prompt(G);
    view(p, { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent(
      'Here is every G. Tap each one to continue.',
    );
    expect(markers('target')).toHaveLength(6);
    tap(p.targets[0]!);
    expect(markers('target')).toHaveLength(5);
    expect(screen.getByTestId('d4-count')).toHaveTextContent('Found 1 of 6');
  });

  it('runs region by region on compact screens', () => {
    const p = prompt(G);
    expect(p.source).toEqual(at(6, 3));
    const { onAnswer } = view(p, { sizeClass: 'compact' });
    const region = () => [
      neck().getAttribute('data-fret-from'),
      neck().getAttribute('data-fret-to'),
    ];
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent('Tap every G in frets 0–4');
    expect(screen.getByTestId('d4-region')).toHaveTextContent('Region 1 of 3');
    expect(region()).toEqual(['0', '4']);

    // Region 1: G on string 1 fret 3 and string 3 fret 0 (the dot is string 6 fret 3).
    tap(at(1, 3));
    expect(screen.getByTestId('d4-region')).toHaveTextContent('Region 1 of 3');
    tap(at(3, 0));
    // Region done: on to frets 5–8, shown in a 5-fret window.
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent('Tap every G in frets 5–8');
    expect(region()).toEqual(['5', '9']);
    tap(at(4, 5));
    tap(at(2, 8));
    // Last region shows frets 8–12, with fret 8 dimmed and inert.
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent('Tap every G in frets 9–12');
    expect(region()).toEqual(['8', '12']);
    tap(at(2, 8));
    tap(at(5, 10));
    expect(onAnswer).not.toHaveBeenCalled();
    tap(at(3, 12));
    expect(onAnswer).toHaveBeenCalledWith([
      at(1, 3),
      at(3, 0),
      at(4, 5),
      at(2, 8),
      at(5, 10),
      at(3, 12),
    ]);
  });

  it('starts at the dot, and "Done" ends the round with what was found', () => {
    const p = prompt('octaves:C');
    // The dot is string 6 fret 8; frets 5–8 also hold C at s3f5 and s1f8.
    expect(p.source).toEqual(at(6, 8));
    const { onAnswer } = view(p, { sizeClass: 'compact' });
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent('Tap every C in frets 5–8');
    expect(markers('root')).toEqual([at(6, 8)]);
    tap(at(3, 5));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onAnswer).toHaveBeenCalledWith([at(3, 5)]);
  });

  it('runs the whole range at once when the compact window is wide enough', () => {
    view(prompt(G), { sizeClass: 'compact', compactFrets: 13 });
    expect(screen.getByTestId('d4-prompt')).toHaveTextContent(/^Tap every G$/);
    expect(screen.queryByTestId('d4-region')).toBeNull();
  });

  it('shows the context panel below the neck off regular-wide', () => {
    const aside = <aside data-testid="context-panel" />;
    const p = prompt(G);
    for (const sizeClass of ['regular', 'compact'] as const) {
      const { container, unmount } = render(
        <D4View
          prompt={p}
          guideLevel={2}
          guided={false}
          handedness="right"
          sizeClass={sizeClass}
          tuning={STANDARD_TUNING}
          feedback={null}
          onAnswer={vi.fn()}
          aside={aside}
        />,
      );
      const panel = screen.getByTestId('context-panel');
      const neckArea = container.querySelector('svg')!.parentElement!;
      expect(
        neckArea.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      unmount();
    }
  });
});
