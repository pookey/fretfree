import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel, Handedness } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import { resolveView } from '../lazy-view';
import type { DrillFeedback } from '../types';
import { TabContextPanel } from './ContextPanel';
import { D33View } from './D33View';
import tabToNeck from './drill';
import { d33Check, d33MakePrompt, type D33Prompt } from './logic';

const prompt = (id: string, scopeLevel = 0) =>
  d33MakePrompt(
    { id, skillId: 'TAB.string3' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

function view(
  p: D33Prompt,
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
    guideLevel: over.guideLevel ?? 3,
    guided: over.guided ?? false,
    handedness: over.handedness ?? 'right',
    sizeClass: over.sizeClass ?? 'regular-wide',
    compactFrets: over.compactFrets,
    tuning: STANDARD_TUNING,
    feedback: over.feedback ?? null,
    onAnswer,
  } as const;
  const utils = render(<D33View {...props} />);
  return { ...utils, onAnswer, props };
}

const neck = () => screen.getByRole('group', { name: 'Fretboard: tap the note the tab shows' });
const cell = (string: number, fret: number) =>
  neck().querySelector(`[data-cell="s${string}f${fret}"]`) as SVGElement;
const staff = () => screen.getByTestId('d33-staff');
const fb = (p: D33Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d33Check(p, answer),
});

