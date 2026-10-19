import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import type { DrillFeedback } from '../types';
import { D36View } from './D36View';
import { d36Check, d36MakePrompt, type D36Answer, type D36Prompt } from './logic';

/** A cycling rng: the first value picks the root (0.75: A), the second the display. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

const NECK = 0.9;
const DIAGRAM = 0.1;

const prompt = (id: string, display = NECK, root = 0.75) =>
  d36MakePrompt(
    { id, skillId: 'C5.name-triads' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: seq(root, display) },
  );

function view(
  p: D36Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<D36Answer> | null;
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
  const utils = render(<D36View {...props} />);
  return { ...utils, onAnswer, props };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard:/ });
const markers = () =>
  [...neck().querySelectorAll('[data-testid^="marker-"]')].map((m) => ({
    style: m.getAttribute('data-testid')!.replace('marker-', ''),
    string: Number(m.getAttribute('data-string')),
    fret: Number(m.getAttribute('data-fret')),
    label: m.textContent,
  }));
const roots = () => within(screen.getByRole('group', { name: 'Root' }));
const qualities = () => within(screen.getByRole('group', { name: 'Quality' }));
const fb = (p: D36Prompt, answer: D36Answer): DrillFeedback<D36Answer> => ({
  answer,
  result: d36Check(p, answer),
});

describe('<D36View> prompt', () => {
  it('draws the voicing with no root, label or name to give it away', () => {
    // Am, A shape: x02210.
    const p = prompt('chord-name:A-shape@minor');
    view(p, { guideLevel: 3 });
    expect(screen.getByTestId('d36-prompt')).toHaveTextContent('What chord is this?');
    expect(markers()).toHaveLength(5);
    expect(markers().every((m) => m.style === 'tone' && m.label === '')).toBe(true);
    // The outline is a guide (level 2+), and says nothing about the root.
    expect(screen.getByTestId('shape-outline')).toBeInTheDocument();
    // Only the answer buttons may say "minor".
    const text = ['d36-prompt', 'd36-explain'].map((id) => screen.getByTestId(id).textContent);
    expect([...text, neck().textContent].join(' ')).not.toMatch(/\bAm?\b|minor|shape/);
    expect(neck()).toHaveAccessibleName(
      /^Fretboard: a chord voicing, low string first: string 6 muted, string 5 open/,
    );
    expect(neck()).not.toHaveAccessibleName(/root|minor|Am/);
    expect(neck()).toHaveAttribute('data-fret-to', '15');
  });

  it('asks for the root first, then the quality', () => {
    const p = prompt('chord-name:A-shape@minor');
    const { onAnswer } = view(p);
    expect(roots().getAllByRole('button')).toHaveLength(12);
    expect(qualities().getAllByRole('button')).toHaveLength(8);
    const minor = qualities().getByRole('button', { name: 'minor' });
    expect(minor).toBeDisabled();
    expect(screen.getByTestId('d36-explain')).toHaveTextContent('Name its root, then its quality.');

    fireEvent.click(roots().getByRole('button', { name: 'C' }));
    fireEvent.click(roots().getByRole('button', { name: 'A' }));
    expect(roots().getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
    expect(roots().getByRole('button', { name: 'C' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('d36-explain')).toHaveTextContent('Root A: now its quality.');
    expect(minor).toBeEnabled();
    fireEvent.click(minor);
    expect(onAnswer).toHaveBeenCalledWith({ root: 'A', kind: 'minor' });
  });

  it('answers from the keyboard: A–G, # to sharpen, then the number row', () => {
    const p = prompt('chord-name:A-shape@minor');
    const { onAnswer } = view(p);
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.keyDown(window, { key: '#' });
    expect(roots().getByRole('button', { name: 'F♯' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(qualities().getByRole('button', { name: 'dominant seventh' })).toHaveAttribute(
      'aria-keyshortcuts',
      '3',
    );
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenCalledWith({ root: 'F#', kind: 'minor' });
  });

  it('starts each new prompt with no root chosen', () => {
    const p = prompt('chord-name:A-shape@minor');
    const { rerender, props } = view(p);
    fireEvent.click(roots().getByRole('button', { name: 'A' }));
    rerender(<D36View {...props} prompt={prompt('chord-name:E-shape@major')} />);
    expect(qualities().getByRole('button', { name: 'major' })).toBeDisabled();
  });

  it('draws the chart view without a name, roots or degree labels', () => {
    const p = prompt('chord-name:C-shape@major', DIAGRAM, 0.01);
    view(p, { guideLevel: 3 });
    expect(screen.getByTestId('d36-drill')).toHaveAttribute('data-display', 'diagram');
    expect(screen.queryByRole('group', { name: /^Fretboard:/ })).toBeNull();
    const chart = screen.getByRole('img', { name: /^Chord diagram:/ });
    expect(chart).not.toHaveAccessibleName(/root|3rd|C major/);
    const dots = [...chart.querySelectorAll('[data-testid="chord-dot"]')];
    expect(dots.map((d) => d.getAttribute('data-style'))).toEqual(['tone', 'tone', 'tone']);
    expect(chart.textContent).not.toMatch(/R|3|5/);
    expect(screen.queryByText('C', { selector: 'figcaption' })).toBeNull();
  });

  it('walks through the first rep as a worked example (rule 8)', () => {
    const p = prompt('chord-name:A-shape@minor');
    view(p, { guided: true });
    expect(screen.getByTestId('d36-prompt')).toHaveTextContent('This is Am. Tap A, then minor.');
    expect(screen.getByTestId('d36-explain')).toHaveTextContent(
      'The root is A, the lowest note (string 5, open). The 3rd is C, a minor 3rd above A.',
    );
    expect(markers().map((m) => m.label)).toEqual(['R', '5', 'R', '♭3', '5']);
  });

  it('shows iPad portrait a 12-fret neck, and compact screens a window round the voicing', () => {
    const p = prompt('chord-name:A-shape@minor');
    const { unmount } = view(p, { sizeClass: 'regular' });
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    unmount();
    view(p, { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-to', '4');
    // A phone has no room for the hint line before an answer.
    expect(screen.queryByTestId('d36-explain')).toBeNull();
  });
});

describe('<D36View> feedback', () => {
  it('labels every dot with its degree and says which note decided the quality', () => {
    const p = prompt('chord-name:A-shape@minor');
    view(p, { feedback: fb(p, { root: 'A', kind: 'major' }) });
    expect(markers()).toEqual([
      { style: 'root', string: 5, fret: 0, label: 'R' },
      { style: 'fifth', string: 4, fret: 2, label: '5' },
      { style: 'root', string: 3, fret: 2, label: 'R' },
      { style: 'third', string: 2, fret: 1, label: '♭3' },
      { style: 'fifth', string: 1, fret: 0, label: '5' },
    ]);
    expect(screen.getByTestId('d36-explain')).toHaveTextContent(
      "It's Am, not A. The 3rd is C, a minor 3rd above A.",
    );
    expect(neck()).toHaveAccessibleName(/^Fretboard: Am,/);
    // The root was right; the quality wrong, with the right one marked.
    expect(roots().getByRole('button', { name: 'A' })).toHaveAttribute('data-state', 'correct');
    expect(qualities().getByRole('button', { name: 'major' })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    expect(qualities().getByRole('button', { name: 'minor' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });

  it('marks a wrong root and its correction', () => {
    const p = prompt('chord-name:A-shape@minor');
    view(p, { feedback: fb(p, { root: 'E', kind: 'minor' }) });
    expect(roots().getByRole('button', { name: 'E' })).toHaveAttribute('data-state', 'wrong');
    expect(roots().getByRole('button', { name: 'A' })).toHaveAttribute('data-state', 'expected');
    expect(qualities().getByRole('button', { name: 'minor' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    expect(screen.getByTestId('d36-explain')).toHaveTextContent('The root is A, the lowest note');
  });

  it('labels the chart view by degree and names the chord once answered', () => {
    const p = prompt('chord-name:C-shape@major', DIAGRAM, 0.01);
    view(p, { feedback: fb(p, { root: 'C', kind: 'major' }) });
    const chart = screen.getByRole('img', { name: /^C diagram:/ });
    const dots = [...chart.querySelectorAll('[data-testid="chord-dot"]')];
    expect(dots.map((d) => d.getAttribute('data-style'))).toEqual(['root', 'third', 'root']);
    expect(dots.map((d) => d.textContent)).toEqual(['R', '3', 'R']);
    expect(screen.getByTestId('d36-explain')).toHaveTextContent('Yes: C. The 3rd is E');
  });

  it('draws a barre chord’s barre on the chart', () => {
    // F, E-shape barre at fret 1.
    const p = prompt('chord-name:E-shape@major', DIAGRAM, 3 / 7 + 0.01);
    view(p);
    expect(screen.getByTestId('chord-barre')).toHaveAttribute('data-fret', '1');
  });
});
