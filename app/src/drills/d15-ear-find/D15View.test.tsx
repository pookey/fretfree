import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { playNotes } from '../../audio/audio';
import { DEFAULT_SETTINGS } from '../../engine';
import type { GuideLevel, Handedness } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { D15View } from './D15View';
import { d15Check, d15MakePrompt, type D15Prompt } from './logic';

vi.mock('../../audio/audio', () => ({ playNotes: vi.fn(() => Promise.resolve()) }));

const prompt = (id: string, scopeLevel = 0) =>
  d15MakePrompt(
    { id, skillId: id.startsWith('ear-') ? 'I6.ear-find' : 'C2.all-notes' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

function view(
  p: D15Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    compactFrets?: number;
    handedness?: Handedness;
    feedback?: DrillFeedback<Position> | null;
  } = {},
) {
  const onAnswer = vi.fn();
  const props = {
    prompt: p,
    guideLevel: over.guideLevel ?? 1,
    guided: over.guided ?? false,
    handedness: over.handedness ?? 'right',
    sizeClass: over.sizeClass ?? 'regular-wide',
    compactFrets: over.compactFrets,
    tuning: STANDARD_TUNING,
    feedback: over.feedback ?? null,
    onAnswer,
  } as const;
  const utils = render(<D15View {...props} />);
  return { ...utils, onAnswer, props };
}

const neck = () => screen.getByRole('group', { name: /find the note you hear on string/ });
const cell = (string: number, fret: number) =>
  neck().querySelector(`[data-cell="s${string}f${fret}"]`) as SVGElement;
const fb = (p: D15Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d15Check(p, answer),
});
const setSettings = (over: Partial<typeof DEFAULT_SETTINGS>) =>
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, ...over } });

beforeEach(() => {
  vi.mocked(playNotes).mockClear();
  setSettings({});
});

