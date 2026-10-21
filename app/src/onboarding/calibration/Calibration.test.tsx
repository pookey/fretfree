import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { ENGINE_CONFIG } from '../../engine/config';
import { DEFAULT_SETTINGS } from '../../engine/model';
import { getDb, getSettings } from '../../storage';
import * as step from '../steps/calibration';
import { Calibration } from './Calibration';
import { CalibrationSetting } from './CalibrationSetting';

const CFG = ENGINE_CONFIG.calibration;

let clock = 0;
const now = () => clock;
// rng() = 0 picks the shortest pause, and the first cell that isn't the last dot.
const rng = () => 0;

beforeEach(async () => {
  clock = 0;
  await getDb().settings.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // The step and the setting use the default clock.
  vi.spyOn(performance, 'now').mockImplementation(now);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function litDot(): Element | null {
  return document.querySelector('[data-testid="marker-target"]');
}

function cellOf(marker: Element): Element {
  const s = marker.getAttribute('data-string');
  const f = marker.getAttribute('data-fret');
  return document.querySelector(`[data-cell="s${s}f${f}"]`)!;
}

/** Wait out the longest pause, then tap the lit dot `ms` after it lights. */
function tapAfter(ms: number) {
  act(() => vi.advanceTimersByTime(CFG.foreperiodMs.max));
  const dot = litDot();
  expect(dot).not.toBeNull();
  clock += ms;
  fireEvent.pointerDown(cellOf(dot!));
}

/** Back on real timers (the IndexedDB polyfill needs them), wait for the store save to land. */
async function settled(check: () => unknown) {
  vi.useRealTimers();
  await waitFor(check);
}

describe('<Calibration>', { timeout: 20_000 }, () => {
  it('lights one dot at a time after a pause and stores the trimmed median', async () => {
    render(<Calibration now={now} rng={rng} doneAction={<button type="button">Next</button>} />);
    expect(screen.getByText(/Tap each dot as soon as it lights up: 16 dots/)).toBeInTheDocument();
    expect(litDot()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(litDot()).toBeNull();
    act(() => vi.advanceTimersByTime(CFG.foreperiodMs.min - 1));
    expect(litDot()).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const first = litDot()!;
    expect(first).not.toBeNull();
    clock += 2000; // a slow warm-up tap
    fireEvent.pointerDown(cellOf(first));
    expect(litDot()).toBeNull();
    expect(screen.getByTestId('calibration-count')).toHaveTextContent('1 of 16');

    const times = [1500, 600, 610, 620, 2400, 600, 610, 620, 600, 610, 620, 600, 610, 50, 620];
    for (const ms of times) tapAfter(ms);

    expect(screen.getByTestId('calibration-result')).toHaveTextContent('Your tap time is 610 ms');
    await settled(async () => expect((await getSettings(getDb())).latencyBaselineMs).toBe(610));
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeInTheDocument();
  });

  it('ignores taps off the dot and between dots', () => {
    render(<Calibration now={now} rng={rng} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.pointerDown(document.querySelector('[data-cell="s1f0"]')!);
    act(() => vi.advanceTimersByTime(CFG.foreperiodMs.min));
    const lit = cellOf(litDot()!).getAttribute('data-cell');
    fireEvent.pointerDown(document.querySelector(`[data-cell]:not([data-cell="${lit}"])`)!);
    expect(litDot()).not.toBeNull();
    expect(screen.getByTestId('calibration-count')).toHaveTextContent('0 of 16');
  });

  it('asks for another go when too few taps are usable, and saves nothing', async () => {
    render(<Calibration now={now} rng={rng} doneAction={<button type="button">Next</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < CFG.trials; i++) tapAfter(i < 10 ? 3000 : 600);
    expect(screen.getByTestId('calibration-result')).toHaveTextContent(/another go/);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    await act(async () => {
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect((await getSettings(getDb())).latencyBaselineMs).toBeNull();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByTestId('calibration-count')).toHaveTextContent('0 of 16');
  });

  it('stops its timer when it unmounts mid-run', () => {
    const { unmount } = render(<Calibration now={now} rng={rng} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the current tap time before a re-run', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 640 } });
    render(<Calibration now={now} rng={rng} />);
    expect(screen.getByTestId('calibration-current')).toHaveTextContent('640 ms');
  });
});

describe('calibration onboarding step', { timeout: 20_000 }, () => {
  it('is the skippable step after session length, and continues once saved', async () => {
    expect([step.id, step.order, step.skippable]).toEqual(['calibration', 60, true]);
    expect(step.title).toBe('Tap the lit dots');
    const onNext = vi.fn();
    render(<step.Step onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < CFG.trials; i++) tapAfter(500);
    await settled(async () => expect((await getSettings(getDb())).latencyBaselineMs).toBe(500));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe('<CalibrationSetting>', { timeout: 20_000 }, () => {
  it('shows the stored tap time and re-runs the calibration in place', async () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 640 } });
    render(<CalibrationSetting />);
    expect(screen.getByTestId('latency-baseline')).toHaveTextContent('640 ms');
    const toggle = screen.getByRole('button', { name: 'Recalibrate' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Close');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    for (let i = 0; i < CFG.trials; i++) tapAfter(i % 2 ? 800 : 820);
    await settled(() => expect(screen.getByTestId('latency-baseline')).toHaveTextContent('810 ms'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Recalibrate' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('offers to measure when there is no tap time yet', () => {
    render(<CalibrationSetting />);
    expect(screen.getByTestId('latency-baseline')).toHaveTextContent('not measured');
    expect(screen.getByRole('button', { name: 'Measure' })).toHaveAccessibleDescription(
      /how long a tap takes you on this screen/i,
    );
  });
});
