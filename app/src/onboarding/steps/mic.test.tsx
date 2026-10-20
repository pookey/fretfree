import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS } from '../../engine/model';
import {
  createFakePitchSource,
  type FakePitchSource,
  type PitchSourceErrorReason,
} from '../../mic';
import { getDb, getSettings } from '../../storage';
import { ONBOARDING_STEPS } from '../registry';
import * as mic from './mic';

let source: FakePitchSource;

beforeEach(async () => {
  await getDb().settings.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
  source = createFakePitchSource();
});

function renderStep() {
  const onNext = vi.fn();
  const view = render(<mic.MicStep onNext={onNext} source={source} />);
  return { onNext, ...view };
}

const status = () => screen.getByTestId('mic-status');

describe('the mic onboarding step', () => {
  it('is registered before the placement test, which stays last', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids.indexOf('mic')).toBe(ids.indexOf('placement') - 1);
    expect(ids.at(-1)).toBe('placement');
    expect(mic.skippable).toBe(true);
  });

  it('never asks for the mic until the learner taps to turn it on', () => {
    const { onNext } = renderStep();
    expect(source.startCalls).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(source.startCalls).toBe(0);
  });

  it('asks from the tap, saves mic mode once it runs, and shows what it hears', async () => {
    const { onNext } = renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on mic mode' }));
    // Synchronously inside the tap (the iOS gesture rule).
    expect(source.startCalls).toBe(1);
    await waitFor(() => expect(status()).toHaveAttribute('data-phase', 'listening'));
    expect(status()).toHaveTextContent('Listening. Play any open string.');
    await waitFor(async () => expect((await getSettings(getDb())).micEnabled).toBe(true));
    expect(useAppStore.getState().settings.micEnabled).toBe(true);

    act(() => source.play('A2'));
    expect(status()).toHaveTextContent('Mic is working. Heard A2.');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(source.state).toBe('idle');
  });

  it('spells what it hears with the learner’s accidentals', async () => {
    await useAppStore.getState().update({ accidentalPref: 'flat' });
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on mic mode' }));
    await waitFor(() => expect(useAppStore.getState().settings.micEnabled).toBe(true));
    act(() => source.play('C#3'));
    expect(screen.getByTestId('mic-heard')).toHaveTextContent('D♭3');
    await act(() => useAppStore.getState().update({ accidentalPref: 'sharp' }));
    expect(screen.getByTestId('mic-heard')).toHaveTextContent('C♯3');
  });

  it.each<[PitchSourceErrorReason, RegExp]>([
    ['denied', /access was refused/],
    ['no-device', /No microphone was found/],
    ['unsupported', /can’t listen for pitch/],
    ['failed', /didn’t start/],
  ])('says why when the mic can’t start (%s) and leaves mic mode off', async (reason, copy) => {
    const { onNext } = renderStep();
    source.failNextStart(reason);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on mic mode' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy);
    expect(alert).toHaveAttribute('data-reason', reason);
    expect(useAppStore.getState().settings.micEnabled).toBe(false);

    // Setup carries on either way, and a retry asks again.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(status()).toHaveAttribute('data-phase', 'listening'));
    expect(source.startCalls).toBe(2);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('copy differs for every reason', () => {
    const titles = Object.values(mic.MIC_ERROR_COPY).map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('releases the mic when the step goes away', async () => {
    const { unmount } = renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on mic mode' }));
    await waitFor(() => expect(source.state).toBe('running'));
    unmount();
    expect(source.state).toBe('idle');
  });

  it('leaves a mic it didn’t start running on unmount', async () => {
    await source.start();
    const { unmount } = renderStep();
    unmount();
    expect(source.state).toBe('running');
  });

  it('listens along to a mic someone else started, and leaves it running', async () => {
    await source.start();
    const { unmount } = renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on mic mode' }));
    await waitFor(() => expect(status()).toHaveAttribute('data-phase', 'listening'));
    expect(source.startCalls).toBe(1);
    act(() => source.play('E2'));
    expect(status()).toHaveTextContent('Heard E2.');
    unmount();
    expect(source.state).toBe('running');
  });

  it('Continue leaves a mic someone else started running', async () => {
    await source.start();
    const { onNext } = renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on mic mode' }));
    await waitFor(() => expect(status()).toHaveAttribute('data-phase', 'listening'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(source.state).toBe('running');
  });

  it('shows as stopped when something else stops the mic', async () => {
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on mic mode' }));
    await waitFor(() => expect(useAppStore.getState().settings.micEnabled).toBe(true));
    act(() => source.stop());
    expect(status()).toHaveAttribute('data-phase', 'idle');
    expect(screen.getByText(/Mic mode is on/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check the microphone' })).toBeInTheDocument();
  });

  it('when mic mode is already on, offers a check and Continue', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, micEnabled: true } });
    const { onNext } = renderStep();
    expect(screen.getByText(/Mic mode is on/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(source.startCalls).toBe(0);
  });

  it('stays idle if the start is cancelled before it settles', async () => {
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on mic mode' }));
    act(() => source.stop());
    await waitFor(() => expect(status()).toHaveAttribute('data-phase', 'idle'));
    expect(useAppStore.getState().settings.micEnabled).toBe(false);
  });
});