describe('<D15View>', () => {
  it('names the note on a C2 find card, plays it, and answers with the tapped cell', () => {
    const p = prompt('find:G@s5');
    // The name follows the card, not the guides: it shows at every guide level.
    const { onAnswer } = view(p, { guideLevel: 0 });
    expect(screen.getByTestId('d15-prompt')).toHaveTextContent('Find the G you hear on string 5');
    expect(screen.getByTestId('d15-explain')).toHaveTextContent('First the open A, then the note.');
    expect(playNotes).toHaveBeenCalledTimes(1);
    expect(playNotes).toHaveBeenCalledWith(['A2', 'G3'], { volume: 0.8 });
    fireEvent.pointerDown(cell(5, 10));
    expect(onAnswer).toHaveBeenCalledWith({ string: 5, fret: 10 });
  });

  it('holds the name back on an ear card, at every guide level', () => {
    view(prompt('ear-find:G@s5'), { guideLevel: 3 });
    expect(screen.getByTestId('d15-prompt')).toHaveTextContent(
      'Find the note you hear on string 5',
    );
  });

  it('plays each prompt once under StrictMode, and again on request', () => {
    const p = prompt('ear-find:G@s5');
    const props = {
      prompt: p,
      guideLevel: 1 as GuideLevel,
      guided: false,
      handedness: 'right' as const,
      sizeClass: 'regular-wide' as const,
      tuning: STANDARD_TUNING,
      feedback: null,
      onAnswer: vi.fn(),
    };
    const { rerender } = render(
      <StrictMode>
        <D15View {...props} />
      </StrictMode>,
    );
    expect(playNotes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Hear it again' }));
    expect(playNotes).toHaveBeenCalledTimes(2);
    // Feedback doesn't replay the prompt (the session plays the answer).
    rerender(
      <StrictMode>
        <D15View {...props} feedback={fb(p, { string: 5, fret: 10 })} />
      </StrictMode>,
    );
    expect(playNotes).toHaveBeenCalledTimes(2);
    rerender(
      <StrictMode>
        <D15View {...props} prompt={prompt('ear-find:C@s4')} />
      </StrictMode>,
    );
    expect(playNotes).toHaveBeenCalledTimes(3);
    expect(playNotes).toHaveBeenLastCalledWith(['D3', 'C4'], { volume: 0.8 });
  });

  it('with sound off, still names a find card, and waits to play', () => {
    setSettings({ soundOn: false });
    view(prompt('find:G@s5'));
    expect(screen.getByTestId('d15-prompt')).toHaveTextContent('Find the G you hear on string 5');
    expect(screen.getByTestId('d15-explain')).toHaveTextContent('Sound is off');
    expect(screen.getByRole('button', { name: 'Hear it again' })).toBeDisabled();
    expect(playNotes).not.toHaveBeenCalled();
  });

  it('with sound off, asks for sound on an ear card instead of naming the note', async () => {
    setSettings({ soundOn: false });
    const update = vi.fn(async () => setSettings({ soundOn: true }));
    useAppStore.setState({ update });
    view(prompt('ear-find:G@s5'));
    expect(screen.getByTestId('d15-prompt')).toHaveTextContent(
      'Find the note you hear on string 5',
    );
    expect(screen.getByTestId('d15-explain')).toHaveTextContent('Turn it on to hear the note.');
    expect(playNotes).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Turn sound on' }));
    });
    expect(update).toHaveBeenCalledWith({ soundOn: true });
    // The prompt plays as soon as sound is on.
    expect(playNotes).toHaveBeenCalledWith(['A2', 'G3'], { volume: 0.8 });
    expect(screen.getByRole('button', { name: 'Hear it again' })).toBeEnabled();
  });

  it('follows the volume setting', () => {
    view(prompt('ear-find:G@s5'));
    act(() => setSettings({ volume: 0.3 }));
    fireEvent.click(screen.getByRole('button', { name: 'Hear it again' }));
    expect(playNotes).toHaveBeenLastCalledWith(['A2', 'G3'], { muted: false, volume: 0.3 });
  });

  it('ignores taps on other strings and beyond fret 12', () => {
    const { container, onAnswer } = view(prompt('ear-find:G@s5'));
    fireEvent.pointerDown(cell(4, 5));
    fireEvent.pointerDown(cell(5, 14));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(container.querySelector('[data-live-string="5"]')).not.toBeNull();
  });

  it('never shows the note on an ear card before an unguided answer, even at guide level 3', () => {
    // Includes notes that name an open string (A at fret 12 of string 5) and accidentals.
    for (const id of ['ear-find:A@s5', 'ear-find:G@s5', 'ear-find:F#@s3', 'ear-find:E@s1']) {
      const p = prompt(id);
      const { container, unmount } = view(p, { guideLevel: 3 });
      const svg = container.querySelector('svg[data-fret-from]') as SVGElement;
      const strings = [...svg.querySelectorAll('[data-testid="string-name"]')].map(
        (t) => t.textContent,
      );
      expect(strings, id).not.toContain(p.pc);
      expect(screen.getByTestId('d15-prompt'), id).not.toHaveTextContent(
        new RegExp(`\\b${p.pc}\\b`),
      );
      // Only the reference marks the neck.
      const markers = svg.querySelectorAll('[data-testid^="marker-"]');
      expect(markers, id).toHaveLength(1);
      expect(markers[0]).toHaveAttribute('data-testid', 'marker-root');
      expect(markers[0]).toHaveAttribute('data-fret', '0');
      const labels = [...svg.querySelectorAll('[data-cell]')].map((c) =>
        c.getAttribute('aria-label'),
      );
      for (const l of labels) expect(l, id).toMatch(/^string \d, fret \d+$/);
      unmount();
    }
  });

  it('always labels the open string, even when the note is its octave', () => {
    // A bare reference would mark the octave (fret 12) as the answer.
    for (const id of ['ear-find:A@s5', 'ear-find:G@s5']) {
      const { unmount } = view(prompt(id));
      expect(screen.getByTestId('marker-root'), id).toHaveTextContent('A');
      unmount();
    }
  });

  it('keeps the note off the neck on a named card', () => {
    for (const id of ['find:A@s5', 'find:G@s5', 'find:E@s1']) {
      const p = prompt(id);
      const { container, unmount } = view(p, { guideLevel: 3 });
      const svg = container.querySelector('svg[data-fret-from]') as SVGElement;
      expect(svg.querySelectorAll('[data-testid="marker-target"]'), id).toHaveLength(0);
      const strings = [...svg.querySelectorAll('[data-testid="string-name"]')].map(
        (t) => t.textContent,
      );
      expect(strings, id).not.toContain(p.pc);
      unmount();
    }
  });

  it('lets every string answer at the wider scope', () => {
    const { container, onAnswer } = view(prompt('ear-find:G@s5', 1));
    expect(container.querySelector('[data-live-string]')).toBeNull();
    fireEvent.pointerDown(cell(4, 5));
    expect(onAnswer).toHaveBeenCalledWith({ string: 4, fret: 5 });
  });

  it('shows the note on a guided worked example, ear cards too', () => {
    view(prompt('ear-find:G@s5'), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d15-prompt')).toHaveTextContent(
      'This is G on string 5, a minor 7th above the open A. Listen, then tap it.',
    );
    expect(screen.getByTestId('marker-target')).toHaveAttribute('data-fret', '10');
  });

  it('shows both positions and how far off a wrong tap was', () => {
    const p = prompt('ear-find:G@s5');
    const { onAnswer } = view(p, { feedback: fb(p, { string: 5, fret: 8 }) });
    expect(screen.getByTestId('marker-correct')).toHaveAttribute('data-fret', '10');
    expect(screen.getByTestId('marker-correct')).toHaveTextContent('G');
    expect(screen.getByTestId('marker-wrong')).toHaveTextContent('F');
    expect(screen.getByTestId('d15-explain')).toHaveTextContent(
      'You tapped F (fret 8), 2 frets too low.',
    );
    fireEvent.pointerDown(cell(5, 10));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('moves a focus cell along the string with the arrow keys and taps it with Enter', () => {
    const { onAnswer } = view(prompt('ear-find:G@s5'));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(5, 0));
    fireEvent.keyDown(window, { key: 'End' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    // Only the named string is live.
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell(5, 10));
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
    (document.activeElement as SVGElement).blur();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith({ string: 5, fret: 10 });
  });

  it('ignores Enter on other controls and keys once answered', () => {
    const p = prompt('ear-find:G@s5');
    const { onAnswer, rerender, props } = view(p, { sizeClass: 'compact' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Higher frets' }), { key: 'Enter' });
    expect(onAnswer).not.toHaveBeenCalled();
    rerender(<D15View {...props} feedback={fb(p, { string: 5, fret: 10 })} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('slides a 5-fret window on compact, following the focus cell', () => {
    view(prompt('ear-find:G@s5'), { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '4');
    expect(screen.getByRole('button', { name: 'Lower frets' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Higher frets' }));
    expect(screen.getByTestId('d15-window')).toHaveTextContent('Frets 4–8');
    fireEvent.click(screen.getByRole('button', { name: 'Higher frets' }));
    expect(screen.getByRole('button', { name: 'Higher frets' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Home' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(document.activeElement).toBe(cell(5, 0));
  });

  it('opens a worked example on the note, and widens to show a wrong tap', () => {
    const p = prompt('ear-find:G@s5');
    const { unmount } = view(p, { sizeClass: 'compact', guided: true });
    expect(neck()).toHaveAttribute('data-fret-from', '8');
    unmount();
    view(p, { sizeClass: 'compact', feedback: fb(p, { string: 5, fret: 2 }) });
    expect(neck()).toHaveAttribute('data-fret-from', '2');
    expect(neck()).toHaveAttribute('data-fret-to', '10');
  });

  it('resizes the compact window on rotation and mirrors a left-handed neck', () => {
    const p = prompt('ear-find:G@s5');
    const { rerender, props } = view(p, {
      sizeClass: 'compact',
      compactFrets: 10,
      handedness: 'left',
    });
    expect(screen.getByTestId('d15-window')).toHaveTextContent('Frets 0–9');
    rerender(<D15View {...props} compactFrets={5} />);
    expect(screen.getByTestId('d15-window')).toHaveTextContent('Frets 0–4');
    const buttons = screen.getAllByRole('button', { name: /frets$/ });
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Higher frets',
      'Lower frets',
    ]);
  });

  it('shows the 12-fret neck on iPad portrait', () => {
    view(prompt('ear-find:G@s5'), { sizeClass: 'regular' });
    expect(neck()).toHaveAttribute('data-fret-to', '12');
  });
});
