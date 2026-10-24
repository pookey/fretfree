import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel, Handedness } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { StaffNote } from '../../components/staff';
import { resolveView } from '../lazy-view';
import type { DrillFeedback } from '../types';
import { PositionContextPanel } from './ContextPanel';
import { D23View } from './D23View';
import staffToFret from './drill';
import { d23Check, d23MakePrompt, type D23Prompt } from './logic';

// The staff's engraving is <Staff>'s own concern (M8-02); here it is a stub
// that shows what it was given.
vi.mock('../../components/staff', () => ({
  Staff: ({
    notes,
    positionRange,
    revealPitches,
    label,
  }: {
    notes: StaffNote[];
    positionRange: readonly [number, number];
    revealPitches: boolean;
    label: string;
  }) => (
    <div
      data-testid="staff"
      role="group"
      aria-label={label}
      data-notes={notes.map((n) => `${(n.pitches ?? []).join('+')}:${n.style}`).join(' ')}
      data-range={positionRange.join(',')}
      data-reveal={String(revealPitches)}
    />
  ),
}));

const prompt = (id: string, scopeLevel = 0) =>
  d23MakePrompt(
    { id, skillId: 'R2.pos5' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

function view(
  p: D23Prompt,
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
  const utils = render(<D23View {...props} />);
  return { ...utils, onAnswer, props };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard: tap the note in/ });
const cell = (string: number, fret: number) =>
  document.querySelector(`[data-cell="s${string}f${fret}"]`) as SVGElement | null;
const staff = () => screen.getByTestId('staff');
const fb = (p: D23Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d23Check(p, answer),
});

