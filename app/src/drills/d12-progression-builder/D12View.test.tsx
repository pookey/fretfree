import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D12View } from './D12View';
import { d12Check, d12MakePrompt, type D12Answer, type D12Prompt } from './logic';

const prompt = (id = 'prog:I-V-vi-IV:build', scopeLevel = 0) =>
  d12MakePrompt(
    { id, skillId: 'C9.pop' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

interface Opts {
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D12Answer> | null;
  withAside?: boolean;
}

function renderView(p: D12Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const props = {
    guideLevel: opts.guideLevel ?? 1,
    guided: opts.guided ?? false,
    handedness: 'right' as const,
    sizeClass: opts.sizeClass ?? ('regular-wide' as const),
    tuning: STANDARD_TUNING,
    feedback: opts.feedback ?? null,
    onAnswer,
    aside: opts.withAside ? <aside data-testid="context-panel" /> : undefined,
  };
  const utils = render(<D12View prompt={p} {...props} />);
  const rerender = (next: D12Prompt, more: Partial<typeof props> = {}) =>
    utils.rerender(<D12View prompt={next} {...props} {...more} />);
  return { onAnswer, ...utils, rerender };
}

const fb = (p: D12Prompt, chords: string[]) => ({
  answer: { chords },
  result: d12Check(p, { chords }),
});
const palette = () => screen.getByRole('group', { name: 'Chords' });
const tile = (name: string) => within(palette()).getByRole('button', { name });
const slots = () => screen.getAllByTestId('d12-slot');
const slotText = () => slots().map((s) => s.textContent);
const check = () => screen.getByRole('button', { name: 'Check' });
const undo = () => screen.getByRole('button', { name: 'Undo' });
const key = (k: string, target: Element | Window = window) => fireEvent.keyDown(target, { key: k });
const status = () => screen.getByTestId('d12-status');

/** jsdom has no layout: point the pointer at an element (or at nothing). */
function pointAt(el: Element | null) {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => el,
  });
}

/** Drag with a pointer from an element to a slot (or off the chart, with null). */
function pointerDrag(from: Element, to: Element | null, pointerType = 'touch') {
  pointAt(to);
  fireEvent.pointerDown(from, { pointerId: 7, clientX: 10, clientY: 10, button: 0, pointerType });
  fireEvent.pointerMove(window, { pointerId: 7, clientX: 14, clientY: 12 });
  fireEvent.pointerMove(window, { pointerId: 7, clientX: 200, clientY: 120 });
  fireEvent.pointerUp(window, { pointerId: 7, clientX: 200, clientY: 120 });
  // A mouse ends a drag with a click on the pressed element.
  if (pointerType === 'mouse') fireEvent.click(from);
}

