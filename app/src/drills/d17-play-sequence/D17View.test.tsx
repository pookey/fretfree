import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuideLevel } from '../../engine/model';
import { createFakePitchSource, setPitchSourceFactory, type FakePitchSource } from '../../mic';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING } from '../../theory';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D17View } from './D17View';
import { D17_ID, d17Check, d17MakePrompt, type D17Answer, type D17Prompt } from './logic';

/** Root on fret 5 for shapes valid on frets 1–12: A on string 6. */
const prompt = (id: string, scopeLevel = 0, rng = 4.5 / 12) =>
  d17MakePrompt(
    { id, skillId: 'sk' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => rng },
  );

let fake: FakePitchSource;
let clock = 1000;

beforeEach(() => {
  fake = createFakePitchSource();
  setPitchSourceFactory(() => fake);
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  setPitchSourceFactory(null);
  vi.restoreAllMocks();
});

function view(
  p: D17Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<D17Answer> | null;
  } = {},
) {
  const onAnswer = vi.fn();
  const props = {
    guideLevel: over.guideLevel ?? 3,
    guided: over.guided ?? false,
    handedness: 'right' as const,
    sizeClass: over.sizeClass ?? ('regular-wide' as SizeClass),
    tuning: STANDARD_TUNING,
    onAnswer,
  };
  const utils = render(<D17View prompt={p} feedback={over.feedback ?? null} {...props} />);
  const rerender = (next: D17Prompt, feedback: DrillFeedback<D17Answer> | null) =>
    utils.rerender(<D17View prompt={next} feedback={feedback} {...props} />);
  return { ...utils, onAnswer, rerender };
}

/** Taps "Start listening"; the fake mic starts at once. */
async function startListening() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start listening' }));
    await Promise.resolve();
  });
  expect(screen.getByTestId('d17-listening')).toHaveTextContent('Listening…');
}

/** Plays a note a little after now, as a learner would. */
function play(note: string, afterMs = 500) {
  clock += afterMs;
  act(() => {
    fake.play(note);
    fake.silence(200);
  });
}

const fb = (p: D17Prompt, answer: D17Answer): DrillFeedback<D17Answer> => ({
  answer,
  result: d17Check(p, answer),
});
const slots = () => within(screen.getByTestId('d17-slots')).getAllByRole('listitem');
const neck = () => screen.getByRole('group', { name: /^Fretboard/ });
const markers = (style: string) =>
  within(neck())
    .queryAllByTestId(`marker-${style}`)
    .map((m) => `s${m.getAttribute('data-string')}f${m.getAttribute('data-fret')}`);

