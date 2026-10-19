import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useAppStore } from '../../../app-store';
import { DEFAULT_SETTINGS } from '../../../engine/model';
import { createFakePitchSource, type FakePitchSource } from '../../../mic/source';
import { TUNER_CONFIG } from './config';
import { Tuner, type ToneSound } from './Tuner';

const size = { w: window.innerWidth, h: window.innerHeight };
function resize(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
  window.dispatchEvent(new Event('resize'));
}

let source: FakePitchSource;
let playTone: Mock<(note: string, sound: ToneSound) => void>;

function renderTuner() {
  return render(
    <MemoryRouter>
      <Tuner source={source} playTone={playTone} />
    </MemoryRouter>,
  );
}

const micCheck = () => screen.getByTestId('mic-check');
const note = () => screen.getByTestId('tuner-note');

async function startTuner() {
  fireEvent.click(screen.getByRole('button', { name: 'Start tuner' }));
  await act(async () => {});
}

function play(...args: Parameters<FakePitchSource['play']>) {
  act(() => source.play(...args));
}

beforeEach(() => {
  source = createFakePitchSource();
  playTone = vi.fn();
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

afterEach(() => {
  resize(size.w, size.h);
  vi.useRealTimers();
});

describe('<Tuner>', () => {
  it('asks for the mic only when the learner taps Start', async () => {
    renderTuner();
    expect(source.startCalls).toBe(0);
    expect(micCheck()).toHaveAttribute('data-state', 'off');
    expect(screen.getByRole('status')).toHaveTextContent('asks for it only when you tap Start');
    expect(screen.getByTestId('tuner-advice')).toHaveTextContent('Not listening');

    await startTuner();
    expect(source.startCalls).toBe(1);
    expect(micCheck()).toHaveAttribute('data-state', 'listening');
    expect(screen.getByRole('status')).toHaveTextContent('Listening. Play an open string.');
    expect(screen.getByTestId('tuner-advice')).toHaveTextContent('Play a string');
  });

  it('shows the note, its cents, the needle and the nearest string', async () => {
    renderTuner();
    await startTuner();
    play('A2', { cents: -12 });
    expect(note()).toHaveTextContent('A2');
    expect(screen.getByTestId('tuner-cents')).toHaveTextContent('−12 cents');
    expect(screen.getByTestId('tuner-advice')).toHaveTextContent('Flat: tune up');
    const needle = screen.getByRole('meter', { name: 'Tuning needle' });
    expect(needle).toHaveAttribute('aria-valuenow', '-12');
    expect(needle).toHaveAttribute('aria-valuetext', 'A2, −12 cents, flat: tune up');
    expect(Number(needle.getAttribute('data-angle'))).toBeCloseTo(-14.4);
    expect(screen.queryByTestId('in-tune-mark')).toBeNull();
    const string = screen.getByTestId('tuner-string');
    expect(string).toHaveTextContent('5th string · A2');
    expect(string).toHaveTextContent('Tune up 12 cents');
    expect(screen.getByRole('button', { name: 'A2, 5th string' })).toHaveAttribute(
      'data-nearest',
      'true',
    );
  });

  it('marks in tune within ±5 cents by shape and words, not colour alone', async () => {
    renderTuner();
    await startTuner();
    play('E2', { cents: 4 });
    expect(screen.getByTestId('tuner-advice')).toHaveTextContent('✓In tune');
    expect(screen.getByTestId('in-tune-mark')).toBeInTheDocument();
    expect(screen.getByTestId('tuner-string')).toHaveTextContent('In tune');
    const low = screen.getByRole('button', { name: 'E2, 6th string' });
    expect(low).toHaveAttribute('data-in-tune', 'true');
    expect(low).toHaveTextContent('✓');

    play('E2', { cents: 9 });
    expect(screen.getByTestId('tuner-advice')).toHaveTextContent('Sharp: tune down');
    expect(screen.queryByTestId('in-tune-mark')).toBeNull();
  });

  it('says the mic is working once it hears a note: the mic check', async () => {
    renderTuner();
    await startTuner();
    act(() => source.silence(200));
    expect(micCheck()).toHaveAttribute('data-state', 'listening');
    play('D3');
    expect(micCheck()).toHaveAttribute('data-state', 'working');
    expect(screen.getByRole('status')).toHaveTextContent('Mic is working.');
    // It stays working through silence; the reading clears after the hold.
    act(() => source.silence(TUNER_CONFIG.holdMs + 100));
    expect(micCheck()).toHaveAttribute('data-state', 'working');
    expect(note()).toHaveTextContent('–');
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('spells notes the learner’s way', async () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, accidentalPref: 'flat' } });
    renderTuner();
    await startTuner();
    play('A#2');
    expect(note()).toHaveTextContent('Bb2');
    expect(screen.getByTestId('tuner-string')).toHaveTextContent('Tune down about 1 semitone');
  });

  it.each([
    ['denied', 'isn’t allowed to use the microphone', 'Try again'],
    ['no-device', 'No microphone was found', 'Try again'],
    ['failed', 'couldn’t start', 'Try again'],
    ['unsupported', 'can’t listen through a microphone', null],
  ] as const)('explains a %s mic and offers the right way on', async (reason, copy, retry) => {
    renderTuner();
    source.failNextStart(reason);
    await startTuner();
    expect(micCheck()).toHaveAttribute('data-state', reason);
    expect(screen.getByRole('alert')).toHaveTextContent(copy);
    if (!retry) {
      expect(within(micCheck()).queryByRole('button')).toBeNull();
      return;
    }
    fireEvent.click(screen.getByRole('button', { name: retry }));
    await act(async () => {});
    expect(micCheck()).toHaveAttribute('data-state', 'listening');
  });

  it('notices a mic that stops while listening, and restarts it', async () => {
    renderTuner();
    await startTuner();
    play('A2');
    act(() => source.loseInput());
    expect(micCheck()).toHaveAttribute('data-state', 'lost');
    expect(screen.getByRole('alert')).toHaveTextContent('The mic stopped.');
    expect(screen.queryByRole('meter')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    await act(async () => {});
    expect(source.startCalls).toBe(2);
    expect(micCheck()).toHaveAttribute('data-state', 'listening');
  });

  it('stops on Stop, and releases the mic when the tuner closes', async () => {
    const { unmount } = renderTuner();
    await startTuner();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(source.state).toBe('idle');
    expect(screen.getByRole('button', { name: 'Start tuner' })).toBeInTheDocument();
    await startTuner();
    unmount();
    expect(source.state).toBe('idle');
  });

  it('plays reference tones, and ignores the mic while one sounds', async () => {
    vi.useFakeTimers();
    renderTuner();
    const buttons = within(screen.getByRole('region', { name: 'Reference tones' })).getAllByRole(
      'button',
    );
    expect(buttons.map((b) => b.textContent?.slice(0, 1))).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
    await startTuner();
    play('A2');

    fireEvent.click(screen.getByRole('button', { name: 'E4, 1st string' }));
    expect(playTone).toHaveBeenCalledWith('E4', { muted: false, volume: 0.8 });
    expect(screen.getByRole('button', { name: 'E4, 1st string' })).toHaveAttribute(
      'data-sounding',
      'true',
    );
    expect(screen.getByTestId('tuner-advice')).toHaveTextContent('Playing E4.');
    play('E4');
    expect(note()).toHaveTextContent('–');

    act(() => vi.advanceTimersByTime(TUNER_CONFIG.referenceTone.muteMicMs));
    play('G3');
    expect(note()).toHaveTextContent('G3');
  });

  it('works without a mic: tones play before the tuner ever starts', () => {
    renderTuner();
    fireEvent.click(screen.getByRole('button', { name: 'A2, 5th string' }));
    expect(playTone).toHaveBeenCalledWith('A2', expect.anything());
    expect(source.startCalls).toBe(0);
  });

  it('says so when sound is off, rather than playing nothing', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, soundOn: false } });
    renderTuner();
    const button = screen.getByRole('button', { name: 'A2, 5th string' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(playTone).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Turn it on in Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('sets the dial beside the panels on iPad, and stacks them on compact', () => {
    resize(1194, 834);
    const { container, unmount } = renderTuner();
    expect(container.firstElementChild).toHaveAttribute('data-layout', 'split');
    unmount();
    resize(390, 844);
    expect(renderTuner().container.firstElementChild).toHaveAttribute('data-layout', 'stack');
  });
});
