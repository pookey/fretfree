import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-store';
import { ENGINE_CONFIG } from '../../engine/config';
import { DEFAULT_SETTINGS, type GuideLevel, type Settings } from '../../engine/model';
import { getTuning } from '../../theory';
import { createFakeMetronome, type FakeMetronome } from '../../timing/fake-metronome';
import type { OnsetKind } from '../../timing/latency';
import { createFakeOnsetSource, type FakeOnsetSource } from '../../timing/onsets';
import type { SizeClass } from '../../shell/size-class';
import { AccentPanel } from './ContextPanel';
import { AccentDrill } from './D31View';
import { d31Check, d31MakePrompt, type D31Answer, type D31Prompt } from './logic';

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const SOFT = ENGINE_CONFIG.accentStrum.accents.softTapStrength;

const prompt = (id: string): D31Prompt =>
  d31MakePrompt(
    { id, skillId: 'T5.downbeat' },
    { tuning: getTuning('standard'), accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

const { update: saveToDb } = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({
    settings: { ...DEFAULT_SETTINGS, timingOffsets: { tap: 0, mic: 0 } },
    loaded: true,
    update: saveToDb,
  });
});

interface Setup {
  id?: string;
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: { answer: D31Answer };
}

function setup({
  id = 'accent:4/4:backbeat',
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
  const onAnswer = vi.fn<(a: D31Answer) => void>();
  const view = render(
    <AccentDrill
      prompt={p}
      guideLevel={guideLevel}
      guided={guided}
      handedness="right"
      sizeClass={sizeClass}
      tuning={getTuning('standard')}
      feedback={feedback ? { answer: feedback.answer, result: d31Check(p, feedback.answer) } : null}
      onAnswer={onAnswer}
      aside={<aside data-testid="aside" />}
      metronome={metronome}
      createSource={(kind) => sources[kind]}
    />,
  );
  return { p, metronome, sources, onAnswer, view };
}

/** Ticks the run's clicks to `pulse`, playing each stroke `offset` ms off, strong where asked. */
function playTo(
  metronome: FakeMetronome,
  source: FakeOnsetSource,
  p: D31Prompt,
  pulse: number,
  offset = 0,
  strength: (accented: boolean) => number = (a) => (a ? 1 : SOFT),
) {
  act(() => {
    while (metronome.running) {
      const click = metronome.tick()!;
      const i = p.pulses.indexOf(click.pulse);
      if (i >= 0) source.emit(click.at + offset, strength(p.accented[i]!));
      if (click.pulse >= pulse) break;
    }
  });
}

/** A take of the whole run at 1 s a pulse, `offset` ms off. */
function take(p: D31Prompt, offset: number, strength = (a: boolean) => (a ? 1 : SOFT)): D31Answer {
  const targetsMs = p.pulses.map((pulse) => 10_000 + pulse * 1000);
  return {
    input: 'tap',
    targetsMs,
    onsets: targetsMs.map((t, i) => ({ at: t + offset, strength: strength(p.accented[i]!) })),
    window: 'standard',
    rungs: [0, 0, 1, 2],
  };
}

describe('<AccentDrill>', () => {
  it('shows the bar with its accents marked, beside the context panel', () => {
    setup();
    expect(screen.getByTestId('d31-prompt')).toHaveTextContent('Tap the backbeat in 4/4 at ♩ = 60');
    expect(screen.getByText('at 60 quarter notes a minute')).toBeInTheDocument();
    expect(screen.getByTestId('d31-explain')).toHaveTextContent(/strong on 2 and 4/);
    const cells = within(
      screen.getByRole('list', { name: 'The bar, with its accents' }),
    ).getAllByRole('listitem');
    expect(cells.map((c) => c.getAttribute('aria-label'))).toEqual([
      '1: soft tap',
      '2: strong tap',
      '3: soft tap',
      '4: strong tap',
    ]);
    expect(cells.map((c) => c.dataset.strong)).toEqual(['false', 'true', 'false', 'true']);
    expect(cells[1]).toHaveTextContent('>');
    // Guide level 1: no count under the bar.
    expect(screen.queryAllByTestId('d31-syllable')).toHaveLength(0);
    expect(screen.getByTestId('aside')).toBeInTheDocument();
    // The rep starts with the click part-faded at level 1.
    expect(screen.getByTestId('d31-click')).toHaveTextContent('Click: beat 1 of every 2nd bar');
    expect(screen.getByText(/F or Space is strong/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Play by' })).not.toBeInTheDocument();
  });

  it('shows the count and the whole click on the worked example', () => {
    setup({ id: 'count:6/8:3', guided: true });
    expect(screen.getByTestId('d31-prompt')).toHaveTextContent('Count 6/8 in eighths at ♪ = 120');
    expect(screen.getByTestId('d31-explain')).toHaveTextContent(/Listen to the count-in/);
    expect(screen.getAllByTestId('d31-syllable').map((s) => s.textContent)).toEqual([
      '1',
      'la',
      'li',
      '2',
      'la',
      'li',
    ]);
    const cells = within(screen.getByTestId('d31-grid')).getAllByRole('listitem');
    expect(cells.map((c) => c.getAttribute('aria-label'))).toEqual([
      '1: strong tap',
      'la of 1: soft tap',
      'li of 1: soft tap',
      '2: strong tap',
      'la of 2: soft tap',
      'li of 2: soft tap',
    ]);
    expect(screen.getByTestId('d31-click')).toHaveTextContent('Click: every beat');
  });

  it('marks a strum’s strokes and its rests', () => {
    setup({ id: 'accent:3/4:waltz-strum', guideLevel: 2 });
    expect(screen.getByTestId('d31-prompt')).toHaveTextContent(/^Play a waltz strum/);
    const cells = within(screen.getByTestId('d31-grid')).getAllByRole('listitem');
    expect(cells.map((c) => c.getAttribute('aria-label'))).toEqual([
      '1: strong down strum',
      '& of 1: rest',
      '2: soft down strum',
      '& of 2: soft up strum',
      '3: soft down strum',
      '& of 3: soft up strum',
    ]);
    expect(cells[0]).toHaveTextContent('↓');
    expect(cells[3]).toHaveTextContent('↑');
  });

  it('counts in, takes the taps from two pads, fades the click and answers', async () => {
    const { p, metronome, sources, onAnswer } = setup({ guided: true });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    const pads = screen.getByRole('group', { name: 'Tap pads' });
    const strong = within(pads).getByRole('button', { name: 'Strong' });
    expect(within(pads).getByRole('button', { name: 'Soft' })).toBeInTheDocument();
    expect(strong).toHaveFocus();
    expect(screen.getByTestId('d31-status')).toHaveTextContent('Count-in');
    act(() => void metronome.tickUntil(-1));
    expect(strong).toHaveTextContent('3');
    playTo(metronome, sources.tap, p, 0, 12);
    expect(screen.getByTestId('d31-status')).toHaveTextContent('Go!');
    expect(screen.getByTestId('d31-click')).toHaveTextContent('Click: every beat');
    // Bar 0 right: the click drops for the bar after next.
    playTo(metronome, sources.tap, p, 8, 12);
    expect(screen.getByTestId('d31-click')).toHaveTextContent('Click: beat 1');
    playTo(metronome, sources.tap, p, 99, 12);
    await flush();
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const answer = onAnswer.mock.calls[0]![0];
    expect(answer).toMatchObject({ input: 'tap', window: DEFAULT_SETTINGS.timingWindow });
    expect(answer.targetsMs).toHaveLength(16);
    expect(answer.onsets.map((o) => o.strength).slice(0, 4)).toEqual([SOFT, 1, SOFT, 1]);
    expect(answer.rungs).toEqual([0, 0, 1, 2]);
    expect(d31Check(p, answer)).toEqual({ correct: true, expected: '16 of 16 right' });
    expect(screen.queryByRole('group', { name: 'Tap pads' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('brings the click back when the accents are wrong', async () => {
    const { p, metronome, sources, onAnswer } = setup({ guideLevel: 0 });
    expect(screen.getByTestId('d31-click')).toHaveTextContent('beat 1 of every 4th bar');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    playTo(metronome, sources.tap, p, 99, 0, () => 1);
    await flush();
    expect(onAnswer.mock.calls[0]![0].rungs).toEqual([3, 3, 2, 1]);
  });

  it('lights the step the click is on from guide level 2 only', async () => {
    const lit = async (guideLevel: GuideLevel) => {
      const { p, metronome, sources, view } = setup({ guideLevel });
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await flush();
      playTo(metronome, sources.tap, p, 2);
      const cells = within(screen.getByTestId('d31-grid')).getAllByRole('listitem');
      const current = cells.findIndex((c) => c.hasAttribute('aria-current'));
      view.unmount();
      return current;
    };
    expect(await lit(2)).toBe(2);
    expect(await lit(1)).toBe(-1);
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

  it('stops the click when the view goes, and starts over on a new prompt', async () => {
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    first.view.unmount();
    expect(first.metronome.running).toBe(false);

    const { metronome, view, onAnswer } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    view.rerender(
      <AccentDrill
        prompt={prompt('accent:3/4:downbeat')}
        guideLevel={3}
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
    expect(screen.getByTestId('d31-prompt')).toHaveTextContent('beat 1 of 3/4');
    expect(screen.getByTestId('d31-click')).toHaveTextContent('Click: every beat');
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('strums a strum pattern into the mic, and says why the mic didn’t start', async () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, micEnabled: true } });
    const { p, metronome, sources, onAnswer } = setup({ id: 'accent:4/4:rock-strum' });
    expect(screen.getByRole('radio', { name: 'Strumming a guitar' })).toBeChecked();
    expect(screen.getByText(/Use headphones/)).toBeInTheDocument();
    sources.mic.failNextStart('denied');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(/isn’t allowed to use the microphone/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(screen.getByRole('img', { name: 'Listening for your guitar' })).toBeInTheDocument();
    playTo(metronome, sources.mic, p, 99, 5, (a) => (a ? 0.9 : 0.3));
    await flush();
    const answer = onAnswer.mock.calls[0]![0];
    expect(answer.input).toBe('mic');
    expect(d31Check(p, answer).correct).toBe(true);
  });

  it('says so when the mic is lost mid-rep, and can switch to taps', async () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, micEnabled: true } });
    const { metronome, sources, onAnswer } = setup({ id: 'accent:6/8:strum' });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    act(() => void metronome.tickUntil(1));
    act(() => sources.mic.loseInput());
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(/stopped during the run/);
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Tapping' }));
    expect(screen.getByText(/F or Space is strong/)).toBeInTheDocument();
  });

  it('offers the timing check while this input is unchecked', () => {
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, timingOffsets: { tap: null, mic: 0 } },
    });
    setup();
    const note = screen.getByTestId('d31-calibrate');
    expect(note).toHaveTextContent(/hasn’t been checked on this device/);
    fireEvent.click(within(note).getByRole('button', { name: 'Check it (10 seconds)' }));
    const starts = screen.getAllByRole('button', { name: 'Start' });
    expect(starts).toHaveLength(1);
    expect(note).toContainElement(starts[0]!);
  });

  it('marks each stroke after the answer, with the click each bar had', () => {
    const p = prompt('accent:4/4:backbeat');
    const answer = take(p, 6);
    answer.onsets[0] = { at: answer.targetsMs[0]! - 90, strength: SOFT };
    answer.onsets[1] = { ...answer.onsets[1]!, strength: SOFT };
    answer.onsets[2] = { ...answer.onsets[2]!, strength: 1 };
    answer.onsets[3] = { at: answer.targetsMs[3]! + 100, strength: 1 };
    answer.onsets.splice(4, 1);
    setup({ feedback: { answer } });
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    const results = screen.getByTestId('d31-results');
    const labels = (bar: string) =>
      within(within(results).getByRole('list', { name: bar }))
        .getAllByRole('listitem')
        .map((c) => [c.getAttribute('aria-label'), c.textContent]);
    expect(labels('Bar 1')).toEqual([
      ['1: too early, 90 ms early', '◀'],
      ['2: on time, but soft: it should be strong', '>!'],
      ['3: on time, but strong: it should be soft', '!'],
      ['4: too late, 100 ms late', '>▶'],
    ]);
    expect(labels('Bar 2')[0]).toEqual(['1: missed', '✕']);
    expect(labels('Bar 2')[1]).toEqual(['2: strong, on time, 6 ms late', '>✓']);
    expect(results).toHaveTextContent('Bar 1 · Click: every beat');
    // Bar 4 (index 3) on "every 2nd bar" had no click at all, and says so.
    expect(results).toHaveTextContent('Bar 3 · Click: beat 1');
    expect(results).toHaveTextContent('Bar 4 · No click this bar');
    expect(screen.getByTestId('d31-explain')).toHaveTextContent(
      '1 accent played soft. 1 soft stroke played strong.',
    );
  });

  it('offers a wider timing window after a failed rep, and not after a passed one', async () => {
    const p = prompt('accent:4/4:backbeat');
    const update = vi.fn((patch: Partial<Settings>) => {
      useAppStore.setState((s) => ({ settings: { ...s.settings, ...patch } }));
      return Promise.resolve();
    });
    useAppStore.setState({ update });

    const { view } = setup({ feedback: { answer: take(p, 10) } });
    expect(screen.queryByTestId('d31-window')).toBeNull();
    view.unmount();

    setup({ feedback: { answer: take(p, 100) } });
    const timing = within(screen.getByTestId('d31-window')).getByRole('combobox', {
      name: 'Rhythm timing',
    });
    expect(timing).toHaveAccessibleDescription(/within 80 ms of the click.*widen it/);
    fireEvent.change(timing, { target: { value: 'relaxed' } });
    expect(update).toHaveBeenCalledWith({ timingWindow: 'relaxed' });
    await flush();
    expect(timing).toHaveAccessibleDescription(/within 120 ms .* the widest window/);
  });

  it('degrades to compact with the panel below', () => {
    const { view } = setup({ sizeClass: 'compact' });
    const drill = view.container.firstElementChild as HTMLElement;
    expect(drill).toHaveAttribute('data-size-class', 'compact');
    expect(drill.lastElementChild).toHaveAttribute('data-testid', 'aside');
  });
});

describe('<AccentPanel>', () => {
  const panel = (id: string, guideLevel: GuideLevel, guided = false) =>
    render(
      <AccentPanel
        prompt={prompt(id)}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={getTuning('standard')}
        feedback={null}
      />,
    );

  it('gives the count at high guide levels and on the worked example', () => {
    panel('count:2/4:4', 2);
    expect(screen.getByTestId('d31-counting')).toHaveTextContent(
      'Count “1 e & a 2 e & a” under your breath. The numbers are the 2 beats of the bar.',
    );
    expect(screen.getByText(/play the bar 4 times/)).toBeInTheDocument();
  });

  it('hides the count below them', () => {
    panel('count:2/4:4', 1);
    expect(screen.queryByTestId('d31-counting')).toBeNull();
    panel('count:2/4:4', 0, true);
    expect(screen.getByTestId('d31-counting')).toBeInTheDocument();
  });
});
