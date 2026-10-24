import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meterItemId } from '../../engine/items/meter';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import { createFakeMetronome, type FakeMetronome } from '../../timing/fake-metronome';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { CompleteBarContextPanel } from './ContextPanel';
import { D29View } from './D29View';
import { HearBar } from './HearBar';
import { FULL_PALETTE, SMALL_PALETTE, d29Check, type D29Answer, type D29Prompt } from './logic';

// The staff's engraving is <Staff>'s own concern (M8-02); here it is a stub
// that shows what it was given.
vi.mock('../../components/staff', () => ({
  Staff: ({
    notes,
    label,
  }: {
    notes: { value: string; dots: number; style: string }[];
    label: string;
  }) => (
    <div
      data-testid="staff"
      aria-label={label}
      data-notes={notes.map((n) => `${n.value}${'.'.repeat(n.dots)}:${n.style}`).join(' ')}
    />
  ),
}));

const prompt = (over: Partial<D29Prompt> = {}): D29Prompt => ({
  itemId: meterItemId('6/8', 'feltBeats'),
  meter: '6/8',
  given: '4.',
  palette: [...SMALL_PALETTE],
  solution: '4 8',
  ...over,
});

interface Opts {
  guided?: boolean;
  guideLevel?: GuideLevel;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D29Answer> | null;
  metronome?: FakeMetronome;
}

function renderView(p: D29Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const metronome = opts.metronome ?? createFakeMetronome();
  const utils = render(
    <D29View
      prompt={p}
      guideLevel={opts.guideLevel ?? 3}
      guided={opts.guided ?? false}
      handedness="right"
      sizeClass={opts.sizeClass ?? 'regular-wide'}
      tuning={STANDARD_TUNING}
      feedback={opts.feedback ?? null}
      onAnswer={onAnswer}
      aside={<aside data-testid="context-panel" />}
      metronome={metronome}
    />,
  );
  return { onAnswer, metronome, ...utils };
}

const tile = (name: string) =>
  within(screen.getByRole('group', { name: 'Note values' })).getByRole('button', { name });
const placed = () => screen.queryAllByTestId('d29-placed');
const staffNotes = () => screen.getAllByTestId('staff')[0]!.getAttribute('data-notes');
const fb = (p: D29Prompt, text: string) => {
  const answer = { placed: text.split(' ') };
  return { answer, result: d29Check(p, answer) };
};

