import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { GuideLevel, Handedness } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D6View } from './D6View';
import { D6_ID, d6Check, d6MakePrompt, type D6Prompt } from './logic';
import { resolveView } from '../lazy-view';

/** Root on fret 5 for shapes valid on frets 1–12. */
const prompt = (id: string, scopeLevel = 0) =>
  d6MakePrompt(
    { id, skillId: 'C3.thirds' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => 4.5 / 12 },
  );

function view(
  p: D6Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    handedness?: Handedness;
    feedback?: DrillFeedback<Position> | null;
    aside?: boolean;
  } = {},
) {
  const onAnswer = vi.fn();
  const utils = render(
    <D6View
      prompt={p}
      guideLevel={over.guideLevel ?? 3}
      guided={over.guided ?? false}
      handedness={over.handedness ?? 'right'}
      sizeClass={over.sizeClass ?? 'regular-wide'}
      tuning={STANDARD_TUNING}
      feedback={over.feedback ?? null}
      onAnswer={onAnswer}
      aside={over.aside ? <aside data-testid="context-panel" /> : undefined}
    />,
  );
  return { ...utils, onAnswer };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard: root on string/ });
const cell = (string: number, fret: number) =>
  neck().querySelector(`[data-cell="s${string}f${fret}"]`) as SVGElement;
const fb = (p: D6Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d6Check(p, answer),
});
const markers = (style: string) =>
  within(neck())
    .queryAllByTestId(`marker-${style}`)
    .map((m) => ({
      string: Number(m.getAttribute('data-string')),
      fret: Number(m.getAttribute('data-fret')),
      text: m.textContent,
    }));

