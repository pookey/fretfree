import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../app-store';
import { ENGINE_CONFIG } from '../engine/config';
import { DEFAULT_SETTINGS } from '../engine/model';
import { getDb, getSettings } from '../storage';
import type { AudioClock } from './clock';
import { createFakeMetronome, type FakeMetronome } from './fake-metronome';
import { createFakeOnsetSource, createTapOnsetSource, type FakeOnsetSource } from './onsets';
import { TimingCalibration, TimingCalibrationSetting, describeOffset } from './TimingCalibration';

const CFG = ENGINE_CONFIG.timing.calibration;

beforeEach(async () => {
  await getDb().settings.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
});

/** Lets the run's start (the source, then the metronome) settle. */
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

/** Plays the whole run: every click gets an onset `offset` ms after it. */
function playAlong(
  metronome: FakeMetronome,
  source: FakeOnsetSource,
  offset: (i: number) => number,
) {
  act(() => {
    let i = 0;
    while (metronome.running) {
      const click = metronome.tick()!;
      source.emit(click.at + offset(i++));
    }
  });
}

describe('describeOffset', () => {
  it('says late, early, or on the click', () => {
    expect(describeOffset(25)).toBe('25 ms late');
    expect(describeOffset(-12)).toBe('12 ms early');
    expect(describeOffset(4)).toBe('right on the click');
  });
});

describe('<TimingCalibration>', () => {
  it('counts in, runs the clicks, then saves and shows the offset', async () => {
    const metronome = createFakeMetronome();
    const source = createFakeOnsetSource('tap');
    render(<TimingCalibration kind="tap" metronome={metronome} createSource={() => source} />);
    expect(screen.getByText(/Tap the pad \(or press Space\) on each click/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`then ${CFG.clicks} clicks`))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(screen.getByText(/Get ready/)).toBeInTheDocument();
    // The pad takes focus whatever the source, so Space works at once.
    expect(screen.getByRole('button', { name: 'Tap on each click' })).toHaveFocus();
    act(() => {
      metronome.tickUntil(1);
    });
    expect(screen.getByRole('progressbar', { name: 'Clicks so far' })).toHaveAttribute(
      'value',
      '1',
    );
    playAlong(metronome, source, (i) => 25 + (i % 3) - 1);
    expect(await screen.findByTestId('timing-calibration-result')).toHaveTextContent(
      'Your taps land 25 ms late on this device.',
    );
    await waitFor(async () =>
      expect((await getSettings(getDb())).timingOffsets).toEqual({ tap: 25, mic: null }),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('lights the beat on each click, with the bar accented', async () => {
    const metronome = createFakeMetronome();
    render(
      <TimingCalibration
        kind="tap"
        metronome={metronome}
        createSource={() => createFakeOnsetSource()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    act(() => {
      metronome.tick();
    });
    const light = screen.getByRole('button', { name: 'Tap on each click' }).firstElementChild!;
    expect(light).toHaveAttribute('data-on', 'true');
    expect(light).toHaveAttribute('data-accent', 'bar');
    await waitFor(() => expect(light).toHaveAttribute('data-on', 'false'));
  });

  it('counts taps on the pad, which takes focus', async () => {
    const metronome = createFakeMetronome();
    let at = 0;
    const clock: AudioClock = { start() {}, stop() {}, sample() {}, toContextMs: () => at };
    render(
      <TimingCalibration
        kind="tap"
        metronome={metronome}
        createSource={() => createTapOnsetSource(clock)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    const pad = screen.getByRole('button', { name: 'Tap on each click' });
    expect(pad).toHaveFocus();
    act(() => {
      while (metronome.running) {
        const click = metronome.tick()!;
        at = click.at - 10;
        fireEvent.keyDown(pad, { key: ' ' });
      }
    });
    expect(await screen.findByTestId('timing-calibration-result')).toHaveTextContent('10 ms early');
  });

  it('asks for another go when the taps are too few or too uneven', async () => {
    for (const [offset, text] of [
      [() => 300, /Too few taps landed near the clicks/],
      [(i: number) => (i % 2 ? 100 : -100), /too uneven to measure/],
    ] as const) {
      const metronome = createFakeMetronome();
      const source = createFakeOnsetSource();
      const { unmount } = render(
        <TimingCalibration kind="tap" metronome={metronome} createSource={() => source} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await flush();
      playAlong(metronome, source, offset);
      expect(await screen.findByTestId('timing-calibration-result')).toHaveTextContent(text);
      unmount();
    }
    expect((await getSettings(getDb())).timingOffsets).toEqual({ tap: null, mic: null });
  });

  it('goes back to the start when cancelled, and stops the run on unmount', async () => {
    const metronome = createFakeMetronome();
    const { unmount } = render(
      <TimingCalibration
        kind="tap"
        metronome={metronome}
        createSource={() => createFakeOnsetSource()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(metronome.running).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(metronome.running).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    unmount();
    expect(metronome.running).toBe(false);
  });

  it('listens to the guitar in mic mode, and says when the mic will not start', async () => {
    const metronome = createFakeMetronome();
    const mic = createFakeOnsetSource('mic');
    const { unmount } = render(
      <TimingCalibration kind="mic" metronome={metronome} createSource={() => mic} />,
    );
    expect(screen.getByText(/Play one short note or a muted strum/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(screen.getByRole('img', { name: 'Listening for your guitar' })).toBeInTheDocument();
    playAlong(metronome, mic, () => 60);
    expect(await screen.findByTestId('timing-calibration-result')).toHaveTextContent(
      'Your notes land 60 ms late',
    );
    await waitFor(async () =>
      expect((await getSettings(getDb())).timingOffsets).toEqual({ tap: null, mic: 60 }),
    );
    unmount();

    const denied = createFakeOnsetSource('mic');
    denied.failNextStart('denied');
    render(<TimingCalibration kind="mic" metronome={metronome} createSource={() => denied} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByTestId('timing-calibration-result')).toHaveTextContent(
      /microphone didn.t start/,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('closes from Done', async () => {
    const metronome = createFakeMetronome();
    const source = createFakeOnsetSource();
    let closed = false;
    render(
      <TimingCalibration
        kind="tap"
        metronome={metronome}
        createSource={() => source}
        onDone={() => (closed = true)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    playAlong(metronome, source, () => 0);
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect(closed).toBe(true);
  });
});

describe('<TimingCalibrationSetting>', () => {
  it('shows each stored offset and opens a run in place', async () => {
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, timingOffsets: { tap: -8, mic: null } },
    });
    render(<TimingCalibrationSetting />);
    expect(screen.getByTestId('timing-offset-tap')).toHaveTextContent('8 ms early');
    expect(screen.queryByTestId('timing-offset-mic')).not.toBeInTheDocument();
    const check = screen.getByRole('button', { name: 'Check again' });
    expect(check).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(check);
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('adds the guitar row in mic mode', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, micEnabled: true } });
    render(<TimingCalibrationSetting />);
    expect(screen.getByTestId('timing-offset-tap')).toHaveTextContent('not checked');
    expect(screen.getByTestId('timing-offset-mic')).toHaveTextContent('not checked');
    expect(screen.getAllByRole('button', { name: 'Check' })).toHaveLength(2);
  });
});