afterEach(() => {
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

describe('<D29View>', () => {
  it('is registered as the complete-the-bar drill for T1 and T2', async () => {
    const drill = getDrill('complete-the-bar');
    expect(await resolveView(drill!.render)).toBe(D29View);
    expect(await resolveView(drill!.contextPanel!)).toBe(CompleteBarContextPanel);
    expect(drill!.skills).toEqual(
      expect.arrayContaining(['T1.simple-meters', 'T2.compound-meters', 'T2.cut-time']),
    );
  });

  it('prints the time signature, the given start and the palette', () => {
    renderView(prompt());
    expect(screen.getByRole('img', { name: '6 8 time' })).toBeInTheDocument();
    expect(screen.getByText('Complete the bar.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Given: dotted quarter' })).toBeInTheDocument();
    expect(staffNotes()).toBe('q.:plain');
    const tiles = within(screen.getByRole('group', { name: 'Note values' })).getAllByRole('button');
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Half',
      'Dotted quarter',
      'Quarter',
      'Eighth',
    ]);
    expect(tiles.map((t) => t.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2', '3', '4']);
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('adds a tapped value at the end, then checks', () => {
    const { onAnswer } = renderView(prompt());
    fireEvent.click(tile('Quarter'));
    fireEvent.click(tile('Eighth'));
    expect(placed().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Quarter, value 1 of 2',
      'Eighth, value 2 of 2',
    ]);
    expect(staffNotes()).toBe('q.:plain q:plain 8:plain');
    expect(screen.getByTestId('d29-status')).toHaveTextContent('Placed eighth. Full.');
    expect(screen.getByTestId('d29-room')).toHaveTextContent('Full');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith({ placed: ['4', '8'] });
  });

  it('takes a tapped placed value out, and undoes', () => {
    renderView(prompt());
    fireEvent.click(tile('Quarter'));
    fireEvent.click(tile('Eighth'));
    fireEvent.click(placed()[0]!);
    expect(placed().map((b) => b.getAttribute('aria-label'))).toEqual(['Eighth, value 1 of 1']);
    expect(screen.getByTestId('d29-status')).toHaveTextContent(
      'Took out quarter. Room for a quarter.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(placed()).toHaveLength(2);
  });

  it('answers from a hardware keyboard: numbers, Backspace and Enter', () => {
    const { onAnswer } = renderView(prompt());
    fireEvent.keyDown(window, { key: '3' });
    fireEvent.keyDown(window, { key: '3' });
    expect(placed()).toHaveLength(2);
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(placed()).toHaveLength(1);
    fireEvent.keyDown(window, { key: '4' });
    // Modified keys are the browser's.
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith({ placed: ['4', '8'] });
  });

  it("doesn't check on Enter while a button has focus (that is the button's click)", () => {
    const { onAnswer } = renderView(prompt());
    fireEvent.click(tile('Quarter'));
    fireEvent.keyDown(tile('Quarter'), { key: 'Enter' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('moves a focused placed value with the arrow keys, and Delete takes it out', async () => {
    renderView(prompt({ given: '' }));
    for (const name of ['Quarter', 'Eighth', 'Half']) fireEvent.click(tile(name));
    fireEvent.keyDown(placed()[0]!, { key: 'ArrowRight' });
    expect(placed().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Eighth, value 1 of 3',
      'Quarter, value 2 of 3',
      'Half, value 3 of 3',
    ]);
    expect(screen.getByTestId('d29-status')).toHaveTextContent('Moved to value 2 of 3.');
    // At the end it stays put.
    fireEvent.keyDown(placed()[2]!, { key: 'ArrowRight' });
    expect(placed()[2]).toHaveAccessibleName('Half, value 3 of 3');
    fireEvent.keyDown(placed()[1]!, { key: 'Delete' });
    expect(placed().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Eighth, value 1 of 2',
      'Half, value 2 of 2',
    ]);
    await waitFor(() => expect(placed()[1]).toHaveFocus());
  });

  it('drops a dragged value on the bar, before the value it lands on', () => {
    renderView(prompt({ given: '' }));
    fireEvent.click(tile('Eighth'));
    const bar = screen.getByTestId('d29-bar');
    document.elementFromPoint = vi.fn(() => bar);
    fireEvent.pointerDown(tile('Half'), { pointerId: 1, clientX: 10, clientY: 300 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 40, clientY: 100 });
    expect(screen.getByTestId('d29-drag')).toBeInTheDocument();
    expect(bar).toHaveAttribute('data-target', 'true');
    expect(tile('Half')).toHaveAttribute('data-grabbed', 'true');
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 40, clientY: 100 });
    // The click after a drag isn't a tap.
    fireEvent.click(tile('Half'));
    expect(placed().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Eighth, value 1 of 2',
      'Half, value 2 of 2',
    ]);
    expect(screen.queryByTestId('d29-drag')).not.toBeInTheDocument();

    // Onto a placed value: in before it.
    document.elementFromPoint = vi.fn(() => placed()[0]!);
    fireEvent.pointerDown(tile('Quarter'), { pointerId: 2, clientX: 10, clientY: 300 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 40, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 40, clientY: 100 });
    expect(placed()[0]).toHaveAccessibleName('Quarter, value 1 of 3');
  });

  it('moves a placed value by dragging it, and drags it off the bar to remove it', () => {
    renderView(prompt({ given: '' }));
    for (const name of ['Quarter', 'Eighth', 'Half']) fireEvent.click(tile(name));
    // The quarter onto the half: it lands just before it.
    document.elementFromPoint = vi.fn(() => placed()[2]!);
    fireEvent.pointerDown(placed()[0]!, { pointerId: 3, clientX: 10, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 90, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 90, clientY: 100 });
    expect(placed().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Eighth, value 1 of 3',
      'Quarter, value 2 of 3',
      'Half, value 3 of 3',
    ]);
    // Off the bar.
    document.elementFromPoint = vi.fn(() => document.body);
    fireEvent.pointerDown(placed()[2]!, { pointerId: 4, clientX: 10, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 10, clientY: 400 });
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 10, clientY: 400 });
    expect(placed()).toHaveLength(2);
  });

  it('ignores a short press, another pointer and a cancelled drag', () => {
    renderView(prompt());
    const bar = screen.getByTestId('d29-bar');
    document.elementFromPoint = vi.fn(() => bar);
    fireEvent.pointerDown(tile('Half'), { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 12, clientY: 12 });
    fireEvent.pointerMove(window, { pointerId: 9, clientX: 200, clientY: 200 });
    expect(screen.queryByTestId('d29-drag')).not.toBeInTheDocument();
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 80, clientY: 80 });
    fireEvent.pointerCancel(window, { pointerId: 9 });
    expect(screen.getByTestId('d29-drag')).toBeInTheDocument();
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(screen.queryByTestId('d29-drag')).not.toBeInTheDocument();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 80, clientY: 80 });
    expect(placed()).toHaveLength(0);
    // A right-click drags nothing.
    fireEvent.pointerDown(tile('Half'), { pointerId: 5, pointerType: 'mouse', button: 2 });
    fireEvent.pointerMove(window, { pointerId: 5, clientX: 300, clientY: 300 });
    expect(screen.queryByTestId('d29-drag')).not.toBeInTheDocument();
  });

  it('explains a wrong fill, marks it, and shows one way to fill the bar', () => {
    const p = prompt({ given: '', solution: '4. 4.' });
    renderView(p, { feedback: fb(p, '4 4 4') });
    expect(screen.getByTestId('d29-explanation')).toHaveTextContent(
      '6/8 groups in dotted quarters',
    );
    expect(screen.getByTestId('d29-explanation')).toHaveTextContent('a bar of 3/4');
    expect(screen.getByTestId('d29-feedback')).toHaveTextContent('Compound duple');
    expect(placed().map((b) => b.getAttribute('data-mark') ?? '')).toEqual(['', 'wrong', '']);
    expect(placed().every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(staffNotes()).toBe('q:plain q:wrong q:plain');
    const solution = screen.getByTestId('d29-solution');
    expect(within(solution).getByTestId('staff')).toHaveAttribute(
      'data-notes',
      'q.:correct q.:correct',
    );
    expect(screen.getByRole('button', { name: 'Hear your bar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hear this bar' })).toBeInTheDocument();
    // The palette is gone, and keys do nothing.
    expect(screen.queryByRole('group', { name: 'Note values' })).not.toBeInTheDocument();
    // Feedback draws the scale and its beats whatever the guide level.
    expect(screen.getAllByTestId('d29-beat-line')).toHaveLength(2);
  });

  it('marks a right fill and shows no other bar', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, '8 8 8'), guideLevel: 0 });
    expect(placed().map((b) => b.getAttribute('data-mark'))).toEqual([
      'correct',
      'correct',
      'correct',
    ]);
    expect(screen.queryByTestId('d29-explanation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('d29-solution')).not.toBeInTheDocument();
  });

  it('fades the bar to scale, then its beats (rule 9)', () => {
    const { rerender } = renderView(prompt(), { guideLevel: 0 });
    expect(screen.queryByTestId('d29-ruler')).not.toBeInTheDocument();
    expect(screen.queryByTestId('d29-room')).not.toBeInTheDocument();
    const at = (guideLevel: GuideLevel) => (
      <D29View
        prompt={prompt()}
        guideLevel={guideLevel}
        guided={false}
        handedness="right"
        sizeClass="regular-wide"
        tuning={STANDARD_TUNING}
        feedback={null}
        onAnswer={() => {}}
      />
    );
    rerender(at(1));
    expect(screen.getByTestId('d29-ruler')).toBeInTheDocument();
    expect(screen.queryByTestId('d29-beat-line')).not.toBeInTheDocument();
    rerender(at(2));
    expect(screen.getAllByTestId('d29-beat-line')).toHaveLength(2);
    expect(screen.getByTestId('d29-room')).toHaveTextContent('Room for a dotted quarter');
  });

  it('works the first rep as an example: it names the fill and marks its values', () => {
    renderView(prompt({ given: '8 8 8', solution: '4 8' }), { guided: true, guideLevel: 0 });
    expect(screen.getByText(/Place a quarter and an eighth to finish it/)).toBeInTheDocument();
    expect(tile('Quarter')).toHaveAttribute('data-hint', 'true');
    expect(tile('Eighth')).toHaveAttribute('data-hint', 'true');
    expect(tile('Half')).not.toHaveAttribute('data-hint');
    expect(screen.getByTestId('d29-ruler')).toBeInTheDocument();
  });

  it('starts a new prompt empty', () => {
    const { rerender } = renderView(prompt());
    fireEvent.click(tile('Quarter'));
    const next = prompt({ palette: [...FULL_PALETTE], given: '' });
    rerender(
      <D29View
        prompt={next}
        guideLevel={3}
        guided={false}
        handedness="right"
        sizeClass="regular-wide"
        tuning={STANDARD_TUNING}
        feedback={null}
        onAnswer={() => {}}
      />,
    );
    expect(placed()).toHaveLength(0);
    expect(screen.getByText('Fill the bar.')).toBeInTheDocument();
    expect(screen.getByTestId('d29-drop')).toHaveTextContent('Drop here');
  });

  it('places the context panel beside the bar on a wide iPad, below it otherwise', () => {
    const { unmount } = renderView(prompt());
    expect(screen.getByTestId('context-panel').parentElement?.className).toMatch(/upper/);
    unmount();
    renderView(prompt(), { sizeClass: 'compact' });
    expect(screen.getByTestId('context-panel').parentElement).toBe(screen.getByTestId('d29-drill'));
  });
});