describe('<D6View>', () => {
  it('is registered as the interval-tap drill for every C3 group', async () => {
    const drill = getDrill(D6_ID);
    expect(await resolveView(drill!.render)).toBe(D6View);
    expect(drill?.skills).toContain('C3.thirds');
    expect(drill?.skills).toContain('C3.sevenths');
  });

  it('asks for the interval above the root and answers with the tapped cell', () => {
    const p = prompt('interval:M3@s6→s5');
    const { onAnswer } = view(p);
    expect(screen.getByTestId('d6-prompt')).toHaveTextContent(
      'Tap the major 3rd above the root on string 5',
    );
    expect(screen.getByTestId('d6-explain')).toHaveTextContent('Tap the fret on string 5.');
    expect(markers('root')).toEqual([{ string: 6, fret: 5, text: 'R' }]);
    fireEvent.pointerDown(cell(5, 4));
    expect(onAnswer).toHaveBeenCalledWith({ string: 5, fret: 4 });
  });

  it('answers from the keyboard: a focused cell takes Enter', () => {
    const { onAnswer } = view(prompt('interval:M3@s6→s5'));
    fireEvent.keyDown(cell(5, 4), { key: 'Enter' });
    expect(onAnswer).toHaveBeenCalledWith({ string: 5, fret: 4 });
  });

  it('dims everything but the shape string and the hand position at the shape scope', () => {
    const { container, onAnswer } = view(prompt('interval:M3@s6→s5'));
    expect(container.querySelector('[data-live-string="5"]')).not.toBeNull();
    // The root's own cell is kept clear of the dimming on its string.
    expect(container.querySelector('style')?.textContent).toContain('rect[data-cell="s6f5"]');
    // Frets 3–7 are live out of 0–15.
    expect(screen.getAllByTestId('dimmed-fret')).toHaveLength(11);
    fireEvent.pointerDown(cell(4, 4));
    fireEvent.pointerDown(cell(5, 9));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('opens every string, then the whole region, as the scope widens', () => {
    const box = view(prompt('interval:M3@s6→s5', 1));
    expect(box.container.querySelector('[data-live-string]')).toBeNull();
    expect(box.container.querySelector('style')).toBeNull();
    expect(screen.getByTestId('d6-prompt')).toHaveTextContent(
      'Tap a major 3rd from the root, on any string',
    );
    fireEvent.pointerDown(cell(3, 6));
    expect(box.onAnswer).toHaveBeenCalledWith({ string: 3, fret: 6 });
    box.unmount();

    const wide = view(prompt('interval:M3@s6→s5', 2));
    expect(screen.getAllByTestId('dimmed-fret')).toHaveLength(3);
    expect(screen.getByTestId('d6-explain')).toHaveTextContent('frets 0–12');
    fireEvent.pointerDown(cell(2, 2));
    expect(wide.onAnswer).toHaveBeenCalledWith({ string: 2, fret: 2 });
  });

  it('never marks the answer before an unguided answer, even at guide level 3', () => {
    view(prompt('interval:M3@s3→s2', 1), { guideLevel: 3 });
    expect(markers('target')).toEqual([]);
    expect(markers('correct')).toEqual([]);
    const labels = [...neck().querySelectorAll('[data-cell]')].map((c) =>
      c.getAttribute('aria-label'),
    );
    for (const l of labels) expect(l).toMatch(/^string \d, fret \d+$/);
  });

  it('shows where the shape lands in the guided worked example, G–B shift included', () => {
    view(prompt('interval:M3@s3→s2'), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d6-prompt')).toHaveTextContent(
      'This is the major 3rd above the root: string 2, the same fret. ' +
        'Crossing the G and B strings, a shape moves up 1 fret. Tap it to continue.',
    );
    expect(markers('target')).toEqual([{ string: 2, fret: 5, text: '3' }]);
    expect(neck()).toHaveAttribute('data-guide-level', '3');
  });

  it('marks every right cell by degree, and a wrong tap by its own degree', () => {
    const p = prompt('interval:M3@s6→s5', 1);
    const wrong = { string: 5, fret: 5 };
    const { onAnswer } = view(p, { feedback: fb(p, wrong) });
    expect(markers('correct')).toEqual([
      { string: 3, fret: 6, text: '3' },
      { string: 5, fret: 4, text: '3' },
    ]);
    expect(markers('wrong')).toEqual([{ ...wrong, text: '4' }]);
    expect(screen.getByTestId('d6-explain')).toHaveTextContent(
      'You tapped the 4 (perfect 4th). The major 3rd shape: string 5, 1 fret toward the nut.',
    );
    // Taps do nothing once answered.
    fireEvent.pointerDown(cell(5, 4));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('labels flat degrees with ♭', () => {
    const p = prompt('interval:m7@s6→s4');
    // A minor 3rd above the root: string 5 is a 4th up, so 2 frets back.
    const m3 = { string: 5, fret: p.root.fret - 2 };
    view(p, { feedback: fb(p, m3) });
    expect(markers('correct')).toContainEqual({ ...p.shapeTarget, text: '♭7' });
    expect(markers('wrong')).toEqual([{ ...m3, text: '♭3' }]);
    expect(screen.getByTestId('d6-explain')).toHaveTextContent('You tapped the ♭3 (minor 3rd).');
    // Screen readers hear the degree in words, not the glyph.
    expect(screen.getByRole('img', { name: 'flat 3' })).toBe(screen.getByTestId('marker-wrong'));
    expect(screen.getAllByRole('img', { name: 'flat 7' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'root' })).toBe(screen.getByTestId('marker-root'));
  });

  it('names a forgotten G–B shift', () => {
    const p = prompt('interval:M3@s3→s2');
    view(p, { feedback: fb(p, { string: 2, fret: 4 }) });
    expect(screen.getByTestId('d6-explain')).toHaveTextContent(
      "That's the shape without the G–B shift.",
    );
    expect(markers('correct')).toEqual([{ string: 2, fret: 5, text: '3' }]);
  });

  it('shows the whole neck on regular-wide, 12 frets on regular and the hand position on compact', () => {
    const p = prompt('interval:M3@s6→s5');
    const range = () => [
      neck().getAttribute('data-fret-from'),
      neck().getAttribute('data-fret-to'),
    ];
    const { rerender } = view(p, { sizeClass: 'regular-wide' });
    expect(range()).toEqual(['0', '15']);
    const props = {
      prompt: p,
      guideLevel: 3 as const,
      guided: false,
      handedness: 'right' as const,
      tuning: STANDARD_TUNING,
      feedback: null,
      onAnswer: () => {},
    };
    rerender(<D6View {...props} sizeClass="regular" />);
    expect(range()).toEqual(['0', '12']);
    rerender(<D6View {...props} sizeClass="compact" />);
    expect(range()).toEqual(['3', '7']);
  });

  it('places the panel beside the prompt on iPad landscape, and not at all on compact', () => {
    const { unmount } = view(prompt('interval:M3@s6→s5'), { aside: true });
    const panel = screen.getByTestId('context-panel');
    expect(neck().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    unmount();
    view(prompt('interval:M3@s6→s5'), { aside: true, sizeClass: 'compact' });
    expect(screen.queryByTestId('context-panel')).toBeNull();
  });

  it('places the panel below the neck in portrait and omits it without an aside', () => {
    const { container, unmount } = view(prompt('interval:M3@s6→s5'), {
      aside: true,
      sizeClass: 'regular',
    });
    const drill = container.firstElementChild as HTMLElement;
    expect(drill.lastElementChild).toBe(screen.getByTestId('context-panel'));
    unmount();
    view(prompt('interval:M3@s6→s5'));
    expect(screen.queryByTestId('context-panel')).toBeNull();
  });
});
