import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel, Handedness } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { D2View } from './D2View';
import { d2Check, d2MakePrompt, type D2Prompt } from './logic';

const prompt = (id: string, scopeLevel = 0) =>
  d2MakePrompt(
    { id, skillId: 'C2.all-notes' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

function view(
  p: D2Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    compactFrets?: number;
    handedness?: Handedness;
    feedback?: DrillFeedback<Position> | null;
  } = {},
) {
  const onAnswer = vi.fn();
  const props = {
    prompt: p,
    guideLevel: over.guideLevel ?? 3,
    guided: over.guided ?? false,
    handedness: over.handedness ?? 'right',
    sizeClass: over.sizeClass ?? 'regular-wide',
    compactFrets: over.compactFrets,
    tuning: STANDARD_TUNING,
    feedback: over.feedback ?? null,
    onAnswer,
  } as const;
  const utils = render(<D2View {...props} />);
  return { ...utils, onAnswer, props };
}

const neck = () => screen.getByRole('group', { name: /find the note on string/ });
const cell = (string: number, fret: number) =>
  neck().querySelector(`[data-cell="s${string}f${fret}"]`) as SVGElement;
const fb = (p: D2Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d2Check(p, answer),
});

describe('<D2View>', () => {
  it('asks for the note on the named string and answers with the tapped cell', () => {
    const p = prompt('find:G@s5');
    const { onAnswer } = view(p);
    expect(screen.getByTestId('d2-prompt')).toHaveTextContent('Find G on string 5');
    fireEvent.pointerDown(cell(5, 10));
    expect(onAnswer).toHaveBeenCalledWith({ string: 5, fret: 10 });
  });

  it('ignores taps on dimmed strings and frets', () => {
    const { onAnswer } = view(prompt('find:G@s5'));
    fireEvent.pointerDown(cell(4, 5));
    fireEvent.pointerDown(cell(5, 14));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('dimmed-fret')).toHaveLength(3);
  });

  it('dims only the frets beyond 12 once every string is live', () => {
    const { container, onAnswer } = view(prompt('find:G@s5', 1));
    expect(container.querySelector('[data-live-string]')).toBeNull();
    fireEvent.pointerDown(cell(4, 5));
    expect(onAnswer).toHaveBeenCalledWith({ string: 4, fret: 5 });
  });

  it('never shows the answer on the neck before an unguided answer, even at guide level 3', () => {
    // Includes notes that name an open string (E, A, D, G, B) and accidentals.
    for (const id of ['find:E@s6', 'find:A@s5', 'find:G@s5', 'find:C@s5', 'find:F#@s3']) {
      const p = prompt(id, 2);
      const { container, unmount } = view(p, { guideLevel: 3 });
      const svg = container.querySelector('svg[data-fret-from]') as SVGElement;
      const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent);
      expect(texts, id).not.toContain(p.pc);
      expect(svg.querySelectorAll('[data-testid^="marker-"]'), id).toHaveLength(0);
      // Plain DOM queries: resolving ~100 accessible names per neck is slow in jsdom.
      const labels = [...svg.querySelectorAll('[data-cell]')].map((c) =>
        c.getAttribute('aria-label'),
      );
      expect(labels, id).toHaveLength(16 * 6);
      for (const l of labels) expect(l, id).toMatch(/^string \d, fret \d+$/);
      expect(svg.getAttribute('aria-label')).not.toContain(p.pc);
      unmount();
    }
  });

  it('still shows fret numbers when no string name could give the answer away', () => {
    view(prompt('find:C@s5'), { guideLevel: 3 });
    expect(neck()).toHaveAttribute('data-guide-level', '3');
  });

  it('shows the target on a guided worked example', () => {
    view(prompt('find:E@s6'), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d2-prompt')).toHaveTextContent('This is E on string 6');
    const targets = screen.getAllByTestId('marker-target');
    expect(targets.map((t) => t.getAttribute('data-fret'))).toEqual(['0', '12']);
    expect(targets[0]).toHaveTextContent('E');
  });

  it('shows both positions after a wrong tap', () => {
    const p = prompt('find:G@s5');
    const { onAnswer } = view(p, { feedback: fb(p, { string: 5, fret: 8 }) });
    expect(screen.getByTestId('marker-correct')).toHaveAttribute('data-fret', '10');
    expect(screen.getByTestId('marker-wrong')).toHaveTextContent('F');
    expect(screen.getByTestId('d2-explain')).toHaveTextContent('You tapped F');
    fireEvent.pointerDown(cell(5, 10));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('moves a focus cell with the arrow keys and taps it with Enter', () => {
    const p = prompt('find:G@s5', 1);
    const { onAnswer } = view(p);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(5, 0));
    fireEvent.keyDown(window, { key: 'End' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell(4, 10));
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
    // Focus left on the page body: Enter taps the focus cell.
    (document.activeElement as SVGElement).blur();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith({ string: 4, fret: 10 });
  });

  it('lets a focused cell handle its own Enter', () => {
    const { onAnswer } = view(prompt('find:G@s5'));
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ string: 5, fret: 0 });
  });

  it('ignores Enter on other controls and keys once answered', () => {
    const p = prompt('find:G@s5');
    const { onAnswer, rerender, props } = view(p, { sizeClass: 'compact' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Higher frets' }), { key: 'Enter' });
    expect(onAnswer).not.toHaveBeenCalled();
    rerender(<D2View {...props} feedback={fb(p, { string: 5, fret: 10 })} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('slides a 5-fret window on compact, following the focus cell', () => {
    const p = prompt('find:G@s5');
    view(p, { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '4');
    expect(screen.getByRole('button', { name: 'Lower frets' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Higher frets' }));
    expect(screen.getByTestId('d2-window')).toHaveTextContent('Frets 4–8');
    fireEvent.click(screen.getByRole('button', { name: 'Higher frets' }));
    expect(screen.getByRole('button', { name: 'Higher frets' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Lower frets' }));
    expect(neck()).toHaveAttribute('data-fret-from', '4');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Home' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(document.activeElement).toBe(cell(5, 0));
  });

  it('widens the compact window to show both positions after a wrong tap', () => {
    const p = prompt('find:G@s5');
    view(p, { sizeClass: 'compact', feedback: fb(p, { string: 5, fret: 2 }) });
    expect(neck()).toHaveAttribute('data-fret-from', '2');
    expect(neck()).toHaveAttribute('data-fret-to', '10');
  });

  it('uses a wider window on a phone on its side, and resizes it on rotation', () => {
    const p = prompt('find:G@s5');
    const { rerender, props } = view(p, { sizeClass: 'compact', compactFrets: 10 });
    expect(screen.getByTestId('d2-window')).toHaveTextContent('Frets 0–9');
    fireEvent.click(screen.getByRole('button', { name: 'Higher frets' }));
    expect(screen.getByTestId('d2-window')).toHaveTextContent('Frets 3–12');
    rerender(<D2View {...props} compactFrets={5} />);
    expect(screen.getByTestId('d2-window')).toHaveTextContent('Frets 0–4');
  });

  it('puts the lower-frets control on the nut side of a left-handed neck', () => {
    view(prompt('find:G@s5'), { sizeClass: 'compact', handedness: 'left' });
    const buttons = screen.getAllByRole('button', { name: /frets$/ });
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Higher frets',
      'Lower frets',
    ]);
  });

  it('shows the 12-fret neck on iPad portrait and resets on a new prompt', () => {
    const { rerender, props } = view(prompt('find:G@s5'), { sizeClass: 'regular' });
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    rerender(<D2View {...props} prompt={prompt('find:A@s6')} />);
    expect(screen.getByTestId('d2-prompt')).toHaveTextContent('Find A on string 6');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(6, 0));
  });
});
