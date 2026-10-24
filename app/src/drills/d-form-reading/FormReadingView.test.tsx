import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { FormReadingContextPanel } from './ContextPanel';
import { FormReadingView } from './FormReadingView';
import {
  formReadingCheck,
  formReadingMakePrompt,
  type FormReadingAnswer,
  type FormReadingPrompt,
} from './logic';
import type { TuneHandlers } from './play';

const prompt = (id: string, rng: () => number = () => 0.99) =>
  formReadingMakePrompt(
    { id, skillId: 'T6.repeats' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

interface Opts {
  guided?: boolean;
  guideLevel?: GuideLevel;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<FormReadingAnswer> | null;
}

function renderView(p: FormReadingPrompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const handlers: { current?: TuneHandlers } = {};
  const stop = vi.fn();
  const play = vi.fn(async (_p: unknown, h: TuneHandlers) => {
    handlers.current = h;
    return stop;
  });
  const props = {
    prompt: p,
    guideLevel: opts.guideLevel ?? 1,
    guided: opts.guided ?? false,
    handedness: 'right' as const,
    sizeClass: opts.sizeClass ?? ('regular-wide' as const),
    tuning: STANDARD_TUNING,
    feedback: opts.feedback ?? null,
    onAnswer,
    aside: <aside data-testid="context-panel" />,
    play,
  };
  const utils = render(<FormReadingView {...props} />);
  return { onAnswer, play, stop, handlers, props, ...utils };
}

const bars = () => within(screen.getByRole('list', { name: 'The tune' })).getAllByRole('listitem');
const fb = (p: FormReadingPrompt, answer: FormReadingAnswer) => ({
  answer,
  result: formReadingCheck(p, answer),
});

describe('<FormReadingView>', () => {
  it('is registered as the form-reading drill for every T6 skill', async () => {
    const drill = getDrill('form-reading');
    expect(await resolveView(drill!.render)).toBe(FormReadingView);
    expect(await resolveView(drill!.contextPanel!)).toBe(FormReadingContextPanel);
    expect(drill!.skills).toEqual([
      'T6.pickups',
      'T6.repeats',
      'T6.endings',
      'T6.pickups-compound',
    ]);
    expect(drill!.inputModes).toEqual(['tap', 'choice', 'keyboard']);
  });

  it('draws a pickup tune unnumbered, and answers with the bar tapped', () => {
    const p = prompt('pickup:4/4:1:bar');
    const { onAnswer } = renderView(p);
    expect(screen.getByText('Tap bar 2.')).toBeInTheDocument();
    expect(bars()).toHaveLength(5);
    // Bars are named by place, not number, so the names give nothing away.
    const first = screen.getByRole('button', { name: /^1st bar on the page: / });
    expect(first.textContent).not.toContain('Pickup');
    expect(screen.queryByRole('button', { name: /^Bar / })).toBeNull();
    // The time signature and a final barline are drawn.
    expect(first.querySelector('text')?.textContent).toBe('4');
    expect(bars()[4]!.querySelector('[data-sign="barline"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^3rd bar on the page/ }));
    expect(onAnswer).toHaveBeenCalledWith([2]);
  });

  it('marks a wrong pickup bar and the right one, numbers them, and explains', () => {
    const p = prompt('pickup:4/4:1:bar');
    renderView(p, { feedback: fb(p, [1]) });
    expect(bars()[1]).toHaveAttribute('data-state', 'wrong');
    expect(bars()[2]).toHaveAttribute('data-state', 'expected');
    expect(bars()[0]).toHaveTextContent('Pickup');
    expect(bars()[1]).toHaveTextContent('✗ 1');
    const feedback = screen.getByTestId('form-feedback');
    expect(feedback).toHaveTextContent('counting the pickup as bar 1');
    expect(feedback).toHaveTextContent("it's a pickup");
    for (const b of screen.getAllByRole('button', { name: /^(Pickup|Bar)/ }))
      expect(b).toBeDisabled();
  });

  it('rings the target in the worked example, with each bar’s count', () => {
    const p = prompt('pickup:3/4:2:bar');
    renderView(p, { guided: true });
    expect(screen.getByText(/Tap bar 2 to continue\.$/)).toBeInTheDocument();
    expect(bars()[2]).toHaveAttribute('data-state', 'asked');
    expect(bars()[0]).toHaveTextContent('2 beats');
    expect(bars()[1]).toHaveTextContent('3 beats');
    expect(screen.getByRole('button', { name: 'Hear it in order' })).toBeInTheDocument();
  });

  it('asks where a pickup starts with a row of beats, by tap or key', () => {
    const p = prompt('pickup:4/4:1:start');
    const { onAnswer } = renderView(p);
    const row = within(screen.getByRole('group'));
    expect(row.getAllByRole('button').map((b) => b.textContent)).toEqual(['1', '2', '3', '4']);
    fireEvent.click(row.getByRole('button', { name: 'Beat 4' }));
    expect(onAnswer).toHaveBeenLastCalledWith([4]);
    fireEvent.keyDown(window, { key: '3' });
    expect(onAnswer).toHaveBeenLastCalledWith([3]);
    // Keys a card doesn't offer, and modified ones, do nothing.
    fireEvent.keyDown(window, { key: '9' });
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it('asks a road map’s turn, ringing the bar asked about', () => {
    const p = prompt('form:repeat-inner:next');
    const { onAnswer } = renderView(p);
    expect(bars()[2]).toHaveAttribute('data-state', 'asked');
    expect(bars()[1]!.querySelector('[data-sign="repeat-start"]')).not.toBeNull();
    expect(bars()[2]!.querySelector('[data-sign="repeat-end"]')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Bar 2, begin repeat' })).toBeInTheDocument();
    const row = within(screen.getByRole('group'));
    expect(row.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Bar 1',
      'Bar 2',
      'Bar 4',
    ]);
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenCalledWith([1]);
  });

  it('shows a wrong turn on the buttons and the bars', () => {
    const p = prompt('form:repeat-inner:next');
    renderView(p, { feedback: fb(p, [0]) });
    const row = within(screen.getByRole('group'));
    expect(row.getByRole('button', { name: 'Bar 1' })).toHaveAttribute('data-state', 'wrong');
    expect(row.getByRole('button', { name: 'Bar 2' })).toHaveAttribute('data-state', 'expected');
    expect(bars()[0]).toHaveAttribute('data-state', 'wrong');
    expect(bars()[1]).toHaveAttribute('data-state', 'expected');
    expect(screen.getByTestId('form-feedback')).toHaveTextContent('Play 1 2 3 2 3 4.');
    // Keys do nothing once answered.
    fireEvent.keyDown(window, { key: '1' });
  });

  it('marks a right turn on the bars', () => {
    const p = prompt('form:endings:next');
    renderView(p, { feedback: fb(p, [4]) });
    expect(bars()[4]).toHaveAttribute('data-state', 'correct');
    expect(bars()[3]!.querySelector('[data-sign="ending-1"]')).not.toBeNull();
    expect(bars()[4]!.querySelector('[data-sign="ending-2"]')).not.toBeNull();
  });

  it('takes the play order tap by tap, badging each bar, and ends at the last', () => {
    const p = prompt('form:repeat-tail:order');
    const { onAnswer } = renderView(p);
    expect(screen.getByTestId('form-path')).toHaveTextContent('tap the first bar');
    for (const n of [1, 2, 3, 4, 3])
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Bar ${n}\\b`) }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByTestId('form-path')).toHaveTextContent('Your order: 1 2 3 4 3');
    expect(
      screen.getByRole('button', { name: 'Bar 3, begin repeat, tapped 3 and 5' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '4' });
    expect(onAnswer).toHaveBeenCalledWith([0, 1, 2, 3, 2, 3]);
  });

  it('ends the play order at the first wrong tap, and marks that turn', () => {
    const p = prompt('form:repeat-tail:order');
    const { onAnswer, rerender, props } = renderView(p);
    for (const n of [1, 2, 3, 4, 1])
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Bar ${n}\\b`) }));
    expect(onAnswer).toHaveBeenCalledWith([0, 1, 2, 3, 0]);
    rerender(<FormReadingView {...props} feedback={fb(p, [0, 1, 2, 3, 0])} />);
    expect(bars()[0]).toHaveAttribute('data-state', 'wrong');
    expect(bars()[2]).toHaveAttribute('data-state', 'expected');
    expect(screen.getByTestId('form-feedback')).toHaveTextContent("there's one at bar 3");
    // A new card starts with no taps.
    rerender(<FormReadingView {...props} prompt={prompt('form:repeat-all:order')} />);
    expect(screen.getByTestId('form-path')).toHaveTextContent('tap the first bar');
  });

  it('plays the tune in order, lighting each bar, and stops on a second tap', async () => {
    const p = prompt('form:repeat-inner:next');
    const { play, stop, handlers } = renderView(p, { feedback: fb(p, [1]) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hear it in order' }));
    });
    expect(play).toHaveBeenCalledWith(p, expect.anything());
    act(() => handlers.current!.onStep(3));
    // Step 3 of 1 2 3 2 3 4 is bar 2.
    expect(bars()[1]).toHaveAttribute('data-playing', 'true');
    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Hear it in order' })).toBeInTheDocument();
  });

  it('settles when the tune ends by itself', async () => {
    const p = prompt('pickup:4/4:1:start');
    const { handlers } = renderView(p, { feedback: fb(p, [4]) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hear it in order' }));
    });
    act(() => handlers.current!.onStep(0));
    expect(bars()[0]).toHaveAttribute('data-playing', 'true');
    act(() => handlers.current!.onEnd());
    expect(bars()[0]).not.toHaveAttribute('data-playing');
  });

  it('puts the panel beside the question on iPad landscape, and after the tune otherwise', () => {
    const p = prompt('form:repeat-all:order');
    const { unmount } = renderView(p);
    const panel = screen.getByTestId('context-panel');
    expect(panel.compareDocumentPosition(screen.getByTestId('form-sheet'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    unmount();
    renderView(p, { sizeClass: 'compact' });
    expect(screen.getByTestId('form-drill')).toHaveAttribute('data-size-class', 'compact');
    expect(
      screen.getByTestId('context-panel').compareDocumentPosition(screen.getByTestId('form-sheet')),
    ).toBe(Node.DOCUMENT_POSITION_PRECEDING);
  });
});

describe('<FormReadingContextPanel>', () => {
  const panel = (p: FormReadingPrompt, guideLevel: GuideLevel, guided = false) =>
    render(
      <FormReadingContextPanel
        prompt={p}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );

  it('gives the pickup rules, never the answer', () => {
    panel(prompt('pickup:4/4:2:bar'), 1);
    expect(screen.getByRole('heading', { name: 'Pickups' })).toBeInTheDocument();
    expect(screen.getByText(/bar 1 is the first full bar/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('adds the signs from level 2, with endings when the card has them', () => {
    const { unmount } = panel(prompt('form:repeat-all:next'), 2);
    expect(screen.getByRole('heading', { name: 'Repeats' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((l) => l.textContent?.trim())).toEqual([
      'Begin repeat',
      'End repeat',
    ]);
    unmount();
    panel(prompt('form:endings:next'), 1, true);
    expect(screen.getByText('1st and 2nd endings')).toBeInTheDocument();
    expect(screen.getByText(/skip it and play the 2nd/)).toBeInTheDocument();
  });

  it('is empty at guide level 0', () => {
    panel(prompt('form:endings:next'), 0);
    expect(screen.queryAllByRole('paragraph')).toHaveLength(0);
    expect(screen.queryByRole('list')).toBeNull();
  });
});
