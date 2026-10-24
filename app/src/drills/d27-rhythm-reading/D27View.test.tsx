import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS, type GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { getTuning } from '../../theory';
import { createFakeMetronome, type FakeMetronome } from '../../timing/fake-metronome';
import type { OnsetKind } from '../../timing/latency';
import { createFakeOnsetSource, type FakeOnsetSource } from '../../timing/onsets';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import { ReadingPanel } from './ContextPanel';
import { ReadingDrill } from './D27View';
import { d27Check, d27MakePrompt, type D27Answer, type D27Prompt } from './logic';

// The staff's engraving is <Staff>'s own concern (M8-02); here it is a stub
// that shows what it was given.
vi.mock('../../components/staff', () => ({
  Staff: ({
    notes,
    label,
    cursor,
    tuplets,
    timeSignature,
  }: {
    notes: { value: string; dots: number; style: string; pitches: string[] }[];
    label: string;
    cursor?: number;
    tuplets: { from: number; count: number }[];
    timeSignature: string;
  }) => (
    <div
      data-testid="staff"
      aria-label={label}
      data-time={timeSignature}
      data-cursor={cursor ?? ''}
      data-tuplets={tuplets.map((t) => `${t.from}+${t.count}`).join(' ')}
      data-notes={notes
        .map((n) => `${n.pitches.length ? '' : 'r'}${n.value}${'.'.repeat(n.dots)}:${n.style}`)
        .join(' ')}
    />
  ),
}));

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