afterEach(() => {
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

describe('<D12View>', () => {
  it('is registered as the progression builder for every C9 skill', async () => {
    const drill = getDrill('progression-builder');
    expect(await resolveView(drill!.render)).toBe(D12View);
    expect(drill?.skills).toEqual(['C9.pop', 'C9.ii-V-I', 'C9.blues', 'C9.minor']);
    expect(drill?.gradedResponseMs).toBeDefined();
    expect(drill?.contextPanel).toBeDefined();
  });

  it('fills the selected slot by tap and checks the whole chart', () => {
    const { onAnswer } = renderView(prompt());
    expect(screen.getByTestId('d12-subject')).toHaveTextContent('I–V–vi–IV');
    expect(screen.getByText('Build it in C major')).toBeInTheDocument();
    expect(slots()).toHaveLength(4);
    expect(slots()[0]).toHaveAttribute('data-state', 'current');
    expect(check()).toBeDisabled();
    expect(undo()).toBeDisabled();
    for (const c of ['C', 'G', 'A minor']) fireEvent.click(tile(c));
    expect(check()).toBeDisabled();
    // Select a filled slot and replace its chord.
    fireEvent.click(slots()[1]!);
    fireEvent.click(tile('D minor'));
    expect(slotText()).toEqual(['C', 'Dm', 'Am', '']);
    expect(slots()[3]).toHaveAttribute('data-state', 'current');
    fireEvent.click(tile('F'));
    fireEvent.click(undo());
    fireEvent.click(slots()[1]!);
    fireEvent.click(tile('G'));
    fireEvent.click(tile('F'));
    expect(slotText()).toEqual(['C', 'G', 'Am', 'F']);
    fireEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ chords: ['C', 'G', 'Am', 'F'] });
  });

  it('drags a tile into a slot with a finger or a mouse', () => {
    renderView(prompt());
    pointerDrag(tile('A minor'), slots()[2]!);
    expect(slotText()).toEqual(['', '', 'Am', '']);
    expect(status()).toHaveTextContent('Dropped A minor in chord 3.');
    pointerDrag(tile('F'), slots()[3]!, 'mouse');
    // The click that ends a mouse drag doesn't also tap the tile into a slot.
    expect(slotText()).toEqual(['', '', 'Am', 'F']);
    expect(screen.queryByTestId('d12-drag')).not.toBeInTheDocument();
  });

  it('shows the chord under the pointer while dragging', () => {
    renderView(prompt());
    pointAt(slots()[1]!);
    fireEvent.pointerDown(tile('G'), { pointerId: 3, clientX: 0, clientY: 0, button: 0 });
    // A wobble under the threshold is still a tap.
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 2, clientY: 2 });
    expect(screen.queryByTestId('d12-drag')).not.toBeInTheDocument();
    fireEvent.pointerMove(window, { pointerId: 9, clientX: 90, clientY: 90 });
    expect(screen.queryByTestId('d12-drag')).not.toBeInTheDocument();
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 90, clientY: 90 });
    expect(screen.getByTestId('d12-drag')).toHaveTextContent('G');
    expect(slots()[1]).toHaveAttribute('data-state', 'target');
    fireEvent.pointerCancel(window, { pointerId: 9 });
    expect(screen.getByTestId('d12-drag')).toBeInTheDocument();
    fireEvent.pointerCancel(window, { pointerId: 3 });
    expect(screen.queryByTestId('d12-drag')).not.toBeInTheDocument();
    expect(slotText()).toEqual(['', '', '', '']);
  });

  it('moves a placed chord between slots and drags it off to remove it', () => {
    renderView(prompt());
    fireEvent.click(tile('C'));
    fireEvent.click(tile('G'));
    pointerDrag(slots()[0]!, slots()[1]!);
    expect(slotText()).toEqual(['G', 'C', '', '']);
    pointerDrag(slots()[1]!, null);
    expect(slotText()).toEqual(['G', '', '', '']);
    expect(status()).toHaveTextContent('Removed C.');
    // An empty slot has nothing to drag, and a tile dropped off the chart is ignored.
    pointerDrag(slots()[3]!, slots()[0]!);
    pointerDrag(tile('F'), null);
    expect(slotText()).toEqual(['G', '', '', '']);
  });

  it('ignores a secondary mouse button', () => {
    renderView(prompt());
    fireEvent.pointerDown(tile('C'), { pointerId: 1, button: 2, pointerType: 'mouse' });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 90, clientY: 90 });
    expect(screen.queryByTestId('d12-drag')).not.toBeInTheDocument();
  });

  it('drags with the keyboard: Space picks up, arrows choose a slot, Space drops', () => {
    renderView(prompt());
    const am = tile('A minor');
    am.focus();
    key(' ', am);
    expect(am).toHaveAttribute('data-grabbed', 'true');
    expect(status()).toHaveTextContent('Picked up A minor. Chord 1: empty.');
    expect(slots()[0]).toHaveAttribute('data-state', 'target');
    key('ArrowRight', am);
    key('ArrowRight', am);
    key('ArrowDown', am);
    expect(status()).toHaveTextContent('Chord 3: empty');
    key('Tab', am);
    key(' ', am);
    expect(slotText()).toEqual(['', '', 'Am', '']);
    expect(status()).toHaveTextContent('Dropped A minor in chord 3.');
    // Enter works too, and Escape cancels.
    const c = tile('C');
    key('Enter', c);
    key('Escape', c);
    expect(status()).toHaveTextContent('Cancelled.');
    key('Enter', c);
    key('Home', c);
    key('Enter', c);
    expect(slotText()).toEqual(['C', '', 'Am', '']);
  });

  it('moves, selects and clears slots from the keyboard', () => {
    renderView(prompt());
    fireEvent.click(tile('C'));
    const first = slots()[0]!;
    first.focus();
    key(' ', first);
    expect(status()).toHaveTextContent('Picked up C from chord 1.');
    key('End', first);
    key(' ', first);
    expect(slotText()).toEqual(['', '', '', 'C']);
    expect(document.activeElement).toBe(slots()[3]);
    key(' ', slots()[1]!);
    expect(slots()[1]).toHaveAttribute('data-state', 'current');
    expect(status()).toHaveTextContent('Chord 2 selected.');
    key('Delete', slots()[3]!);
    expect(slotText()).toEqual(['', '', '', '']);
    expect(status()).toHaveTextContent('Removed C.');
  });

  it('takes number keys for tiles, Backspace to undo and Enter to check', () => {
    const { onAnswer } = renderView(prompt());
    // Tiles in letter order: Am C Dm Em F G.
    for (const k of ['2', '6', '1', '5']) key(k);
    expect(slotText()).toEqual(['C', 'G', 'Am', 'F']);
    key('Backspace');
    key('3');
    key('Enter', undo());
    expect(onAnswer).not.toHaveBeenCalled();
    key('x');
    key('k', undefined);
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    key('Enter');
    expect(onAnswer).toHaveBeenCalledWith({ chords: ['C', 'G', 'Am', 'Dm'] });
  });

  it('shows numerals by guide level and works the first rep', () => {
    const p = prompt();
    const { rerender } = renderView(p, { guideLevel: 0 });
    expect(screen.queryByText('vi')).not.toBeInTheDocument();
    expect(slots()[0]).toHaveAccessibleName('Chord 1: empty');
    rerender(p, { guideLevel: 1 });
    expect(screen.getByText('vi')).toBeInTheDocument();
    expect(slots()[2]).toHaveAccessibleName('Chord 3, vi: empty');
    rerender(p, { guided: true });
    expect(screen.getByText(/In C major, I–V–vi–IV is C G Am F\./)).toBeInTheDocument();
    expect(slotText()).toEqual(['C', 'G', 'Am', 'F']);
    expect(within(palette()).getAllByText('ii')).toHaveLength(1);
  });

  it('shows a transposition’s source chart, naming it from level 2', () => {
    const p = prompt('prog:I-V-vi-IV:transpose');
    const { rerender } = renderView(p, { guideLevel: 1 });
    expect(screen.getByTestId('d12-subject')).toHaveTextContent('Transpose the chart');
    expect(screen.getByText('Move it from C major to G major')).toBeInTheDocument();
    const source = screen.getByTestId('d12-source');
    expect(source).toHaveTextContent('In C major');
    expect(source).toHaveTextContent('CGAmF');
    rerender(p, { guideLevel: 2 });
    expect(screen.getByTestId('d12-subject')).toHaveTextContent('I–V–vi–IV');
    expect(within(screen.getByTestId('d12-source')).getByText('vi')).toBeInTheDocument();
  });

  it('lays a 12-bar blues out in bars of four', () => {
    renderView(prompt('prog:12-bar-blues:build'), { guideLevel: 0 });
    expect(slots()).toHaveLength(12);
    expect(slots()[11]).toHaveAccessibleName('Bar 12: empty');
    expect(screen.getByRole('list', { name: 'Progression' })).toHaveStyle('--columns: 4');
  });

  it('marks each slot in feedback and explains a rotation', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, ['Am', 'F', 'C', 'G']), withAside: true });
    expect(screen.queryByRole('group', { name: 'Chords' })).not.toBeInTheDocument();
    expect(slots().every((s) => s.hasAttribute('disabled'))).toBe(true);
    expect(slots()[0]).toHaveAttribute('data-verdict', 'wrong');
    expect(slots()[0]).toHaveAccessibleName('Chord 1, I: A minor, wrong');
    expect(screen.getAllByTestId('d12-expected').map((e) => e.textContent)).toEqual([
      'C',
      'G',
      'Am',
      'F',
    ]);
    expect(screen.getByTestId('d12-explanation')).toHaveTextContent(
      'You built vi–IV–I–V: the same chords as I–V–vi–IV, started from the vi.',
    );
    expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    // Keys do nothing once answered.
    key('1');
    expect(slotText()).toEqual(['Am✗', 'F✗', 'C✗', 'G✗']);
  });

  it('marks a right answer without an explanation', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, ['C', 'G', 'Am', 'F']), sizeClass: 'compact' });
    expect(slots().map((s) => s.getAttribute('data-verdict'))).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
    ]);
    expect(screen.queryByTestId('d12-explanation')).not.toBeInTheDocument();
  });

  it('starts empty on a new prompt and places the panel below on iPad portrait', () => {
    const p = prompt();
    const { rerender } = renderView(p, { sizeClass: 'regular', withAside: true });
    fireEvent.click(tile('C'));
    act(() => rerender(prompt('prog:I-IV-V:build')));
    expect(slotText()).toEqual(['', '', '']);
    expect(screen.getByTestId('d12-drill').lastElementChild).toBe(
      screen.getByTestId('context-panel'),
    );
  });
});
