import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { D37View } from './D37View';
import { d37Check, d37MakePrompt, type D37Answer, type D37Prompt } from './logic';

const prompt = (id: string, scopeLevel = 1, r = 0) =>
  d37MakePrompt(
    { id, skillId: 'C5.neck-triads' },
    { tuning: STANDARD_TUNING, accidentalPref: 'flat', scopeLevel, rng: () => r },
  );

function view(
  p: D37Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    compactFrets?: number;
    feedback?: DrillFeedback<D37Answer> | null;
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
  const utils = render(<D37View {...props} />);
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
const where = (ms: { string: number; fret: number }[]) => ms.map((m) => `s${m.string}f${m.fret}`);
const fb = (p: D37Prompt, answer: D37Answer): DrillFeedback<D37Answer> => ({
  answer,
  result: d37Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });
const range = () => [neck().getAttribute('data-fret-from'), neck().getAttribute('data-fret-to')];

describe('<D37View> every note of a chord', () => {
  const C = 'chord-tones:C';

  it('names the chord, marks each found note by its degree and answers on the last', () => {
    const p = prompt(C);
    const { onAnswer } = view(p);
    expect(screen.getByTestId('d37-prompt')).toHaveTextContent(/^Tap every note of C major$/);
    expect(neck()).toHaveAccessibleName('Fretboard: tap every note of C major');
    expect(range()).toEqual(['0', '15']);
    expect(screen.getByTestId('d37-count')).toHaveTextContent('Found 0 of 21');
    // Nothing is drawn before a tap: the targets are the recall.
    expect(neck().querySelectorAll('[data-testid^="marker-"]')).toHaveLength(0);

    // s6f0 is E (the 3rd), s2f1 is C (the root), s3f0 is G (the 5th).
    tap(at(6, 0));
    tap(at(2, 1));
    tap(at(3, 0));
    expect(markers('third')).toEqual([{ string: 6, fret: 0, label: '3' }]);
    expect(markers('root')).toEqual([{ string: 2, fret: 1, label: 'R' }]);
    expect(markers('fifth')).toEqual([{ string: 3, fret: 0, label: '5' }]);
    expect(screen.getByTestId('d37-count')).toHaveTextContent('Found 3 of 21');
    expect(cell(6, 0)).toHaveAccessibleName('string 6, fret 0, found: 3rd');

    // Tapping a found cell again does nothing.
    tap(at(6, 0));
    expect(onAnswer).not.toHaveBeenCalled();
    for (const t of p.targets) tap(t);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0]![0]).toHaveLength(21);
  });

  it('ends the round on the first wrong tap', () => {
    const p = prompt(C);
    const { onAnswer } = view(p);
    tap(at(6, 0));
    tap(at(6, 1));
    expect(onAnswer).toHaveBeenCalledWith([at(6, 0), at(6, 1)]);
  });

  it('ignores the dimmed frets above 12', () => {
    const { onAnswer } = view(prompt(C));
    tap(at(1, 15));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('answers what was found on "Done", and hides the count at low guide levels', () => {
    const p = prompt(C);
    const { onAnswer } = view(p, { guideLevel: 1 });
    expect(screen.getByTestId('d37-count')).toHaveTextContent(/^Found 0$/);
    tap(at(6, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onAnswer).toHaveBeenCalledWith([at(6, 0)]);
  });

  it('shows found notes by degree, rings the missed ones and marks wrong taps', () => {
    const p = prompt(C);
    view(p, { feedback: fb(p, [at(6, 0), at(4, 1)]) });
    expect(markers('third')).toEqual([{ string: 6, fret: 0, label: '3' }]);
    const ghosts = markers('ghost');
    expect(ghosts).toHaveLength(20);
    // Missed notes keep their degree labels: R, 3 and 5.
    expect(new Set(ghosts.map((g) => g.label))).toEqual(new Set(['R', '3', '5']));
    // s4f1 is E♭: the ♭3, which would make C minor.
    expect(markers('wrong')).toEqual([{ string: 4, fret: 1, label: 'E♭' }]);
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(screen.getByTestId('d37-explain')).toHaveTextContent(
      /You tapped E♭ \(string 4, fret 1\): the ♭3rd, which makes C minor/,
    );
  });

  it('marks every target by degree on a guided rep', () => {
    const p = prompt(C);
    view(p, { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d37-prompt')).toHaveTextContent(
      'Here is every note of C major, by degree. Tap each one to continue.',
    );
    expect(markers('target')).toHaveLength(21);
    expect(markers('target')[0]).toEqual({ string: 6, fret: 0, label: '3' });
    tap(at(6, 0));
    expect(markers('target')).toHaveLength(20);
    expect(screen.getByTestId('d37-count')).toHaveTextContent('Found 1 of 21');
  });

  it('drops the string names while an open string is an answer', () => {
    view(prompt(C), { guideLevel: 2 });
    expect(neck().getAttribute('data-guide-level')).toBe('1');
  });
});

describe('<D37View> a box: one CAGED shape’s span', () => {
  it('asks inside the box, dims the rest, and names the shape at guide level 2', () => {
    const p = prompt('chord-tones:C', 0, 0.5);
    expect(p.shape?.name).toBe('G');
    const { onAnswer } = view(p, { guideLevel: 2 });
    expect(screen.getByTestId('d37-prompt')).toHaveTextContent(
      'Tap every note of C major in frets 5–8',
    );
    expect(screen.getByTestId('d37-explain')).toHaveTextContent(
      'These frets hold the G shape of C major.',
    );
    tap(at(6, 3));
    expect(onAnswer).not.toHaveBeenCalled();
    for (const t of p.targets) tap(t);
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('outlines the shape in feedback on a chord card, not on a degree card', () => {
    const d = prompt('chord-tones:3@C', 0, 0.5);
    const { unmount } = view(d, { feedback: fb(d, d.targets), guideLevel: 2 });
    expect(screen.queryByTestId('shape-outline')).toBeNull();
    unmount();
    const p = prompt('chord-tones:C', 0, 0.5);
    view(p, { feedback: fb(p, p.targets), guideLevel: 2 });
    expect(screen.getAllByTestId('shape-outline')).toHaveLength(1);
    expect(screen.getByTestId('d37-explain')).toHaveTextContent(
      "That's every note of C major: C (R), E (3), G (5) in frets 5–8, the G shape of C major.",
    );
  });

  it('shows a box above fret 12 on iPad portrait', () => {
    const p = prompt('chord-tones:C', 0, 0.99);
    expect(p.activeRange).toEqual({ from: 10, to: 13 });
    view(p, { sizeClass: 'regular' });
    expect(range()).toEqual(['3', '15']);
  });
});

describe('<D37View> one degree', () => {
  it('asks for the degree and squares the roots as a guide', () => {
    const p = prompt('chord-tones:3@C', 0, 0);
    const { onAnswer } = view(p, { guideLevel: 2 });
    expect(screen.getByTestId('d37-prompt')).toHaveTextContent(
      'Tap every 3rd of C major in frets 0–3',
    );
    expect(where(markers('root'))).toEqual(['s2f1', 's5f3']);
    expect(screen.getByTestId('d37-explain')).toHaveTextContent(
      'These frets hold the C shape of C major. The squares are its roots. Count up from them.',
    );
    expect(cell(5, 3)).toHaveAccessibleName('string 5, fret 3, root');
    // A root square is a guide, not an answer.
    tap(at(5, 3));
    expect(onAnswer).not.toHaveBeenCalled();
    tap(at(4, 2));
    expect(markers('third')).toEqual([{ string: 4, fret: 2, label: '3' }]);
  });

  it('hides the roots without guides, when tapping one is wrong', () => {
    const p = prompt('chord-tones:3@C', 0, 0);
    const { onAnswer } = view(p, { guideLevel: 1 });
    expect(markers('root')).toEqual([]);
    tap(at(5, 3));
    expect(onAnswer).toHaveBeenCalledWith([at(5, 3)]);
  });
});

describe('<D37View> compact', () => {
  const D = 'chord-tones:3@C';

  it('runs the neck region by region from the nut', () => {
    const p = prompt(D);
    const { onAnswer } = view(p, { sizeClass: 'compact' });
    expect(screen.getByTestId('d37-prompt')).toHaveTextContent(
      'Tap every 3rd of C major in frets 0–4',
    );
    expect(screen.getByTestId('d37-region')).toHaveTextContent('Region 1 of 3');
    expect(range()).toEqual(['0', '4']);
    tap(at(6, 0));
    tap(at(1, 0));
    expect(screen.getByTestId('d37-region')).toHaveTextContent('Region 1 of 3');
    tap(at(4, 2));
    expect(screen.getByTestId('d37-prompt')).toHaveTextContent('in frets 5–8');
    expect(range()).toEqual(['5', '9']);
    tap(at(2, 5));
    tap(at(5, 7));
    expect(range()).toEqual(['9', '13']);
    // Fret 13 fills the window, dimmed and inert.
    tap(at(3, 13));
    tap(at(3, 9));
    tap(at(6, 12));
    expect(onAnswer).not.toHaveBeenCalled();
    tap(at(1, 12));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('opens feedback on the region with the first miss, and steps through the others', () => {
    const p = prompt(D);
    // Region 1 found, then "Done": the misses are in frets 5–8 and 9–12.
    view(p, { sizeClass: 'compact', feedback: fb(p, [at(6, 0), at(1, 0), at(4, 2)]) });
    expect(screen.getByTestId('d37-region')).toHaveTextContent(
      'Frets 5–8 · 3 more marked in other frets',
    );
    expect(where(markers('ghost'))).toEqual(['s2f5', 's5f7', 's3f9']);
    expect(screen.getByTestId('d37-explain')).toHaveTextContent(/5 were still to find/);
    fireEvent.click(screen.getByRole('button', { name: 'Higher frets' }));
    expect(screen.getByTestId('d37-region')).toHaveTextContent('Frets 9–12 · 2 more marked');
    expect(range()).toEqual(['9', '13']);
    expect(screen.getByRole('button', { name: 'Higher frets' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Lower frets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lower frets' }));
    expect(screen.getByTestId('d37-region')).toHaveTextContent(/^Frets 0–4 · 5 more marked/);
    expect(screen.getByRole('button', { name: 'Lower frets' })).toBeDisabled();
  });

  it('keeps a box in one window, with no region stepping', () => {
    const p = prompt(D, 0, 0.5);
    view(p, { sizeClass: 'compact', feedback: fb(p, []) });
    expect(screen.queryByTestId('d37-region')).toBeNull();
    expect(range()).toEqual(['5', '9']);
  });

  it('shows the context panel below the neck off regular-wide', () => {
    const aside = <aside data-testid="context-panel" />;
    const p = prompt(D);
    for (const sizeClass of ['regular', 'compact', 'regular-wide'] as const) {
      const { container, unmount } = render(
        <D37View
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
      const below = Boolean(
        neckArea.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(below).toBe(sizeClass !== 'regular-wide');
      unmount();
    }
  });
});