describe('D17View', () => {
  it('asks for the sequence and waits for a tap before using the mic (design §9)', () => {
    view(prompt('interval:M3@s6→s5'));
    expect(screen.getByTestId('d17-prompt')).toHaveTextContent(
      'Play A, then the major 3rd above it.',
    );
    expect(screen.getByTestId('d17-explain')).toHaveTextContent('4 half steps up from the root.');
    expect(fake.startCalls).toBe(0);
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeVisible();
    expect(slots().map((s) => s.getAttribute('aria-label'))).toEqual([
      'Note 1 of 2: not yet',
      'Note 2 of 2: not yet',
    ]);
    // Scope 0 marks the root to start from.
    expect(markers('root')).toEqual(['s6f5']);
    expect(neck()).toHaveAccessibleName('Fretboard: the root, A, on string 6, fret 5.');
  });

  it('hears the sequence in order and answers with it', async () => {
    const { onAnswer } = view(prompt('interval:M3@s6→s5'));
    await startListening();
    play('A3');
    expect(slots()[0]).toHaveAttribute('aria-label', 'Note 1 of 2: heard A');
    expect(screen.getByTestId('d17-listening')).toHaveTextContent('Heard A: 1 of 2.');
    expect(onAnswer).not.toHaveBeenCalled();
    play('C#4', 700);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    const answer = onAnswer.mock.calls[0]![0] as D17Answer;
    expect(answer.played).toEqual([57, 61]);
    expect(answer.gaveUp).toBeUndefined();
    // Timed from the start of listening, not from mount.
    expect(answer.responseMs).toBe(1200);
  });

  it('ends the attempt at the first wrong note', async () => {
    const { onAnswer } = view(prompt('interval:M3@s6→s5'));
    await startListening();
    play('A2');
    play('C3');
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ played: [45, 48] }));
    // Nothing more is taken once it has answered.
    play('C#3');
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('ignores a re-picked note and a note already sounding when the prompt appeared', async () => {
    const { onAnswer } = view(prompt('interval:M3@s6→s5'));
    await startListening();
    // Started before the prompt: still ringing from the last item.
    play('A2', 0);
    expect(slots()[0]).toHaveAttribute('aria-label', 'Note 1 of 2: not yet');
    play('A2');
    play('A2');
    expect(slots().filter((s) => s.getAttribute('data-state') === 'heard')).toHaveLength(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('"Show me the answer" gives up with what was heard', async () => {
    const { onAnswer } = view(prompt('spell-key:G'));
    await startListening();
    play('G2');
    fireEvent.click(screen.getByRole('button', { name: 'Show me the answer' }));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ played: [43], gaveUp: true }));
  });

  it('explains a refused mic and lets the learner retry', async () => {
    fake.failNextStart('denied');
    view(prompt('interval:M3@s6→s5'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start listening' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/can't use the mic/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('d17-listening')).toBeVisible();
    expect(fake.startCalls).toBe(2);
  });

  it('keeps listening across prompts, ignoring the playback of a miss', async () => {
    const first = prompt('interval:M3@s6→s5');
    const { onAnswer, rerender } = view(first);
    await startListening();
    play('A2');
    play('B2');
    const answer = onAnswer.mock.calls[0]![0] as D17Answer;
    rerender(first, fb(first, answer));
    expect(screen.queryByRole('button', { name: 'Show me the answer' })).toBeNull();

    // The next prompt appears while the miss (2 notes) is still playing back.
    clock += 300;
    const next = prompt('interval:P5@s6→s5');
    rerender(next, null);
    expect(fake.state).toBe('running');
    play('A2', 200);
    expect(slots()[0]).toHaveAttribute('data-state', 'open');
    play('A2', 3000);
    expect(slots()[0]).toHaveAttribute('data-state', 'heard');
  });

  it('stops the mic when the drill goes away', async () => {
    const { unmount } = view(prompt('interval:M3@s6→s5'));
    await startListening();
    unmount();
    expect(fake.state).toBe('idle');
  });

  it('shows one fingering, numbered, on a worked example', () => {
    view(prompt('spell-chord:major@C', 0, 0), { guided: true });
    expect(screen.getByTestId('d17-explain')).toHaveTextContent(/numbered dots.*C E G\.$/);
    expect(markers('root')).toHaveLength(1);
    expect(markers('tone')).toHaveLength(2);
    expect(within(neck()).getByTestId('marker-root')).toHaveTextContent('1');
  });

  it('marks nothing at scope 1 and fades the hint below guide level 2', () => {
    view(prompt('spell-key:D', 1), { guideLevel: 1 });
    expect(markers('root')).toEqual([]);
    expect(neck()).toHaveAccessibleName('Fretboard');
    expect(screen.getByTestId('d17-explain')).toBeEmptyDOMElement();
  });

  it('shows the sequence and where it went wrong in feedback', () => {
    const p = prompt('spell-chord:minor@A');
    const a = p.steps[0]!.midi;
    view(p, { feedback: fb(p, { played: [a, a + 4] }) });
    expect(screen.getByTestId('d17-explain')).toHaveTextContent(
      'You played C♯. After A comes C. It goes A C E.',
    );
    expect(slots().map((s) => s.getAttribute('data-state'))).toEqual([
      'heard',
      'wrong',
      'expected',
    ]);
    expect(slots().map((s) => s.textContent)).toEqual(['✓A', '✗C♯', '3E']);
    expect(slots()[1]).toHaveAttribute('aria-label', 'Note 2 of 3: heard C♯, wanted C');
    expect(markers('root')).toHaveLength(1);
    expect(markers('correct')).toHaveLength(2);
  });

  it('fits a compact screen to the fingering and the regular neck to high positions', () => {
    const p = prompt('spell-key:A', 0, 0.999);
    const { unmount } = view(p, { sizeClass: 'compact' });
    const frets = () =>
      Array.from(neck().querySelectorAll('[data-cell]')).map((c) =>
        Number(/f(\d+)$/.exec(c.getAttribute('data-cell')!)![1]),
      );
    expect(Math.min(...frets())).toBe(p.window.from);
    expect(Math.max(...frets())).toBe(p.window.to);
    unmount();
    view(p, { sizeClass: 'regular' });
    expect(Math.max(...frets())).toBe(p.span.to > 12 ? 15 : 12);
  });
});

describe('D17 plugin', () => {
  it('is registered, needs the mic and renders its view', async () => {
    const drill = getDrill(D17_ID)!;
    expect(drill.requiresMic).toBe(true);
    expect(drill.inputModes).toEqual(['mic']);
    expect(drill.skills).toContain('C3.thirds');
    expect(drill.skills).toContain('C4.sharp-keys');
    await expect(resolveView(drill.render)).resolves.toBe(D17View);
  });
});
