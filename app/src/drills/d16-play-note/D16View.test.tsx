import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { findItemId, octaveItemId, type GuideLevel } from '../../engine/model';
import { createFakePitchSource, setPitchSourceFactory, type FakePitchSource } from '../../mic';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import type { DrillFeedback } from '../types';
import { D16View } from './D16View';
import {
  d16Check,
  d16GradedResponseMs,
  d16MakePrompt,
  type D16Answer,
  type D16Prompt,
} from './logic';

const prompt = (id: string, scopeLevel = 1) =>
  d16MakePrompt(
    { id, skillId: 'F2.string6-naturals' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

let mic: FakePitchSource;

beforeEach(() => {
  mic = createFakePitchSource();
  setPitchSourceFactory(() => mic);
});

afterEach(() => {
  setPitchSourceFactory(null);
});

function view(
  p: D16Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    compactFrets?: number;
    feedback?: DrillFeedback<D16Answer> | null;
  } = {},
) {
  const onAnswer = vi.fn();
  const props = {
    prompt: p,
    guideLevel: over.guideLevel ?? 3,
    guided: over.guided ?? false,
    handedness: 'right',
    sizeClass: over.sizeClass ?? 'regular-wide',
    compactFrets: over.compactFrets,
    tuning: STANDARD_TUNING,
    feedback: over.feedback ?? null,
    onAnswer,
  } as const;
  const utils = render(<D16View {...props} />);
  return { ...utils, onAnswer, props };
}

const fb = (p: D16Prompt, midi: number, name: string): DrillFeedback<D16Answer> => {
  const answer = { midi, name, cents: 0 };
  return { answer, result: d16Check(p, answer) };
};

async function startListening() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start listening' }));
  });
}

const play = (note: string, opts?: Parameters<FakePitchSource['play']>[1]) =>
  act(() => mic.play(note, opts));