describe('<D33View>', () => {
  it('shows one tab note and answers with the tapped cell', () => {
    const { onAnswer } = view(prompt('tab@s3f5'));
    expect(screen.getByTestId('d33-prompt')).toHaveTextContent('Tap this note on the neck');
    const notes = staff().querySelectorAll('[data-testid="tab-note"]');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveAttribute('data-string', '3');
    expect(notes[0]).toHaveTextContent('5');
    expect(notes[0]).toHaveAttribute('data-style', 'current');
    fireEvent.pointerDown(cell(2, 5));
    expect(onAnswer).toHaveBeenCalledWith({ string: 2, fret: 5 });
  });

  it('keeps every string live, and ignores frets past the live range', () => {
    const { onAnswer } = view(prompt('tab@s3f5'));
    expect(screen.getAllByTestId('dimmed-fret')).toHaveLength(3);
    fireEvent.pointerDown(cell(3, 14));
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.pointerDown(cell(6, 12));
    expect(onAnswer).toHaveBeenCalledWith({ string: 6, fret: 12 });
  });

  it('never marks the queried cell before an unguided answer, even at guide level 3', () => {
    for (const id of ['tab@s1f0', 'tab@s3f5', 'tab@s6f12']) {
      const { container, unmount } = view(prompt(id), { guideLevel: 3 });
      const svg = container.querySelector('svg[data-fret-from]') as SVGElement;
      expect(svg.querySelectorAll('[data-testid^="marker-"]'), id).toHaveLength(0);
      expect(container.querySelectorAll('[data-mark]'), id).toHaveLength(0);
      unmount();
    }
  });

  it('is a worked example on the first rep: the cell marked, the line highlighted and named', () => {
    const { onAnswer } = view(prompt('tab@s3f5'), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d33-prompt')).toHaveTextContent(
      'This note is on string 3, fret 5. Tap it to continue.',
    );
    const target = neck().querySelector('[data-testid="marker-target"]');
    expect(target).not.toBeNull();
    expect(target).toHaveTextContent('C');
    expect(staff().querySelector('[data-mark="selected"]')).toHaveAttribute('data-string', '3');
    expect(staff().querySelector('svg')).toHaveAttribute('data-guide-level', '3');
    fireEvent.pointerDown(cell(3, 5));
    expect(onAnswer).toHaveBeenCalledWith({ string: 3, fret: 5 });
  });

  it('fades the staff’s line names with the guide level', () => {
    const names = (level: GuideLevel) => {
      const { unmount } = view(prompt('tab@s3f5'), { guideLevel: level });
      const shown = [...staff().querySelectorAll('[data-testid="tab-line-name"]')].map((n) =>
        n.getAttribute('data-string'),
      );
      unmount();
      return shown;
    };
    expect(names(3)).toHaveLength(6);
    expect(names(1)).toEqual(['1', '6']);
    expect(names(0)).toEqual([]);
  });

  it('labels the staff by the line’s place, not its string, once the numbers fade', () => {
    view(prompt('tab@s3f5'), { guideLevel: 0 });
    expect(screen.getByRole('img', { name: /^Tab, 6 lines/ })).toHaveAccessibleName(
      'Tab, 6 lines: one note on the 3rd line from the top, at fret 5',
    );
    // The staff's own per-note label ("string 3, fret 5") is hidden from screen readers.
    expect(staff().firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the right cell and flashes its line on a correct answer', () => {
    const p = prompt('tab@s3f5');
    view(p, { guideLevel: 0, feedback: fb(p, { string: 3, fret: 5 }) });
    expect(neck().querySelector('[data-testid="marker-correct"]')).toHaveTextContent('C');
    expect(staff().querySelector('[data-testid="tab-note"]')).toHaveAttribute(
      'data-style',
      'correct',
    );
    expect(staff().querySelector('[data-mark="correct"]')).toHaveAttribute('data-string', '3');
    expect(screen.getByTestId('d33-explain')).toHaveTextContent(
      'The 3rd line from the top is string 3 (G): fret 5 there is C.',
    );
  });

  it('shows both cells and dashes the misread line on a wrong answer', () => {
    const p = prompt('tab@s1f3');
    view(p, { guideLevel: 0, feedback: fb(p, { string: 6, fret: 3 }) });
    expect(neck().querySelector('[data-testid="marker-correct"]')).toHaveTextContent('G');
    expect(neck().querySelector('[data-testid="marker-wrong"]')).toHaveTextContent('G');
    expect(staff().querySelector('[data-mark="wrong"]')).toHaveAttribute('data-string', '6');
    expect(screen.getByTestId('d33-explain')).toHaveTextContent(/reads the tab upside down/);
    // Feedback names every line, so the answer is seen with its string.
    expect(staff().querySelector('svg')).toHaveAttribute('data-guide-level', '3');
  });

  it('answers from the keyboard, starting on the top string whatever the note', () => {
    const { onAnswer } = view(prompt('tab@s4f2'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1, 0));
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight']) {
      fireEvent.keyDown(window, { key });
    }
    expect(document.activeElement).toBe(cell(4, 2));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith({ string: 4, fret: 2 });
  });

  it('ignores keys it does not handle, and stops once answered', () => {
    const p = prompt('tab@s4f2');
    const { onAnswer } = view(p, { feedback: fb(p, { string: 4, fret: 2 }) });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.pointerDown(cell(4, 2));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('opens a compact window at the nut and slides it', () => {
    view(prompt('tab@s3f9'), { sizeClass: 'compact', compactFrets: 5 });
    expect(screen.getByTestId('d33-window')).toHaveTextContent('Frets 0–4');
    expect(screen.getByRole('button', { name: 'Lower frets' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Higher frets' }));
    expect(screen.getByTestId('d33-window')).toHaveTextContent('Frets 4–8');
  });

  it('opens the compact worked example on the target, and widens for a miss', () => {
    const p = prompt('tab@s3f9');
    const { unmount } = view(p, { sizeClass: 'compact', compactFrets: 5, guided: true });
    expect(cell(3, 9)).not.toBeNull();
    unmount();
    view(p, { sizeClass: 'compact', compactFrets: 5, feedback: fb(p, { string: 3, fret: 1 }) });
    expect(cell(3, 1)).not.toBeNull();
    expect(cell(3, 9)).not.toBeNull();
  });

  it('mirrors the slide arrows for a left-handed neck', () => {
    view(prompt('tab@s3f9'), { sizeClass: 'compact', compactFrets: 5, handedness: 'left' });
    expect(screen.getByRole('button', { name: 'Lower frets' })).toHaveTextContent('›');
  });
});

describe('<TabContextPanel>', () => {
  it('is the D33 plugin’s context panel, naming only the top line', async () => {
    expect(await resolveView(tabToNeck.contextPanel!)).toBe(TabContextPanel);
    const { container } = render(<TabContextPanel />);
    expect(container).toHaveTextContent('Reading tab');
    expect(container).toHaveTextContent(/top line is the high e/);
    expect(container).not.toHaveTextContent(/\bG\b|\bD\b|\bA\b|\bB\b/);
  });
});