const prompt = (slug: string, scopeLevel = 0): D27Prompt =>
  d27MakePrompt(
    { id: `rhythm:${slug}`, skillId: 'R4.test' },
    { tuning: getTuning('standard'), accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
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
  p?: D27Prompt;
  guideLevel?: GuideLevel;
  guided?: boolean;
  sizeClass?: SizeClass;
  answer?: D27Answer;
}

function setup({
  p = prompt('dotted-8th-16th'),
  guideLevel = 1,
  guided = false,
  sizeClass = 'regular-wide',
  answer,
}: Setup = {}) {
  const metronome: FakeMetronome = createFakeMetronome();
  const sources: Record<OnsetKind, FakeOnsetSource> = {
    tap: createFakeOnsetSource('tap'),
    mic: createFakeOnsetSource('mic'),
  };
  const onAnswer = vi.fn<(a: D27Answer) => void>();
  const view = render(
    <ReadingDrill
      prompt={p}
      guideLevel={guideLevel}
      guided={guided}
      handedness="right"
      sizeClass={sizeClass}
      tuning={getTuning('standard')}
      feedback={answer ? { answer, result: d27Check(p, answer) } : null}
      onAnswer={onAnswer}
      aside={<aside data-testid="aside" />}
      metronome={metronome}
      createSource={(kind) => sources[kind]}
    />,
  );
  return { p, metronome, sources, onAnswer, view };
}

/** The prompt's notes from 10 s at its tempo, each `offset` ms off, at `at`'s pulses. */
function answerFor(p: D27Prompt, offset: number, at: readonly number[] = p.pulses): D27Answer {
  const ms = 60_000 / p.bpm;
  const time = (pulse: number) => 10_000 + pulse * ms;
  return {
    input: 'tap',
    targetsMs: p.pulses.map(time),
    partnerTargetsMs: (p.partnerPulses ?? []).map(time),
    onsetsMs: at.map((pulse) => time(pulse) + offset),
    window: 'strict',
  };
}

/** Ticks the run's clicks until it stops, playing each note `offset` ms off on the way. */
function playThrough(metronome: FakeMetronome, source: FakeOnsetSource, p: D27Prompt, offset = 0) {
  act(() => {
    while (metronome.running) {
      const click = metronome.tick()!;
      if (p.pulses.some((x) => Math.abs(x - click.pulse) < 1e-6)) source.emit(click.at + offset);
    }
  });
}

const staff = () => screen.getByTestId('staff');

describe('<ReadingDrill>', () => {
  it('opens a first exposure with the bar to hear, and no notation until it has been heard', async () => {
    const { metronome } = setup({ guided: true });
    expect(screen.getByTestId('d27-prompt')).toHaveTextContent(
      'Tap dotted eighth and sixteenth in 4/4 at 60 BPM',
    );
    expect(screen.getByTestId('d27-explain')).toHaveTextContent('Listen first');
    expect(screen.queryByTestId('staff')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hear the rhythm' }));
    await flush();
    expect(metronome.layout).toMatchObject({ subdivide: 4, countInBars: 1 });
    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true');
    // The count-in on the beats, then a click on each note and nothing between.
    let clicks: ReturnType<FakeMetronome['tickUntil']> = [];
    act(() => {
      clicks = metronome.tickUntil(4);
    });
    const heard = clicks.filter((c) => c.audible).map((c) => c.pulse);
    expect(heard).toEqual([-4, -3, -2, -1, 0, 0.75, 1, 1.75, 2, 2.75, 3, 3.75]);
    // Still hidden until the bar ends.
    expect(screen.queryByTestId('staff')).not.toBeInTheDocument();
    act(() => void metronome.tick());
    expect(metronome.running).toBe(false);

    // Heard: the notation shows, with every guide (the worked example).
    expect(staff()).toHaveAttribute(
      'data-notes',
      '8.:target 16:target 8.:target 16:target 8.:target 16:target 8.:target 16:target',
    );
    expect(staff()).toHaveAttribute('aria-label', 'The bar to read, in 4 4 time');
    expect(screen.getAllByTestId('d27-count').map((c) => c.textContent)).toEqual([
      '1',
      'a',
      '2',
      'a',
      '3',
      'a',
      '4',
      'a',
    ]);
    expect(screen.getByTestId('d27-explain')).toHaveTextContent('Now read it');
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('keeps the notation hidden when the hearing is stopped part-way', async () => {
    const { metronome } = setup({ guided: true });
    fireEvent.click(screen.getByRole('button', { name: 'Hear the rhythm' }));
    await flush();
    act(() => void metronome.tickUntil(1));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(metronome.running).toBe(false);
    expect(screen.queryByTestId('staff')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hear the rhythm' })).toBeInTheDocument();
  });

  it('stays on the hearing when audio won’t start', async () => {
    const { metronome } = setup({ guided: true });
    metronome.refuseNextStart();
    fireEvent.click(screen.getByRole('button', { name: 'Hear the rhythm' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Hear the rhythm' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows a review’s bar at once, to read, with the guides of its level', () => {
    setup({ guideLevel: 1 });
    expect(staff()).toHaveAttribute(
      'data-notes',
      '8.:plain 16:plain 8.:plain 16:plain 8.:plain 16:plain 8.:plain 16:plain',
    );
    expect(screen.getAllByTestId('d27-count')).toHaveLength(8);
    expect(screen.getByTestId('d27-explain')).toHaveTextContent('Read the bar');
    expect(screen.queryByRole('button', { name: 'Hear the rhythm' })).not.toBeInTheDocument();
    expect(screen.getByTestId('aside')).toBeInTheDocument();
    // Taps only: mic mode is off.
    expect(screen.queryByRole('group', { name: 'Play by' })).not.toBeInTheDocument();
  });

  it('fades the count at guide level 0, and draws triplets and rests', () => {
    setup({ guideLevel: 0, p: prompt('8th-triplet') });
    expect(screen.queryByTestId('d27-count')).not.toBeInTheDocument();
    expect(staff()).toHaveAttribute('data-tuplets', '0+3 3+3 6+3 9+3');
    const rests = prompt('quarter-rest');
    setup({ guideLevel: 2, p: rests });
    const staves = screen.getAllByTestId('staff');
    expect(staves[1]).toHaveAttribute('data-notes', 'q:plain rq:plain q:plain rq:plain');
    const counts = screen.getAllByTestId('d27-count');
    expect(counts.map((c) => c.textContent)).toEqual(['1', '(2)', '3', '(4)']);
    expect(counts[1]).toHaveAttribute('data-cell', 'true');
  });

  it('runs a rep: counts in, a caret follows the click, and the take is the answer', async () => {
    const { p, metronome, sources, onAnswer } = setup({
      guideLevel: 2,
      p: prompt('dotted-8th-16th', 1),
    });
    expect(p.partnerPulses).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    const pad = screen.getByRole('button', { name: 'Tap the rhythm' });
    expect(pad).toHaveFocus();
    expect(screen.getByTestId('d27-status')).toHaveTextContent('Count-in');
    // Subdivided at guide level 2: every step sounds.
    let countIn: ReturnType<FakeMetronome['tickUntil']> = [];
    act(() => {
      countIn = metronome.tickUntil(0);
    });
    expect(countIn.every((c) => c.audible)).toBe(true);
    expect(pad).toHaveTextContent('4');
    act(() => void metronome.tickUntil(0.8));
    expect(screen.getByTestId('d27-status')).toHaveTextContent('Go!');
    expect(staff()).toHaveAttribute('data-cursor', '1');
    playThrough(metronome, sources.tap, p, 6);
    await flush();
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const answer = onAnswer.mock.calls[0]![0];
    expect(answer.targetsMs).toHaveLength(p.pulses.length);
    expect(answer.partnerTargetsMs).toHaveLength(p.partnerPulses!.length);
    expect(answer).toMatchObject({ input: 'tap', window: 'standard' });
    expect(answer.onsetsMs.length).toBeGreaterThan(0);
    expect(d27Check(p, answer).correct).toBe(true);
  });

  it('goes back to Start when a rep is stopped, and says so when the input fails', async () => {
    const { metronome, sources } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush();
    expect(metronome.running).toBe(false);
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();

    sources.tap.failNextStart('failed');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    act(() => sources.tap.loseInput());
    await flush();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('offers the guitar in mic mode', async () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, micEnabled: true } });
    const { sources } = setup();
    const group = screen.getByRole('group', { name: 'Play by' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Playing a guitar' }));
    expect(screen.getByTestId('d27-prompt')).toHaveTextContent(/^Play /);
    expect(screen.getByText(/Use headphones/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(sources.mic.startCalls).toBe(1);
    expect(screen.getByRole('img', { name: 'Listening for your guitar' })).toBeInTheDocument();
  });

  it('offers the timing check on a device that hasn’t had one', () => {
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, timingOffsets: { tap: null, mic: null } },
    });
    setup();
    const note = screen.getByTestId('d27-calibrate');
    expect(note).toHaveTextContent('hasn’t been checked');
    fireEvent.click(within(note).getByRole('button', { name: 'Check it (10 seconds)' }));
    // The check takes the rep's place until it is done.
    expect(screen.queryByTestId('d27-status')).not.toBeInTheDocument();
    expect(within(note).queryByText(/hasn’t been checked/)).not.toBeInTheDocument();
  });

  it('marks every note of a right rep, and can play the bar again', async () => {
    const p = prompt('dotted-8th-16th');
    const { metronome } = setup({ p, answer: answerFor(p, 10) });
    expect(staff()).toHaveAttribute('data-notes', expect.stringMatching(/^8\.:correct 16:correct/));
    const rows = screen.getByTestId('d27-results');
    const first = within(rows).getByRole('list', { name: 'Time 1' });
    expect(within(first).getAllByRole('listitem')[0]).toHaveAccessibleName(
      '1: on time, 10 ms late',
    );
    expect(within(rows).getByRole('list', { name: 'Time 2' })).toBeInTheDocument();
    expect(screen.queryByTestId('d27-window')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hear the bar' }));
    await flush();
    expect(metronome.running).toBe(true);
  });

  it('explains a dotted bar tapped straight, and offers a wider timing window', () => {
    const p = prompt('dotted-8th-16th', 1);
    const answer = answerFor(p, 5, p.partnerPulses!);
    answer.onsetsMs.push(answer.targetsMs[1]! + 120);
    setup({ p, answer });
    expect(screen.getByTestId('d27-explain')).toHaveTextContent(
      'That was played as two eighths, not dotted eighth and sixteenth. Read the dot',
    );
    expect(staff()).toHaveAttribute('data-notes', expect.stringContaining('16:wrong'));
    const row = within(screen.getByTestId('d27-results')).getByRole('list', { name: 'Time 1' });
    expect(within(row).getAllByRole('listitem')[1]).toHaveAccessibleName(
      expect.stringMatching(/^a: (missed|too late)/),
    );
    expect(screen.getByTestId('d27-window')).toHaveTextContent('Taps count within 80 ms');
  });

  it('lays out for a phone, the panel below', () => {
    const { view } = setup({ sizeClass: 'compact' });
    const drill = view.container.firstElementChild as HTMLElement;
    expect(drill).toHaveAttribute('data-size-class', 'compact');
    expect(drill.lastElementChild).toBe(screen.getByTestId('aside'));
  });

  it('is the registered drill’s view', async () => {
    const drill = getDrill('rhythm-reading')!;
    await expect(resolveView(drill.render)).resolves.toBeDefined();
  });
});

describe('<ReadingPanel>', () => {
  const show = (p: D27Prompt, guideLevel: GuideLevel, guided = false) =>
    render(
      <ReadingPanel
        prompt={p}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={getTuning('standard')}
        feedback={null}
      />,
    );

  it('names the cell, its count, and the look-alike it isn’t', () => {
    show(prompt('dotted-8th-16th'), 1);
    expect(
      screen.getByRole('heading', { name: 'Dotted eighth and sixteenth' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('d27-cell-count')).toHaveTextContent('Count it “1 a”');
    expect(screen.getByTestId('d27-partner')).toHaveTextContent(
      'Don’t mistake it for two eighths. Read the dot',
    );
  });

  it('fades the count, and has no look-alike for a cell without one', () => {
    show(prompt('quarter-rest'), 0);
    expect(screen.queryByTestId('d27-cell-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('d27-partner')).not.toBeInTheDocument();
    show(prompt('quarter-rest'), 0, true);
    expect(screen.getByTestId('d27-cell-count')).toHaveTextContent('Count it “(1)”');
  });
});