describe('<D16View>', () => {
  it('asks for the note and starts the mic only on a tap', async () => {
    view(prompt(findItemId('A', 6)));
    expect(screen.getByTestId('d16-prompt')).toHaveTextContent('Play A on string 6');
    expect(screen.getByTestId('d16-explain')).toHaveTextContent(/^Frets 0–12\./);
    expect(
      screen.getByText(
        'Play it on your guitar. FretFree listens through the mic; nothing is recorded or sent.',
      ),
    ).toBeVisible();
    expect(mic.startCalls).toBe(0);
    await startListening();
    expect(mic.startCalls).toBe(1);
    expect(screen.getByTestId('d16-mic')).toHaveAttribute('data-state', 'running');
    expect(screen.getByRole('status')).toHaveTextContent('Listening…');
  });

  it('answers with the note it hears, once per prompt', async () => {
    const { onAnswer } = view(prompt(findItemId('A', 6)));
    await startListening();
    play('A2');
    expect(onAnswer).toHaveBeenCalledWith({
      midi: 45,
      name: 'A2',
      cents: 0,
      listenedMs: expect.any(Number),
    });
    act(() => mic.silence(200));
    play('B2');
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('times the answer from when the mic started, not from the prompt', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    try {
      const p = prompt(findItemId('A', 6));
      const { onAnswer } = view(p);
      // The learner reads the panel, taps, and grants the mic 8s later.
      clock.mockReturnValue(9_000);
      await startListening();
      clock.mockReturnValue(10_500);
      play('A2');
      const answer = onAnswer.mock.calls[0]![0] as D16Answer;
      expect(answer.listenedMs).toBe(1_500);
      // The session measured 9.5s; only the 1.5s listened is graded.
      expect(d16GradedResponseMs(p, answer, 9_500)).toBe(350);
    } finally {
      clock.mockRestore();
    }
  });

  it("doesn't let the wrong-answer playback answer the next prompt, or time it", async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    try {
      const first = prompt(findItemId('A', 6));
      const { onAnswer, rerender, props } = view(first);
      await startListening();
      play('B2');
      expect(onAnswer).toHaveBeenCalledTimes(1);
      act(() => mic.silence(100));
      clock.mockReturnValue(2_000);
      rerender(<D16View {...props} feedback={fb(first, 47, 'B2')} />);
      // Continue at once: the session's A2 then B2 are still sounding.
      clock.mockReturnValue(2_100);
      rerender(<D16View {...props} prompt={prompt(findItemId('B', 6))} />);
      play('A2', { durationMs: 450 });
      play('B2', { durationMs: 900 });
      expect(onAnswer).toHaveBeenCalledTimes(1);
      act(() => mic.silence(1_500));
      // Timed from the end of the playback (2s + 2450ms), not the prompt.
      clock.mockReturnValue(5_000);
      play('B2');
      expect(onAnswer).toHaveBeenCalledTimes(2);
      expect((onAnswer.mock.calls[1]![0] as D16Answer).listenedMs).toBe(550);
    } finally {
      clock.mockRestore();
    }
  });

  it("doesn't let a note ringing from the last prompt answer the next", async () => {
    const first = prompt(findItemId('A', 6));
    const { onAnswer, rerender, props } = view(first);
    await startListening();
    play('A2');
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const next = prompt(findItemId('A', 5));
    rerender(<D16View {...props} prompt={next} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Still hearing A. Mute the strings, then play.',
    );
    play('A2');
    expect(onAnswer).toHaveBeenCalledTimes(1);
    act(() => mic.silence(200));
    expect(screen.getByRole('status')).toHaveTextContent('Listening…');
    play('A2');
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it('ignores notes once the answer is shown', async () => {
    const p = prompt(findItemId('A', 6));
    const { onAnswer, rerender, props } = view(p);
    await startListening();
    rerender(<D16View {...props} feedback={fb(p, 45, 'A2')} />);
    play('B2');
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByTestId('d16-mic')).toBeNull();
  });

  it('explains a refused microphone and offers to try again', async () => {
    view(prompt(findItemId('A', 6)));
    mic.failNextStart('denied');
    await startListening();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "FretFree can't use the mic. Allow the microphone for this site in your browser's settings, then try again.",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(mic.startCalls).toBe(2);
    expect(screen.getByTestId('d16-mic')).toHaveAttribute('data-state', 'running');
  });

  it('says when the mic stops mid-drill, and listens again on a tap', async () => {
    const { onAnswer } = view(prompt(findItemId('A', 6)));
    await startListening();
    act(() => mic.loseInput());
    expect(screen.getByRole('alert')).toHaveTextContent(/The mic stopped/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(screen.getByTestId('d16-mic')).toHaveAttribute('data-state', 'running');
    play('A2');
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('offers no retry where the browser cannot listen', async () => {
    view(prompt(findItemId('A', 6)));
    mic.failNextStart('unsupported');
    await startListening();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "This browser can't listen to your guitar. Try Safari on iPad, or Chrome.",
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('turns the mic off when the drill goes', async () => {
    const { unmount } = view(prompt(findItemId('A', 6)));
    await startListening();
    unmount();
    expect(mic.state).toBe('idle');
  });

  it('shows the answer on the neck only in a worked example or feedback', () => {
    const p = prompt(findItemId('A', 6));
    const { rerender, props } = view(p);
    expect(screen.queryAllByTestId(/^marker-/)).toHaveLength(0);
    rerender(<D16View {...props} guided />);
    expect(screen.getByTestId('d16-prompt')).toHaveTextContent(
      'This is A on string 6, fret 5. Play it to continue.',
    );
    expect(screen.getByTestId('marker-target')).toHaveAttribute('data-fret', '5');
    rerender(<D16View {...props} feedback={fb(p, 47, 'B2')} />);
    expect(screen.getByTestId('d16-explain')).toHaveTextContent(
      'You played B2. A is at fret 5 on string 6.',
    );
    expect(screen.getByTestId('marker-correct')).toHaveAttribute('data-fret', '5');
    expect(screen.getByTestId('marker-wrong')).toHaveAttribute('data-fret', '7');
  });

  it('names sharps with ♯ in the prompt, markers and feedback', () => {
    const p = prompt(findItemId('F#', 6));
    const { rerender, props } = view(p);
    expect(screen.getByTestId('d16-prompt')).toHaveTextContent('Play F♯ on string 6');
    rerender(<D16View {...props} feedback={fb(p, 43, 'G2')} />);
    expect(screen.getByTestId('d16-explain')).toHaveTextContent(
      'You played G2. F♯ is at fret 2 on string 6.',
    );
    expect(screen.getByTestId('marker-correct')).toHaveTextContent('F♯');
    expect(screen.queryByText(/#/)).toBeNull();
  });

  it("draws an octave shape's dot and asks for its octave", () => {
    const p = prompt(octaveItemId({ string: 6, fret: 5 }, 4));
    view(p);
    expect(screen.getByTestId('d16-prompt')).toHaveTextContent(
      'Play the octave of this A on string 4',
    );
    expect(screen.getAllByTestId(/^marker-/)).toHaveLength(1);
    expect(screen.getByTestId('marker-root')).toHaveAttribute('data-string', '6');
  });

  it('asks for any octave in pitch-class mode', () => {
    view(prompt(findItemId('A', 6), 0));
    expect(screen.getByTestId('d16-explain')).toHaveTextContent('Any A counts, in any octave.');
  });

  it('shows a window of frets on compact screens', () => {
    view(prompt(findItemId('A', 6)), { sizeClass: 'compact', compactFrets: 6 });
    expect(screen.getByTestId('d16-window')).toHaveTextContent('Frets 0–5');
  });
});
