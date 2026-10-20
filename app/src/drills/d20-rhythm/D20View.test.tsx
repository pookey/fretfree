import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS, type GuideLevel } from '../../engine/model';
import { getTuning } from '../../theory';
import { createFakeMetronome, type FakeMetronome } from '../../timing/fake-metronome';
import type { OnsetKind } from '../../timing/latency';
import { createFakeOnsetSource, type FakeOnsetSource } from '../../timing/onsets';
import type { SizeClass } from '../../shell/size-class';
import { RhythmPanel } from './ContextPanel';
import { RhythmDrill } from './D20View';
import { d20Check, d20MakePrompt, type D20Answer, type D20Prompt } from './logic';

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

const prompt = (id: string): D20Prompt =>
  d20MakePrompt(
    { id, skillId: 'F4.pulse' },
    { tuning: getTuning('standard'), accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

beforeEach(() => {
  useAppStore.setState({
    settings: { ...DEFAULT_SETTINGS, timingOffsets: { tap: 0, mic: 0 } },
    loaded: true,
  });
});

interface Setup {
  id?: string;
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: { answer: D20Answer };
}

function setup({
  id = 'tap-rhythm:quarters',
  guideLevel = 1,
  guided = false,
  sizeClass = 'regular-wide',
  feedback,
}: Setup = {}) {
  const p = prompt(id);
  const metronome: FakeMetronome = createFakeMetronome();
  const sources: Record<OnsetKind, FakeOnsetSource> = {
    tap: createFakeOnsetSource('tap'),
    mic: createFakeOnsetSource('mic'),
  };
  const onAnswer = vi.fn<(a: D20Answer) => void>();
  const view = render(
    <RhythmDrill
      prompt={p}
      guideLevel={guideLevel}
      guided={guided}
      handedness="right"
      sizeClass={sizeClass}
      tuning={getTuning('standard')}
      feedback={feedback ? { answer: feedback.answer, result: d20Check(p, feedback.answer) } : null}
      onAnswer={onAnswer}
      aside={<aside data-testid="aside" />}
      metronome={metronome}
      createSource={(kind) => sources[kind]}
    />,
  );
  return { p, metronome, sources, onAnswer, view };
}

/** Ticks the run's clicks to `pulse`, playing each hit `offset` ms off on the way. */
function playTo(
  metronome: FakeMetronome,
  source: FakeOnsetSource,
  p: D20Prompt,
  pulse: number,
  offset = 0,
) {
  act(() => {
    while (metronome.running) {
      const click = metronome.tick()!;
      if (p.pulses.includes(click.pulse)) source.emit(click.at + offset);
      if (click.pulse >= pulse) break;
    }
  });
}

describe('<RhythmDrill>', () => {
  it('shows the rhythm on a one-bar grid with its counts, beside the context panel', () => {
    setup({ id: 'tap-rhythm:offbeats' });
    expect(screen.getByTestId('d20-prompt')).toHaveTextContent('Tap Only the “&”s at 60 BPM');
    expect(screen.getByTestId('d20-explain')).toHaveTextContent(/halfway between the clicks/);
    const cells = within(screen.getByRole('list', { name: 'The rhythm, one bar' })).getAllByRole(
      'listitem',
    );
    expect(cells.map((c) => c.getAttribute('aria-label'))).toEqual([
      '1: rest',
      '& of 1: tap',
      '2: rest',
      '& of 2: tap',
      '3: rest',
      '& of 3: tap',
      '4: rest',
      '& of 4: tap',
    ]);
    expect(cells.map((c) => c.textContent)).toEqual(['1', '&', '2', '&', '3', '&', '4', '&']);
    expect(screen.getByTestId('aside')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    // Taps only: mic mode is off.
    expect(screen.queryByRole('group', { name: 'Play by' })).not.toBeInTheDocument();
  });

  it('fades the counts at guide level 0', () => {
    setup({ guideLevel: 0 });
    const cells = within(screen.getByTestId('d20-grid')).getAllByRole('listitem');
    expect(cells.every((c) => c.textContent === '')).toBe(true);
  });

  it('marks the strokes of a strumming pattern', () => {
    setup({ id: 'strum-rhythm:d-du-udu' });
    const cells = within(screen.getByTestId('d20-grid')).getAllByRole('listitem');
    expect(cells.map((c) => c.getAttribute('aria-label'))).toEqual([
      '1: down strum',
      '& of 1: rest',
      '2: down strum',
      '& of 2: up strum',
      '3: rest',
      '& of 3: up strum',
      '4: down strum',
      '& of 4: up strum',
    ]);
    expect(cells[0]).toHaveTextContent('↓');
    expect(cells[3]).toHaveTextContent('↑');
  });

  it('counts in, then times the taps on the pad and answers with them', async () => {
    const { p, metronome, sources, onAnswer } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    const pad = screen.getByRole('button', { name: 'Tap the rhythm' });
    expect(pad).toHaveFocus();
    expect(screen.getByTestId('d20-status')).toHaveTextContent('Count-in');
    // The pad counts the count-in beats.
    act(() => void metronome.tickUntil(-1));
    expect(pad).toHaveTextContent('3');
    playTo(metronome, sources.tap, p, 0, 12);
    expect(screen.getByTestId('d20-status')).toHaveTextContent('Go!');
    expect(pad).toHaveTextContent('Tap');
    playTo(metronome, sources.tap, p, 8, 12);
    await flush();
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const answer = onAnswer.mock.calls[0]![0];
    expect(answer.input).toBe('tap');
    expect(answer.targetsMs).toHaveLength(8);
    expect(answer.onsetsMs).toEqual(answer.targetsMs.map((t) => t + 12));
    expect(d20Check(p, answer)).toEqual({ correct: true, expected: '8 of 8 on time' });
    expect(screen.queryByRole('button', { name: 'Tap the rhythm' })).not.toBeInTheDocument();
    // Until the feedback comes, a stray tap can't start another rep.
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('lights the step the click is on from guide level 2, and on the worked example', async () => {
    const { p, metronome, sources } = setup({ guided: true });
    expect(screen.getByTestId('d20-explain')).toHaveTextContent(/Listen to the count-in/);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    playTo(metronome, sources.tap, p, 1.5);
    const cells = within(screen.getByTestId('d20-grid')).getAllByRole('listitem');
    expect(cells[3]).toHaveAttribute('aria-current', 'step');
    expect(cells.filter((c) => c.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('doesn’t light the steps below guide level 2', async () => {
    const { p, metronome, sources } = setup({ guideLevel: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    playTo(metronome, sources.tap, p, 1.5);
    const cells = within(screen.getByTestId('d20-grid')).getAllByRole('listitem');
    expect(cells.some((c) => c.hasAttribute('aria-current'))).toBe(false);
  });

  it('sounds the "&" for a rhythm off the beat from guide level 2 only', async () => {
    const audible = async (guideLevel: GuideLevel) => {
      const { metronome, view } = setup({ id: 'tap-rhythm:offbeats', guideLevel });
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await flush();
      let subs: boolean[] = [];
      act(() => {
        subs = metronome
          .tickUntil(1)
          .filter((c) => c.accent === 'sub')
          .map((c) => c.audible);
      });
      view.unmount();
      return subs;
    };
    expect((await audible(2)).every(Boolean)).toBe(true);
    expect((await audible(1)).some(Boolean)).toBe(false);
  });

  it('stops on Stop, back to the start, with no answer', async () => {
    const { metronome, onAnswer } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    act(() => void metronome.tickUntil(0));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush();
    expect(metronome.running).toBe(false);
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('stops the click when the view goes', async () => {
    const { metronome, view } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    view.unmount();
    expect(metronome.running).toBe(false);
  });

  it('starts over on a new prompt', async () => {
    const { metronome, view, onAnswer } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    const next = prompt('tap-rhythm:half-notes');
    view.rerender(
      <RhythmDrill
        prompt={next}
        guideLevel={1}
        guided={false}
        handedness="right"
        sizeClass="regular-wide"
        tuning={getTuning('standard')}
        feedback={null}
        onAnswer={onAnswer}
        metronome={metronome}
      />,
    );
    await flush();
    expect(metronome.running).toBe(false);
    expect(screen.getByTestId('d20-prompt')).toHaveTextContent('Beats 1 and 3');
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('says why the mic didn’t start, and offers to try again', async () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, micEnabled: true } });
    const { sources } = setup({ id: 'strum-rhythm:down-quarters' });
    // A strum card defaults to the guitar in mic mode.
    expect(screen.getByRole('radio', { name: 'Strumming a guitar' })).toBeChecked();
    expect(screen.getByTestId('d20-prompt')).toHaveTextContent('Strum Down strums on every beat');
    expect(screen.getByText(/Use headphones/)).toBeInTheDocument();
    sources.mic.failNextStart('denied');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(/isn’t allowed to use the microphone/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(screen.getByRole('img', { name: 'Listening for your guitar' })).toBeInTheDocument();
  });

  it('says so when the mic is lost mid-rep', async () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, micEnabled: true } });
    const { metronome, sources, onAnswer } = setup({ id: 'strum-rhythm:down-quarters' });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    act(() => void metronome.tickUntil(1));
    act(() => sources.mic.loseInput());
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(/stopped during the run/);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('can switch a tap card to the guitar, and a strum card to taps', async () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, micEnabled: true } });
    const { p, metronome, sources, onAnswer } = setup();
    expect(screen.getByRole('radio', { name: 'Tapping' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Strumming a guitar' }));
    expect(screen.getByTestId('d20-prompt')).toHaveTextContent(/^Strum/);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(screen.queryByRole('group', { name: 'Play by' })).not.toBeInTheDocument();
    playTo(metronome, sources.mic, p, 8, -20);
    await flush();
    expect(onAnswer.mock.calls[0]![0].input).toBe('mic');
  });

  it('offers the timing check while this input is unchecked', () => {
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, timingOffsets: { tap: null, mic: 0 } },
    });
    setup();
    const note = screen.getByTestId('d20-calibrate');
    expect(note).toHaveTextContent(/hasn’t been checked on this device/);
    fireEvent.click(within(note).getByRole('button', { name: 'Check it (10 seconds)' }));
    // The calibration opens in place, and the rep waits for it: its Start is the only one.
    expect(within(note).getByText(/A bar of four counts you in/)).toBeInTheDocument();
    const starts = screen.getAllByRole('button', { name: 'Start' });
    expect(starts).toHaveLength(1);
    expect(note).toContainElement(starts[0]!);
    // Saving the offset keeps the calibration open, to show its result.
    act(() =>
      useAppStore.setState({
        settings: { ...useAppStore.getState().settings, timingOffsets: { tap: 20, mic: 0 } },
      }),
    );
    expect(screen.getByTestId('d20-calibrate')).toBeInTheDocument();
  });

  it('shows how each hit landed, by shape and label, after the answer', () => {
    const p = prompt('tap-rhythm:half-notes');
    const targetsMs = p.pulses.map((pulse) => 10_000 + pulse * 1000);
    const answer: D20Answer = {
      input: 'tap',
      targetsMs,
      onsetsMs: [targetsMs[0]! + 6, targetsMs[1]! - 80, targetsMs[2]! + 70],
    };
    setup({ id: 'tap-rhythm:half-notes', feedback: { answer } });
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    const results = screen.getByTestId('d20-results');
    const bar1 = within(results).getByRole('list', { name: 'Bar 1' });
    const bar2 = within(results).getByRole('list', { name: 'Bar 2' });
    const labels = (bar: HTMLElement) =>
      within(bar)
        .getAllByRole('listitem')
        .filter((c) => c.dataset.hit === 'true')
        .map((c) => [c.getAttribute('aria-label'), c.textContent]);
    expect(labels(bar1)).toEqual([
      ['1: on time, 6 ms late', '●1'],
      ['3: too early, 80 ms early', '◀3'],
    ]);
    expect(labels(bar2)).toEqual([
      ['1: too late, 70 ms late', '▶1'],
      ['3: missed', '✕3'],
    ]);
    expect(screen.getByTestId('d20-explain')).toHaveTextContent(
      'Typically 6 ms off (aim for 30). 1 missed.',
    );
  });

  it('degrades to compact with the panel below', () => {
    const { view } = setup({ sizeClass: 'compact' });
    const drill = view.container.firstElementChild as HTMLElement;
    expect(drill).toHaveAttribute('data-size-class', 'compact');
    expect(drill.lastElementChild).toHaveAttribute('data-testid', 'aside');
  });
});

describe('<RhythmPanel>', () => {
  const panel = (id: string, guideLevel: GuideLevel, guided = false) =>
    render(
      <RhythmPanel
        prompt={prompt(id)}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={getTuning('standard')}
        feedback={null}
      />,
    );

  it('explains the count, fading it at guide level 0', () => {
    panel('tap-rhythm:quarters', 1);
    expect(screen.getByTestId('d20-counting')).toHaveTextContent(/Count “1 & 2 & 3 & 4 &”/);
    expect(screen.getByText(/2 times through, at 60 beats a minute/)).toBeInTheDocument();
    expect(screen.queryByText(/Strum down on the numbers/)).toBeNull();
  });

  it('keeps the count on the worked example, and explains the strokes of a strum', () => {
    panel('strum-rhythm:d-du-udu', 0, true);
    expect(screen.getByTestId('d20-counting')).toBeInTheDocument();
    expect(screen.getByText(/Strum down on the numbers/)).toBeInTheDocument();
  });

  it('hides the count at guide level 0', () => {
    panel('tap-rhythm:quarters', 0);
    expect(screen.queryByTestId('d20-counting')).toBeNull();
  });
});