describe('<HearBar>', () => {
  it('counts in a bar of beats, clicks on the notes and stops at the barline', async () => {
    const metronome = createFakeMetronome();
    render(<HearBar rhythm="4 8 4." meter="6/8" label="Hear your bar" metronome={metronome} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hear your bar' }));
    await waitFor(() => expect(metronome.running).toBe(true));
    expect(screen.getByRole('button', { name: 'Hear your bar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    let clicks: ReturnType<FakeMetronome['tickUntil']> = [];
    act(() => {
      clicks = metronome.tickUntil(6);
    });
    expect(clicks.filter((c) => c.countIn && c.audible)).toHaveLength(6);
    expect(clicks.filter((c) => !c.countIn && c.audible).map((c) => c.pulse)).toEqual([0, 2, 3]);
    act(() => void metronome.tick());
    expect(metronome.running).toBe(false);
    expect(screen.getByRole('button', { name: 'Hear your bar' })).toHaveTextContent(
      'Hear your bar',
    );
  });

  it('stops on a second tap, on unmount, and gives up if audio stays locked', async () => {
    const metronome = createFakeMetronome();
    const { unmount } = render(
      <HearBar rhythm="2" meter="2/4" label="Hear this bar" metronome={metronome} />,
    );
    const button = screen.getByRole('button', { name: 'Hear this bar' });
    fireEvent.click(button);
    await waitFor(() => expect(metronome.running).toBe(true));
    expect(button).toHaveTextContent('Stop');
    fireEvent.click(button);
    expect(metronome.running).toBe(false);
    metronome.refuseNextStart();
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
    fireEvent.click(button);
    await waitFor(() => expect(metronome.running).toBe(true));
    unmount();
    expect(metronome.running).toBe(false);
  });
});

describe('<CompleteBarContextPanel>', () => {
  const panel = (guideLevel: GuideLevel, guided = false) =>
    render(
      <CompleteBarContextPanel
        prompt={prompt()}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );

  it('gives the rules for filling a bar, faded at level 0', () => {
    const { unmount } = panel(1);
    expect(screen.getByText(/each beat is a dotted quarter/)).toBeInTheDocument();
    unmount();
    panel(0);
    expect(screen.queryByText(/each beat is a dotted quarter/)).not.toBeInTheDocument();
  });

  it('shows the rules on the worked example', () => {
    panel(0, true);
    expect(screen.getByText(/each beat is a dotted quarter/)).toBeInTheDocument();
  });
});
