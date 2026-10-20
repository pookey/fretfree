import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { resolveView } from '../lazy-view';
import { D18View } from './D18View';
import triadInversions from './drill';
import { d18Check, d18MakePrompt, type D18Answer, type D18Prompt } from './logic';

const prompt = (id: string, rng: () => number = () => 0) =>
  d18MakePrompt(
    { id, skillId: 'I1.major-top-sets' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

function view(
  p: D18Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<D18Answer> | null;
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
  const utils = render(<D18View {...props} />);
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
const fb = (p: D18Prompt, answer: D18Answer): DrillFeedback<D18Answer> => ({
  answer,
  result: d18Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });
const taps = (...ps: Position[]): D18Answer => ({ kind: 'taps', taps: ps });

describe('<D18View> build cards', () => {
  // The first use imports every drill's views (one shared chunk), which can
  // take several seconds cold on a loaded machine.
  it('is the D18 plugin’s view, loaded on first use', async () => {
    expect(await resolveView(triadInversions.render)).toBe(D18View);
  }, 30_000);

  it('shows the root and asks for the inversion, without giving it away', () => {
    view(prompt('inversion:1@s3/major'));
    expect(screen.getByTestId('d18-prompt')).toHaveTextContent(
      'Build C in 1st inversion on strings 3–1',
    );
    expect(markers('root')).toEqual([{ string: 1, fret: 8, label: 'C' }]);
    expect(markers('target')).toEqual([]);
    expect(screen.getByTestId('d18-explain')).toHaveTextContent(
      'The square is the root, C, on string 1.',
    );
    expect(screen.getByTestId('d18-count')).toHaveTextContent('Found 0 of 2');
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '15');
    expect(screen.queryByRole('group', { name: 'Inversion' })).toBeNull();
  });

  it('marks each found note by degree, and answers at the last one', () => {
    const { onAnswer } = view(prompt('inversion:1@s3/major'));
    tap(at(1, 8)); // the given root is not an answer
    tap(at(3, 9));
    tap(at(3, 9)); // a repeat is ignored
    expect(markers('third')).toEqual([{ string: 3, fret: 9, label: '3' }]);
    expect(screen.getByTestId('d18-count')).toHaveTextContent('Found 1 of 2');
    expect(onAnswer).not.toHaveBeenCalled();
    tap(at(2, 8));
    expect(onAnswer).toHaveBeenCalledWith(taps(at(3, 9), at(2, 8)));
  });

  it('answers at the first wrong tap, and on "Done" with what was found', () => {
    const { onAnswer, unmount } = view(prompt('inversion:1@s3/major'));
    tap(at(3, 8));
    expect(onAnswer).toHaveBeenCalledWith(taps(at(3, 8)));
    unmount();
    const second = view(prompt('inversion:1@s3/major'));
    tap(at(3, 9));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(second.onAnswer).toHaveBeenCalledWith(taps(at(3, 9)));
  });

  it('marks the notes to copy on a guided rep', () => {
    view(prompt('inversion:0@s3/major'), { guided: true });
    expect(screen.getByTestId('d18-prompt')).toHaveTextContent(
      'This is C in root position on strings 3–1. Tap each note to continue.',
    );
    expect(markers('target').map((m) => m.label)).toEqual(['3', '5']);
    expect(neck()).toHaveAttribute('data-guide-level', '3');
  });

  it('rings the missed note and marks the ♭3 in feedback', () => {
    const p = prompt('inversion:1@s3/major');
    view(p, { feedback: fb(p, taps(at(3, 8))) });
    expect(markers('ghost').map((m) => m.label)).toEqual(['3', '5']);
    expect(markers('wrong')).toEqual([{ string: 3, fret: 8, label: 'D♯' }]);
    expect(screen.getByTestId('d18-explain')).toHaveTextContent("That's E♭, the ♭3 of Cm");
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    tap(at(2, 8)); // feedback is inert
    expect(markers('fifth')).toHaveLength(0);
  });

  it('centres a compact window on the root, without the hint line', () => {
    view(prompt('inversion:1@s3/major'), { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '5');
    expect(neck()).toHaveAttribute('data-fret-to', '11');
    expect(screen.queryByTestId('d18-explain')).toBeNull();
  });

  it('shows 12 frets on iPad portrait, with the panel below', () => {
    render(
      <D18View
        prompt={prompt('inversion:1@s3/major')}
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
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    expect(screen.getByTestId('aside')).toBeInTheDocument();
  });

  it('starts a new round when the prompt changes', () => {
    const { rerender, props } = view(prompt('inversion:1@s3/major'));
    tap(at(3, 9));
    expect(markers('third')).toHaveLength(1);
    rerender(<D18View {...props} prompt={prompt('inversion:1@s3/major')} />);
    expect(markers('third')).toHaveLength(0);
  });
});

describe('<D18View> name cards', () => {
  it('draws the triad unlabelled and offers the three inversions', () => {
    const { onAnswer } = view(prompt('inversion-name:1@s3/major'), { guideLevel: 3 });
    expect(screen.getByTestId('d18-prompt')).toHaveTextContent('Which inversion of C is this?');
    expect(markers('tone')).toEqual([
      { string: 3, fret: 9, label: '' },
      { string: 2, fret: 8, label: '' },
      { string: 1, fret: 8, label: '' },
    ]);
    expect(markers('root')).toEqual([]);
    expect(screen.queryByTestId('d18-count')).toBeNull();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Root position',
      '1st inversion',
      '2nd inversion',
    ]);
    expect(buttons.map((b) => b.getAttribute('aria-keyshortcuts'))).toEqual(['R', '1', '2']);
    // Taps on the neck do nothing.
    tap(at(3, 9));
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '2nd inversion' }));
    expect(onAnswer).toHaveBeenCalledWith({ kind: 'inversion', inversion: 2 });
  });

  it('answers from the keyboard: R, 1 or 2', () => {
    const { onAnswer } = view(prompt('inversion-name:1@s3/major'));
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'r' });
    expect(onAnswer).toHaveBeenCalledWith({ kind: 'inversion', inversion: 0 });
  });

  it('labels every degree and says which inversion on a guided rep', () => {
    view(prompt('inversion-name:2@s3/major'), { guided: true });
    expect(screen.getByTestId('d18-prompt')).toHaveTextContent(
      'This is C in 2nd inversion. Tap 2nd inversion.',
    );
    expect(markers('fifth')).toEqual([{ string: 3, fret: 0, label: '5' }]);
    expect(screen.getByTestId('d18-explain')).toHaveTextContent('The lowest note is the 5th.');
  });

  it('shows the given and the missed answer after a wrong pick, and ignores keys', () => {
    const p = prompt('inversion-name:1@s3/major');
    const { onAnswer } = view(p, {
      feedback: fb(p, { kind: 'inversion', inversion: 0 }),
    });
    expect(screen.getByRole('button', { name: 'Root position' })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    expect(screen.getByRole('button', { name: '1st inversion' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    expect(screen.getByRole('button', { name: '1st inversion' })).toBeDisabled();
    expect(markers('third')).toEqual([{ string: 3, fret: 9, label: '3' }]);
    expect(screen.getByTestId('d18-explain')).toHaveTextContent(
      'Root position has the root in the bass.',
    );
    expect(neck()).toHaveAccessibleName('Fretboard: C in 1st inversion on strings 3–1');
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('marks a right pick correct', () => {
    const p = prompt('inversion-name:1@s3/major');
    view(p, { feedback: fb(p, { kind: 'inversion', inversion: 1 }) });
    expect(screen.getByRole('button', { name: '1st inversion' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    expect(screen.getByRole('button', { name: 'Root position' })).not.toHaveAttribute('data-state');
  });

  it('centres a compact window on the triad', () => {
    view(prompt('inversion-name:1@s3/major'), { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '5');
    expect(neck()).toHaveAttribute('data-fret-to', '11');
    expect(neck()).toHaveAccessibleName('Fretboard: a C triad on strings 3–1');
  });
});
