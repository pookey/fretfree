import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { D19View } from './D19View';
import { d19Check, d19MakePrompt, type D19Answer, type D19Prompt } from './logic';

const prompt = (id: string, rng: () => number = () => 0) =>
  d19MakePrompt(
    { id, skillId: 'I1.voice-leading-top-sets' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

/** C (frets 5, 5, 3 on strings 3–1) to F: C stays, E up to F, G up to A. */
const cToF = () => prompt('voice-lead:I-IV@s3');

function view(
  p: D19Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<D19Answer> | null;
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
  const utils = render(<D19View {...props} />);
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
const fb = (p: D19Prompt, answer: D19Answer): DrillFeedback<D19Answer> => ({
  answer,
  result: d19Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });
const taps = (...ps: Position[]): D19Answer => ({ taps: ps });

describe('<D19View>', () => {
  it('draws the starting triad as rings and asks for the next chord, without giving it away', () => {
    view(cToF());
    expect(screen.getByTestId('d19-prompt')).toHaveTextContent('Voice-lead C to F on strings 3–1');
    // Guide level 1: the rings carry no names, and nothing marks the answer.
    expect(markers('ghost')).toEqual([
      { string: 3, fret: 5, label: '' },
      { string: 2, fret: 5, label: '' },
      { string: 1, fret: 3, label: '' },
    ]);
    expect(markers('target')).toEqual([]);
    expect(screen.getByTestId('d19-explain')).toHaveTextContent(
      'Hold any note C and F share, and move each other note along its string to a note of F, 2 frets at most. If they share none, all three move the same way.',
    );
    expect(screen.getByTestId('d19-count')).toHaveTextContent('Found 0 of 3');
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '15');
    expect(neck()).toHaveAccessibleName('Fretboard: a C triad on strings 3–1; tap the nearest F');
  });

  it('names the rings from guide level 2, and drops the rule at level 0 (rule 9)', () => {
    const { unmount } = view(cToF(), { guideLevel: 2 });
    expect(markers('ghost').map((m) => m.label)).toEqual(['C', 'E', 'G']);
    unmount();
    view(cToF(), { guideLevel: 0 });
    expect(screen.getByTestId('d19-explain')).toHaveTextContent('Tap the F nearest this C.');
  });

  it('marks each found note by its degree in the next chord, and answers at the last one', () => {
    const { onAnswer } = view(cToF());
    tap(at(3, 5)); // the held C
    tap(at(3, 5)); // a repeat is ignored
    expect(markers('fifth')).toEqual([{ string: 3, fret: 5, label: 'C' }]);
    expect(markers('ghost')).toHaveLength(2);
    tap(at(2, 6));
    expect(markers('root')).toEqual([{ string: 2, fret: 6, label: 'F' }]);
    expect(screen.getByTestId('d19-count')).toHaveTextContent('Found 2 of 3');
    expect(onAnswer).not.toHaveBeenCalled();
    tap(at(1, 5));
    expect(onAnswer).toHaveBeenCalledWith(taps(at(3, 5), at(2, 6), at(1, 5)));
  });

  it('answers at the first wrong tap, and on "Done" with what was found', () => {
    const { onAnswer, unmount } = view(cToF());
    tap(at(1, 3)); // holding G, which should move
    expect(onAnswer).toHaveBeenCalledWith(taps(at(1, 3)));
    unmount();
    const second = view(cToF());
    tap(at(2, 6));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(second.onAnswer).toHaveBeenCalledWith(taps(at(2, 6)));
  });

  it('marks the notes to copy on a guided rep, with the rings named', () => {
    view(cToF(), { guided: true });
    expect(screen.getByTestId('d19-prompt')).toHaveTextContent(
      'This is C to F on strings 3–1. Tap each note of F to continue.',
    );
    expect(markers('target').map((m) => `s${m.string}f${m.fret}`)).toEqual([
      's3f5',
      's2f6',
      's1f5',
    ]);
    // The held C is a target, so only E and G stay as rings.
    expect(markers('ghost').map((m) => m.label)).toEqual(['E', 'G']);
    expect(neck()).toHaveAttribute('data-guide-level', '3');
  });

  it('shows the whole next chord and the wrong tap in feedback', () => {
    const p = cToF();
    view(p, { feedback: fb(p, taps(at(3, 4))) });
    expect(markers('wrong')).toEqual([{ string: 3, fret: 4, label: 'B' }]);
    expect([...markers('fifth'), ...markers('root'), ...markers('third')]).toEqual([
      { string: 3, fret: 5, label: 'C' },
      { string: 2, fret: 6, label: 'F' },
      { string: 1, fret: 5, label: 'A' },
    ]);
    expect(markers('ghost').map((m) => m.label)).toEqual(['E', 'G']);
    expect(screen.getByTestId('d19-explain')).toHaveTextContent(
      "That's B, a note of G (V), not F.",
    );
    expect(screen.getByTestId('d19-count')).toHaveTextContent('Found 0 of 3');
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(neck()).toHaveAccessibleName('Fretboard: F in 2nd inversion on strings 3–1');
    tap(at(2, 6)); // feedback is inert
    expect(screen.getByTestId('d19-count')).toHaveTextContent('Found 0 of 3');
  });

  it('gives IV to V a hint that holds when no note is shared', () => {
    view(prompt('voice-lead:IV-V@s3'));
    expect(screen.getByTestId('d19-explain')).toHaveTextContent(
      'Hold any note F and G share, and move each other note along its string to a note of G, 2 frets at most. If they share none, all three move the same way.',
    );
  });

  it('spells a wrong tap for the key', () => {
    // In F, with the sharp preference, the tapped note is B♭, not A♯.
    const p = prompt('voice-lead:I-IV@s3', () => 0.5);
    view(p, { feedback: fb(p, taps(at(2, 11))) });
    expect(markers('wrong')).toEqual([{ string: 2, fret: 11, label: 'B♭' }]);
  });

  it('centres a compact window on the triad, without the hint line', () => {
    view(cToF(), { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '1');
    expect(neck()).toHaveAttribute('data-fret-to', '7');
    expect(screen.queryByTestId('d19-explain')).toBeNull();
  });

  it('shows 12 frets on iPad portrait, with the panel below', () => {
    render(
      <D19View
        prompt={cToF()}
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
    const { rerender, props } = view(cToF());
    tap(at(2, 6));
    expect(markers('root')).toHaveLength(1);
    rerender(<D19View {...props} prompt={cToF()} />);
    expect(markers('root')).toHaveLength(0);
  });
});