describe('<D23View>', () => {
  it('shows one note on the staff above the whole neck, with the position', () => {
    const { onAnswer } = view(prompt('staff→fret:G3@pos5'));
    expect(screen.getByTestId('d23-position')).toHaveTextContent('5th position, frets 5–8');
    expect(screen.getByTestId('d23-prompt')).toHaveTextContent('Tap this note in 5th position');
    expect(staff()).toHaveAttribute('data-notes', 'G3:target');
    expect(staff()).toHaveAttribute('data-range', '-8,16');
    // The note's name is half the answer: the staff says where it sits, not what it is.
    expect(staff()).toHaveAttribute('data-reveal', 'false');
    const svg = document.querySelector('svg[data-fret-from]')!;
    expect(svg).toHaveAttribute('data-fret-from', '0');
    expect(svg).toHaveAttribute('data-fret-to', '15');
    fireEvent.pointerDown(cell(4, 5)!);
    expect(onAnswer).toHaveBeenCalledWith({ string: 4, fret: 5 });
  });

  it('dims the neck outside the position, and takes taps only inside it', () => {
    const { onAnswer } = view(prompt('staff→fret:G3@pos5'));
    // Frets 0–3 and 9–15 are dimmed; 4–8 (with the index stretch to 4) are not.
    expect(screen.getAllByTestId('dimmed-fret')).toHaveLength(11);
    fireEvent.pointerDown(cell(3, 0)!);
    fireEvent.pointerDown(cell(4, 10)!);
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.pointerDown(cell(3, 4)!);
    expect(onAnswer).toHaveBeenCalledWith({ string: 3, fret: 4 });
  });

  it('takes taps anywhere at the wider scope, still dimming outside the position', () => {
    const { onAnswer } = view(prompt('staff→fret:G3@pos5', 1));
    expect(screen.getAllByTestId('dimmed-fret')).toHaveLength(11);
    fireEvent.pointerDown(cell(3, 0)!);
    expect(onAnswer).toHaveBeenCalledWith({ string: 3, fret: 0 });
  });

  it('never marks the cell before an unguided answer, even at guide level 3', () => {
    for (const id of ['staff→fret:E2@open', 'staff→fret:G3@pos5', 'staff→fret:F5@pos9']) {
      const { container, unmount } = view(prompt(id), { guideLevel: 3 });
      const svg = container.querySelector('svg[data-fret-from]') as SVGElement;
      expect(svg.querySelectorAll('[data-testid^="marker-"]'), id).toHaveLength(0);
      unmount();
    }
  });

  it('is a worked example on the first rep: the note named and its cell marked', () => {
    const { onAnswer } = view(prompt('staff→fret:B3@pos5'), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d23-prompt')).toHaveTextContent(
      'B3 in 5th position is string 3, fret 4. Tap it to continue.',
    );
    expect(staff()).toHaveAttribute('data-reveal', 'true');
    const target = document.querySelector('[data-testid="marker-target"]');
    expect(target).toHaveAttribute('data-string', '3');
    expect(target).toHaveAttribute('data-fret', '4');
    expect(target).toHaveTextContent('B');
    fireEvent.pointerDown(cell(3, 4)!);
    expect(onAnswer).toHaveBeenCalledWith({ string: 3, fret: 4 });
  });

  it('shows the right cell, the finger and the note’s name on a correct answer', () => {
    const p = prompt('staff→fret:G3@pos5');
    view(p, { guideLevel: 0, feedback: fb(p, { string: 4, fret: 5 }) });
    expect(document.querySelector('[data-testid="marker-correct"]')).toHaveTextContent('G');
    expect(staff()).toHaveAttribute('data-notes', 'G3:correct');
    expect(staff()).toHaveAttribute('data-reveal', 'true');
    expect(screen.getByTestId('d23-explain')).toHaveTextContent(
      'G3 in 5th position is string 4, fret 5, the index finger.',
    );
  });

  it('shows both cells, and both notes on the staff, on a wrong answer', () => {
    const p = prompt('staff→fret:G3@pos5');
    view(p, { guideLevel: 0, feedback: fb(p, { string: 4, fret: 7 }) });
    expect(document.querySelector('[data-testid="marker-correct"]')).toHaveTextContent('G');
    expect(document.querySelector('[data-testid="marker-wrong"]')).toHaveTextContent('A');
    expect(staff()).toHaveAttribute('data-notes', 'G3:target A3:wrong');
    expect(screen.getByTestId('d23-explain')).toHaveTextContent(/A3, on the space just above/);
  });

  it('marks both of 9th position’s cells when the other stretch is tapped', () => {
    const p = prompt('staff→fret:F3@pos9');
    view(p, { guideLevel: 0, feedback: fb(p, { string: 6, fret: 13 }) });
    const correct = [...document.querySelectorAll('[data-testid="marker-correct"]')].map(
      (m) => `s${m.getAttribute('data-string')}f${m.getAttribute('data-fret')}`,
    );
    expect(correct.sort()).toEqual(['s5f8', 's6f13']);
    expect(document.querySelector('[data-testid="marker-wrong"]')).toBeNull();
    expect(screen.getByTestId('d23-explain')).toHaveTextContent(/String 6, fret 13 plays it too/);
  });

  it('resizes the compact window when the phone turns, mid-prompt', () => {
    const size = (w: number, h: number) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
    };
    const [w, h] = [window.innerWidth, window.innerHeight];
    try {
      size(390, 844);
      view(prompt('staff→fret:G3@pos7'), { sizeClass: 'compact', compactFrets: 9 });
      const frets = () => {
        const svg = document.querySelector('svg[data-fret-from]')!;
        return (
          Number(svg.getAttribute('data-fret-to')) - Number(svg.getAttribute('data-fret-from')) + 1
        );
      };
      expect(frets()).toBe(9);
      // On its side the staff takes a column, so the window narrows.
      act(() => {
        size(700, 390);
        window.dispatchEvent(new Event('resize'));
      });
      expect(frets()).toBeLessThan(9);
    } finally {
      size(w, h);
    }
  });

  it('answers from the keyboard, starting on the top string at the position’s first fret', () => {
    const { onAnswer } = view(prompt('staff→fret:G3@pos5'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1, 4));
    // The focus stays inside the position: left of fret 4 is out of it.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell(1, 4));
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight']) {
      fireEvent.keyDown(window, { key });
    }
    expect(document.activeElement).toBe(cell(4, 5));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith({ string: 4, fret: 5 });
  });

  it('ignores keys and taps once answered', () => {
    const p = prompt('staff→fret:G3@pos5');
    const { onAnswer } = view(p, { feedback: fb(p, { string: 4, fret: 5 }) });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.pointerDown(cell(4, 5)!);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('slides iPad portrait’s neck up the neck for 12th position', () => {
    view(prompt('staff→fret:G3@pos12'), { sizeClass: 'regular' });
    const svg = document.querySelector('svg[data-fret-from]')!;
    expect(svg).toHaveAttribute('data-fret-from', '3');
    expect(svg).toHaveAttribute('data-fret-to', '15');
  });

  it('opens a compact window on the position and slides it', () => {
    view(prompt('staff→fret:G3@pos7'), { sizeClass: 'compact', compactFrets: 5 });
    expect(screen.getByTestId('d23-window')).toHaveTextContent('Frets 7–11');
    fireEvent.click(screen.getByRole('button', { name: 'Lower frets' }));
    expect(screen.getByTestId('d23-window')).not.toHaveTextContent('Frets 7–11');
    fireEvent.click(screen.getByRole('button', { name: 'Higher frets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Higher frets' }));
    expect(screen.getByTestId('d23-window')).toHaveTextContent(/Frets \d+–\d+/);
  });

  it('widens the compact window for a miss, and mirrors the arrows for a left hand', () => {
    const p = prompt('staff→fret:G3@pos5', 1);
    const { unmount } = view(p, {
      sizeClass: 'compact',
      compactFrets: 5,
      feedback: fb(p, { string: 3, fret: 0 }),
    });
    expect(cell(3, 0)).not.toBeNull();
    expect(cell(4, 5)).not.toBeNull();
    unmount();
    view(p, { sizeClass: 'compact', compactFrets: 5, handedness: 'left' });
    expect(screen.getByRole('button', { name: 'Lower frets' })).toHaveTextContent('›');
  });

  it('keeps the neck’s accessible name to the position, not the note', () => {
    view(prompt('staff→fret:G3@open'));
    expect(neck()).toHaveAccessibleName('Fretboard: tap the note in open position');
  });
});

describe('<PositionContextPanel>', () => {
  const panel = (id: string) => {
    const p = prompt(id);
    return render(
      <PositionContextPanel
        prompt={p}
        guideLevel={2}
        guided={false}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    ).container;
  };

  it('is the D23 plugin’s context panel', async () => {
    expect(await resolveView(staffToFret.contextPanel!)).toBe(PositionContextPanel);
    expect(await resolveView(staffToFret.render)).toBe(D23View);
  });

  it('names the hand’s frets, never a note', () => {
    const pos5 = panel('staff→fret:G3@pos5');
    expect(pos5).toHaveTextContent('Reading in position');
    expect(pos5).toHaveTextContent(/index finger sits on fret 5.*little finger on fret 8/);
    expect(pos5).toHaveTextContent(/one-fret stretch/);
    expect(pos5).not.toHaveTextContent(/\b[A-G]\d\b/);
  });

  it('keeps open position to frets 0–3, with no stretch', () => {
    const open = panel('staff→fret:G3@open');
    expect(open).toHaveTextContent(/open strings and frets 1–3/);
    expect(open).not.toHaveTextContent(/stretch/);
  });
});
