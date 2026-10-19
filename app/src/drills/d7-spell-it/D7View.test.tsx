import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D7View } from './D7View';
import { d7Check, d7MakePrompt, type D7Answer, type D7Prompt } from './logic';
import { resolveView } from '../lazy-view';

const prompt = (id = 'spell-key:F#', scopeLevel = 0) =>
  d7MakePrompt(
    { id, skillId: 'C4.sharp-keys' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

interface Opts {
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D7Answer> | null;
  withAside?: boolean;
}

function renderView(p: D7Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const props = {
    guideLevel: opts.guideLevel ?? 0,
    guided: opts.guided ?? false,
    handedness: 'right' as const,
    sizeClass: opts.sizeClass ?? ('regular-wide' as const),
    tuning: STANDARD_TUNING,
    feedback: opts.feedback ?? null,
    onAnswer,
    aside: opts.withAside ? <aside data-testid="context-panel" /> : undefined,
  };
  const utils = render(<D7View prompt={p} {...props} />);
  const rerender = (next: D7Prompt, more: Partial<typeof props> = {}) =>
    utils.rerender(<D7View prompt={next} {...props} {...more} />);
  return { onAnswer, ...utils, rerender };
}

const fb = (p: D7Prompt, answer: D7Answer) => ({ answer, result: d7Check(p, answer) });
const grid = () => screen.getByRole('group');
const tap = (name: string) => fireEvent.click(within(grid()).getByRole('button', { name }));
const slots = () => screen.getAllByTestId('d7-slot');
const slotText = () => slots().map((s) => s.textContent);
const check = () => screen.getByRole('button', { name: 'Check' });
const undo = () => screen.getByRole('button', { name: 'Undo' });
const key = (k: string) => fireEvent.keyDown(window, { key: k });

describe('<D7View>', () => {
  it('is registered as the spell-it drill for every C4 and C5 skill', async () => {
    const drill = getDrill('spell-it');
    expect(await resolveView(drill!.render)).toBe(D7View);
    expect(drill?.skills).toEqual([
      'C4.sharp-keys',
      'C4.flat-keys',
      'C4.sharp-key-degrees',
      'C4.flat-key-degrees',
      'C5.triads',
      'C5.sevenths',
      'C5.sus-add',
    ]);
    expect(drill?.gradedResponseMs).toBeDefined();
  });

  it('fills the slots in order and checks the whole spelling', () => {
    const { onAnswer } = renderView(prompt());
    expect(screen.getByTestId('d7-subject')).toHaveTextContent('F♯ major');
    expect(screen.getByText('Spell F♯ major')).toBeInTheDocument();
    expect(slotText()).toEqual(['F♯', '', '', '', '', '', '']);
    expect(slots()[1]).toHaveAttribute('data-state', 'current');
    expect(check()).toBeDisabled();
    expect(undo()).toBeDisabled();
    for (const n of ['G sharp', 'A sharp', 'B', 'C sharp', 'D sharp']) tap(n);
    expect(check()).toBeDisabled();
    tap('F');
    expect(slotText()).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'F']);
    // Full: the grid is locked until a note is removed.
    expect(within(grid()).getByRole('button', { name: 'E sharp' })).toBeDisabled();
    fireEvent.click(undo());
    tap('E sharp');
    fireEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ notes: ['G#', 'A#', 'B', 'C#', 'D#', 'E#'] });
  });

  it('names slots for screen readers, with degree labels from guide level 1', () => {
    renderView(prompt(), { guideLevel: 0 });
    expect(slots()[0]).toHaveAccessibleName('note 1: F sharp');
    expect(slots()[1]).toHaveAccessibleName('note 2: empty');
    expect(screen.queryByText('7')).toBeNull();
  });

  it('fades guides: labels, then step marks, then letters', () => {
    const p = prompt();
    const { rerender } = renderView(p, { guideLevel: 1 });
    expect(slots()[6]).toHaveAccessibleName('7: empty');
    expect(screen.queryAllByTestId('d7-step')).toHaveLength(0);
    expect(screen.getByTestId('d7-hint')).toBeEmptyDOMElement();
    rerender(p, { guideLevel: 2 });
    expect(screen.getAllByTestId('d7-step').map((s) => s.textContent)).toEqual([
      'W',
      'W',
      'H',
      'W',
      'W',
      'W',
    ]);
    expect(screen.getByTestId('d7-hint')).toHaveTextContent('Each letter A–G once');
    expect(slotText()[6]).toBe('');
    rerender(p, { guideLevel: 3 });
    expect(slotText()).toEqual(['F♯', 'G', 'A', 'B', 'C', 'D', 'E']);
  });

  it('shows the worked example with the answer to copy on a guided rep', () => {
    renderView(prompt(), { guided: true, guideLevel: 0 });
    expect(screen.getByText(/F♯ major uses each letter once/)).toBeInTheDocument();
    expect(screen.getByText(/Enter it to continue/)).toBeInTheDocument();
    expect(slotText()).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']);
    tap('G sharp');
    expect(slots()[1]).toHaveAttribute('data-state', 'filled');
  });

  it('starts empty again on a new prompt', () => {
    const { rerender } = renderView(prompt());
    tap('G sharp');
    expect(slotText()[1]).toBe('G♯');
    rerender(prompt('spell-key:F'));
    expect(slotText()).toEqual(['F', '', '', '', '', '', '']);
  });

  it('marks each note right, enharmonic or wrong, and explains', () => {
    const p = prompt();
    const answer = { notes: ['G#', 'A', 'B', 'C#', 'D#', 'F'] };
    renderView(p, { feedback: fb(p, answer) });
    expect(slots().map((s) => s.getAttribute('data-verdict'))).toEqual([
      null,
      'correct',
      'wrong',
      'correct',
      'correct',
      'correct',
      'enharmonic',
    ]);
    expect(slots()[6]).toHaveAccessibleName('note 7: F, right pitch, wrong letter');
    expect(slots()[6]).toHaveTextContent('≈');
    expect(slots()[2]).toHaveTextContent('✗');
    expect(screen.getAllByTestId('d7-expected').map((e) => e.textContent)).toEqual(['A♯', 'E♯']);
    const lines = within(screen.getByTestId('d7-explanation')).getAllByRole('listitem');
    expect(lines.map((l) => l.textContent)).toEqual([
      "A isn't the 3rd of F♯ major: it's A♯, 4 half steps above F♯.",
      'Right pitch, wrong letter: F sounds like E♯, but the 7th of F♯ major sits on E (count letters up from F♯: F G A B C D E).',
      'A major key uses each letter A–G exactly once, in order, whatever accidental that needs.',
    ]);
    // The grid and its buttons are gone in feedback.
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
  });

  it('shows no explanation for a correct answer', () => {
    const p = prompt('spell-chord:m7@B');
    renderView(p, { feedback: fb(p, { notes: ['D', 'F#', 'A'] }) });
    expect(screen.queryByTestId('d7-explanation')).toBeNull();
    expect(slots().map((s) => s.getAttribute('data-verdict'))).toEqual([
      null,
      'correct',
      'correct',
      'correct',
    ]);
  });

  it('enters notes from a hardware keyboard', () => {
    const { onAnswer } = renderView(prompt('spell-chord:7@D'));
    key('f');
    key('#');
    key('a');
    key('d');
    key('Backspace');
    key('c');
    key('-');
    key('+');
    key('Enter');
    expect(onAnswer).toHaveBeenCalledWith({ notes: ['F#', 'A', 'C'] });
  });

  it('ignores Enter before the spelling is full, and on a focused button', () => {
    const { onAnswer } = renderView(prompt('spell-chord:major@C'));
    key('#');
    key('e');
    key('Enter');
    expect(onAnswer).not.toHaveBeenCalled();
    key('g');
    fireEvent.keyDown(check(), { key: 'Enter' });
    expect(onAnswer).not.toHaveBeenCalled();
    key('h');
    key('Enter');
    expect(onAnswer).toHaveBeenCalledWith({ notes: ['E', 'G'] });
  });

  it('stops listening to keys in feedback', () => {
    const p = prompt('spell-chord:major@C');
    const { onAnswer } = renderView(p, { feedback: fb(p, { notes: ['E', 'G'] }) });
    key('e');
    key('Enter');
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('asks for one degree', () => {
    const { onAnswer } = renderView(prompt('degree:6@Eb'), { guideLevel: 1 });
    expect(screen.getByText('The 6th of E♭ major?')).toBeInTheDocument();
    expect(slots()).toHaveLength(2);
    expect(slots()[1]).toHaveAccessibleName('6: empty');
    tap('C');
    fireEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ notes: ['C'] });
  });

  it('asks which degree a note is, by button or number key', () => {
    const p = prompt('degree-of:6@Eb');
    const { onAnswer } = renderView(p, { guideLevel: 1 });
    expect(screen.getByText('C is which degree of E♭ major?')).toBeInTheDocument();
    expect(slots()[1]).toHaveAccessibleName('note: C');
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    fireEvent.click(within(grid()).getByRole('button', { name: '6th' }));
    expect(onAnswer).toHaveBeenCalledWith({ degree: 6 });
    key('5');
    expect(onAnswer).toHaveBeenLastCalledWith({ degree: 5 });
  });

  it('marks the picked and expected degree in feedback', () => {
    const p = prompt('degree-of:6@Eb');
    renderView(p, { feedback: fb(p, { degree: 5 }) });
    const buttons = within(grid()).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('data-state'))).toEqual([
      null,
      null,
      null,
      'wrong',
      'expected',
      null,
    ]);
    expect(screen.getByTestId('d7-explanation')).toHaveTextContent(
      'C is the 6th of E♭ major, not the 5th',
    );
  });

  it('marks a correct degree pick', () => {
    const p = prompt('degree-of:6@Eb');
    renderView(p, { feedback: fb(p, { degree: 6 }) });
    expect(within(grid()).getByRole('button', { name: '6th' })).toHaveAttribute(
      'data-state',
      'correct',
    );
  });

  it('teaches the degree-of worked example by naming the button', () => {
    renderView(prompt('degree-of:6@Eb'), { guided: true });
    expect(screen.getByText(/Tap/)).toHaveTextContent('Tap 6th to continue.');
  });

  it('places the context panel beside the question on iPad landscape', () => {
    renderView(prompt(), { withAside: true });
    const panel = screen.getByTestId('context-panel');
    expect(panel.previousElementSibling).toContainElement(screen.getByTestId('d7-subject'));
  });

  it('places the context panel below on narrower screens', () => {
    renderView(prompt(), { withAside: true, sizeClass: 'compact' });
    const drill = screen.getByTestId('d7-drill');
    expect(drill).toHaveAttribute('data-size-class', 'compact');
    expect(drill.lastElementChild).toBe(screen.getByTestId('context-panel'));
  });

  it('lays the grid out by letter column and accidental row', () => {
    renderView(prompt('spell-key:C', 1));
    const sharp = within(grid()).getByRole('button', { name: 'C sharp' });
    const flat = within(grid()).getByRole('button', { name: 'C flat' });
    expect(sharp.style.gridColumn).toBe('3');
    expect(sharp.style.gridRow).toBe('1');
    expect(flat.style.gridRow).toBe('3');
  });
});
