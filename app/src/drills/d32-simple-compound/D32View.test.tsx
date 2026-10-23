import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { meterItemId, type MeterFact } from '../../engine/items/meter';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { createFakeMetronome, type FakeMetronome } from '../../timing/fake-metronome';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { BeatStrip, hearOptions } from './BeatStrip';
import { SimpleCompoundContextPanel } from './ContextPanel';
import { D32View } from './D32View';
import { d32Check, d32MakePrompt, type D32Answer, type D32Prompt } from './logic';

const prompt = (meter: string, fact: MeterFact, scopeLevel = 0) =>
  d32MakePrompt(
    { id: meterItemId(meter, fact), skillId: 'T2.compound-meters' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

interface Opts {
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D32Answer> | null;
  metronome?: FakeMetronome;
}

function renderView(p: D32Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const metronome = opts.metronome ?? createFakeMetronome();
  const utils = render(
    <D32View
      prompt={p}
      guideLevel={3}
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

const answers = () => within(screen.getByRole('group')).getAllByRole('button');
const fb = (p: D32Prompt, answer: D32Answer) => ({ answer, result: d32Check(p, answer) });

describe('<D32View>', () => {
  it('is registered as the simple-compound drill for every T1 and T2 skill', async () => {
    const drill = getDrill('simple-compound');
    expect(await resolveView(drill!.render)).toBe(D32View);
    expect(await resolveView(drill!.contextPanel!)).toBe(SimpleCompoundContextPanel);
    expect(drill!.skills).toEqual([
      'T1.simple-meters',
      'T2.compound-meters',
      'T2.simple-or-compound',
      'T2.cut-time',
    ]);
    expect(drill!.inputModes).toContain('keyboard');
  });

  it('prints the time signature and asks for its felt beats', () => {
    const { onAnswer } = renderView(prompt('6/8', 'feltBeats'));
    expect(screen.getByRole('img', { name: '6 8 time' })).toHaveTextContent('68');
    expect(screen.getByText('How many beats do you feel in a bar?')).toBeInTheDocument();
    expect(answers().map((b) => b.textContent)).toEqual(['2', '3', '4', '6']);
    fireEvent.click(screen.getByRole('button', { name: '2 beats' }));
    expect(onAnswer).toHaveBeenCalledWith('2');
    // No beat strip before an answer: it would give the answer away.
    expect(screen.queryByTestId('d32-strip')).toBeNull();
  });

  it('asks the other way with the beats in words', () => {
    const { onAnswer } = renderView(prompt('6/8', 'fromBeats'));
    expect(screen.getByTestId('d32-subject')).toHaveTextContent('2 dotted-quarter beats a bar');
    expect(answers().map((b) => b.getAttribute('aria-label'))).toEqual([
      '3 4 time',
      '6 8 time',
      '9 8 time',
      '12 8 time',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '3 4 time' }));
    expect(onAnswer).toHaveBeenCalledWith('3/4');
  });

  it('answers from the keyboard: numbers for beats, 1 then 2 for 12', () => {
    const { onAnswer, unmount } = renderView(prompt('12/8', 'feltBeats'));
    fireEvent.keyDown(window, { key: '1' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenCalledWith('12');
    unmount();

    const kind = renderView(prompt('6/8', 'kind'));
    fireEvent.keyDown(window, { key: 'C' });
    expect(kind.onAnswer).toHaveBeenCalledWith('compound');
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(kind.onAnswer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Simple' })).toHaveAttribute(
      'aria-keyshortcuts',
      '1 s',
    );
  });

  it('ignores the keyboard while showing feedback', () => {
    const p = prompt('3/4', 'beatUnit');
    const { onAnswer } = renderView(p, { feedback: fb(p, '4') });
    fireEvent.keyDown(window, { key: '1' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('marks a wrong answer, explains it, and draws both meters’ beats', () => {
    const p = prompt('6/8', 'feltBeats');
    renderView(p, { feedback: fb(p, '3') });
    expect(screen.getByRole('button', { name: '3 beats' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: '2 beats' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    for (const b of answers()) expect(b).toBeDisabled();
    const feedback = screen.getByTestId('d32-feedback');
    expect(feedback).toHaveTextContent(/3 beats is 3\/4/);
    expect(feedback).toHaveTextContent(/6\/8 is compound time/);
    expect(screen.getAllByTestId('d32-strip').map((s) => s.dataset.meter)).toEqual(['6/8', '3/4']);
    expect(screen.getByRole('img', { name: '6/8: 2 beats, each 3 eighths' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '3/4: 3 beats' })).toBeInTheDocument();
  });

  it('marks a right answer and draws its own beats only', () => {
    const p = prompt('3/4', 'kind');
    renderView(p, { feedback: fb(p, 'simple') });
    expect(screen.getByRole('button', { name: 'Simple' })).toHaveAttribute('data-state', 'correct');
    expect(screen.getAllByTestId('d32-strip')).toHaveLength(1);
  });

  it('works the first rep as an example', () => {
    renderView(prompt('2/2', 'beatUnit'), { guided: true });
    expect(screen.getByText(/Tap/)).toHaveTextContent('Tap half to continue.');
    expect(screen.getByTestId('d32-feedback')).toHaveTextContent(/cut time/);
    expect(screen.getByTestId('d32-strip')).toHaveAttribute('data-meter', '2/2');
  });

  it('puts the context panel beside the card on a wide iPad, and below elsewhere', () => {
    const { container, unmount } = renderView(prompt('6/8', 'kind'));
    const upper = container.querySelector('[data-testid="d32-drill"] > div')!;
    expect(within(upper as HTMLElement).getByTestId('context-panel')).toBeInTheDocument();
    unmount();
    const compact = renderView(prompt('6/8', 'kind'), { sizeClass: 'compact' });
    const drill = compact.getByTestId('d32-drill');
    expect(drill.lastElementChild).toHaveAttribute('data-testid', 'context-panel');
  });
});

describe('<BeatStrip>', () => {
  it('plays two bars on the click, lighting each pulse, then stops', async () => {
    const metronome = createFakeMetronome();
    render(<BeatStrip meter="6/8" metronome={metronome} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hear 6/8' }));
    });
    expect(metronome.layout?.meter).toEqual({ groups: [3, 3], unit: 8 });
    expect(screen.getByRole('button', { name: 'Hear 6/8' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    act(() => void metronome.tick());
    act(() => void metronome.tick());
    const strip = screen.getByTestId('d32-strip');
    const lit = () => [...strip.querySelectorAll('[data-lit]')].map((c) => c.textContent);
    expect(lit()).toEqual(['la']);
    // Through both bars to the next downbeat, which is silent and stops the run.
    act(() => {
      for (let i = 0; i < 11; i++) metronome.tick();
    });
    expect(metronome.running).toBe(false);
    expect(screen.getByRole('button', { name: 'Hear 6/8' })).toHaveTextContent('Hear it');
    expect(lit()).toEqual([]);
  });

  it('stops on a second tap, and when audio stays locked', async () => {
    const metronome = createFakeMetronome();
    render(<BeatStrip meter="3/4" metronome={metronome} />);
    const button = screen.getByRole('button', { name: 'Hear 3/4' });
    await act(async () => fireEvent.click(button));
    expect(metronome.running).toBe(true);
    await act(async () => fireEvent.click(button));
    expect(metronome.running).toBe(false);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    metronome.refuseNextStart();
    await act(async () => fireEvent.click(button));
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('stops a run when the card goes', async () => {
    const metronome = createFakeMetronome();
    const { unmount } = render(<BeatStrip meter="3/4" metronome={metronome} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Hear 3/4' })));
    unmount();
    expect(metronome.running).toBe(false);
  });

  it('clicks at a steady felt-beat tempo, accenting the felt beats', () => {
    const six = hearOptions('6/8');
    const three = hearOptions('3/4');
    expect(six.bpm).toBe(three.bpm * 3);
    expect(three.meter).toEqual({ groups: [3], unit: 4 });
    expect(six.countInBars).toBe(0);
  });
});

describe('<SimpleCompoundContextPanel>', () => {
  const panel = (guideLevel: GuideLevel, guided = false) =>
    render(
      <SimpleCompoundContextPanel
        prompt={prompt('6/8', 'feltBeats')}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );

  it('shows the rules, then counting, and fades', () => {
    const { container, unmount } = panel(1);
    expect(container).toHaveTextContent(/Compound time: a top number of 6, 9 or 12/);
    expect(container).not.toHaveTextContent(/1 la li/);
    unmount();
    const two = panel(2);
    expect(two.container).toHaveTextContent(/1 la li 2 la li/);
    two.unmount();
    const none = panel(0);
    expect(none.container.querySelectorAll('p')).toHaveLength(0);
    none.unmount();
    expect(panel(0, true).container).toHaveTextContent(/1 la li/);
  });
});
