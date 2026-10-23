import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import { BoxView } from './BoxView';
import { dpbCheck, dpbDisplay, dpbMakePrompt, type DpbAnswer, type DpbPrompt } from './logic';

// rng 0: the first natural root, C, at its lowest position (box 1 at frets 8–11).
const prompt = (id: string) =>
  dpbMakePrompt(
    { id, skillId: 'C7.minor-boxes' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

function view(
  p: DpbPrompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<DpbAnswer> | null;
  } = {},
) {
  const onAnswer = vi.fn();
  const props = {
    prompt: p,
    guideLevel: over.guideLevel ?? 1,
    guided: over.guided ?? false,
    handedness: 'right',
    sizeClass: over.sizeClass ?? 'regular-wide',
    compactFrets: 5,
    tuning: STANDARD_TUNING,
    feedback: over.feedback ?? null,
    onAnswer,
  } as const;
  const utils = render(<BoxView {...props} />);
  return { ...utils, onAnswer, props };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard:/ });
const cell = (string: number, fret: number) =>
  neck().querySelector(`[data-cell="s${string}f${fret}"]`) as SVGElement;
const tap = (p: Position) => fireEvent.pointerDown(cell(p.string, p.fret));
const markersAt = (selector: string) =>
  [...neck().querySelectorAll(selector)].map((m) => ({
    string: Number(m.getAttribute('data-string')),
    fret: Number(m.getAttribute('data-fret')),
    label: m.textContent,
  }));
const markers = (style: string) => markersAt(`[data-testid="marker-${style}"]`);
/** A worked example's targets: the target ring, or a degree shape ringed on top. */
const ringed = () => markersAt('[data-testid="marker-target"], [data-emphasis="true"]');
const cells = (style: string) => markers(style).map((m) => `s${m.string}f${m.fret}`);
const fb = (p: DpbPrompt, answer: DpbAnswer): DrillFeedback<DpbAnswer> => ({
  answer,
  result: dpbCheck(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });
const pos = (p: Position) => ({ string: p.string, fret: p.fret });

describe('<BoxView> overlay', () => {
  it('draws the chord and asks for the box, without giving the box away', () => {
    view(prompt('penta-box:1@minor'));
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent(
      /^Build Cm pentatonic box 1 around this chord$/,
    );
    // The chord, by degree in shape as well as colour: roots square, ♭3 circle, 5ths triangles.
    expect(markers('root')).toEqual([
      { string: 6, fret: 8, label: 'C' },
      { string: 4, fret: 10, label: 'C' },
      { string: 1, fret: 8, label: 'C' },
    ]);
    expect(cells('third')).toEqual(['s3f8']);
    expect(cells('fifth')).toEqual(['s5f10', 's2f8']);
    // Guide level 1: no degree labels on the chord, no targets, no total.
    expect(markers('fifth').map((m) => m.label)).toEqual(['', '']);
    expect(markers('target')).toEqual([]);
    expect(screen.getByTestId('dpb-count')).toHaveTextContent(/^Found 0$/);
    // Every prompt says how the round ends and what Done does.
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      "The squares are the roots, C. Tap the notes in any order. A wrong tap ends the round; tap Done if you can't find the rest.",
    );
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '15');
  });

  it('names the shape and the total from guide level 2 (rule 9)', () => {
    view(prompt('penta-box:1@minor'), { guideLevel: 2 });
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent(
      'Build Cm pentatonic box 1 around this chord (the E shape)',
    );
    expect(screen.getByTestId('dpb-count')).toHaveTextContent('Found 0 of 6');
  });

  it('marks each found note with its degree, ignores the chord, and answers at the last', () => {
    const p = prompt('penta-box:1@minor');
    const { onAnswer } = view(p);
    tap(at(6, 8)); // a given chord note is not an answer
    tap(at(6, 11));
    tap(at(6, 11)); // a second tap on a found note is ignored
    expect(onAnswer).not.toHaveBeenCalled();
    expect(markers('correct')).toEqual([{ string: 6, fret: 11, label: '♭3' }]);
    expect(screen.getByTestId('dpb-count')).toHaveTextContent(/^Found 1$/);
    for (const t of p.targets.slice(1)) tap(t);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0]![0]).toEqual([at(6, 11), ...p.targets.slice(1).map(pos)]);
  });

  it('answers at the first wrong tap, and on Done', () => {
    const p = prompt('penta-box:1@minor');
    const first = view(p);
    tap(at(6, 9));
    expect(first.onAnswer).toHaveBeenCalledWith([at(6, 9)]);
    first.unmount();

    const second = view(p);
    tap(at(5, 8));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(second.onAnswer).toHaveBeenCalledWith([at(5, 8)]);
  });

  it('ignores taps once answered', () => {
    const p = prompt('penta-box:1@minor');
    const { onAnswer } = view(p, { feedback: fb(p, [at(6, 9)]) });
    tap(at(6, 11));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('copies the box in a worked example', () => {
    const p = prompt('penta-box:1@minor');
    view(p, { guided: true });
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent(
      'This is Cm pentatonic box 1, around the E shape. Tap the 6 ringed notes to continue.',
    );
    // A worked example gives one clear instruction: no Done clause (rule 8).
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      /^The squares are the roots, C\. Tap the notes in any order\. A wrong tap ends the round\.$/,
    );
    // Every target ringed and named: its degree, a root by letter, a chord tone in its shape.
    expect(ringed()).toEqual(
      p.targets.map((t) => ({ ...pos(t), label: t.degree === '1' ? 'C' : dpbDisplay(t.degree) })),
    );
    expect(screen.getByTestId('dpb-count')).toHaveTextContent('Found 0 of 6');
    // Full guides label the chord's degrees.
    expect(markers('fifth').map((m) => m.label)).toEqual(['5', '5']);
  });

  it('shows what was missed and the wrong tap in feedback', () => {
    const p = prompt('penta-box:1@minor');
    view(p, { feedback: fb(p, [at(6, 11), at(4, 13)]) });
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      'You tapped string 4, fret 13, in box 2. Box 1 wraps the E shape of Cm.',
    );
    expect(markers('wrong')).toEqual([{ string: 4, fret: 13, label: 'D♯' }]);
    expect(markers('correct')).toEqual([{ string: 6, fret: 11, label: '♭3' }]);
    expect(markers('ghost').map((m) => m.label)).toEqual(['4', '♭7', '4', '♭7', '♭3']);
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('shows 12 frets holding the box on iPad portrait, and a window on compact', () => {
    const p = prompt('penta-box:1@minor');
    const { unmount } = view(p, { sizeClass: 'regular' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    unmount();
    view(p, { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '7');
    expect(neck()).toHaveAttribute('data-fret-to', '13');
    // Compact keeps the height for the neck: no hint line before an answer.
    expect(screen.queryByTestId('dpb-explain')).not.toBeInTheDocument();
  });

  it('starts a new round for a new prompt', () => {
    const p = prompt('penta-box:1@minor');
    const { rerender, props } = view(p);
    tap(at(6, 11));
    expect(markers('correct')).toHaveLength(1);
    rerender(<BoxView {...props} prompt={prompt('penta-box:2@minor')} />);
    expect(markers('correct')).toHaveLength(0);
  });
});

describe('<BoxView> relative', () => {
  it('draws the whole box, unnamed, and asks for the relative root', () => {
    const p = prompt('penta-relative:1@minor');
    view(p, { guideLevel: 3 });
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent(
      "Tap every root of Cm's relative major in this box",
    );
    expect(cells('root')).toEqual(['s6f8', 's4f10', 's1f8']);
    expect(markers('tone')).toHaveLength(9);
    // Even at full guides the box's dots carry no names before an answer (rule 4).
    expect(markers('tone').every((m) => m.label === '')).toBe(true);
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      "The squares are the roots, C. The relative major is E♭. Tap the notes in any order. A wrong tap ends the round; tap Done if you can't find the rest.",
    );
    expect(screen.getByTestId('dpb-count')).toHaveTextContent('Found 0 of 3');
  });

  it('keeps the relative key out of the hint line below guide level 2', () => {
    view(prompt('penta-relative:1@minor'));
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      /^The squares are the roots, C\. Tap the notes in any order\. A wrong tap ends the round; tap Done if you can't find the rest\.$/,
    );
  });

  it('answers on a tap on the box’s own root', () => {
    const p = prompt('penta-relative:1@minor');
    const { onAnswer } = view(p);
    tap(at(6, 11));
    expect(markers('correct')).toEqual([{ string: 6, fret: 11, label: 'E♭' }]);
    tap(at(4, 10));
    expect(onAnswer).toHaveBeenCalledWith([at(6, 11), at(4, 10)]);
  });

  it('walks through a worked example', () => {
    const p = prompt('penta-relative:1@minor');
    view(p, { guided: true });
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent(
      "In this Cm box, the relative major's root is E♭. Tap the 3 ringed E♭ notes to continue.",
    );
    expect(markers('target')).toEqual([
      { string: 6, fret: 11, label: 'E♭' },
      { string: 3, fret: 8, label: 'E♭' },
      { string: 1, fret: 11, label: 'E♭' },
    ]);
    expect(screen.getByTestId('dpb-count')).toHaveTextContent('Found 0 of 3');
  });

  it('labels the box by degree in feedback, with the wrong tap in place of its dot', () => {
    const p = prompt('penta-relative:1@minor');
    view(p, { feedback: fb(p, [at(4, 10)]) });
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent("the box's own root");
    expect(markers('wrong')).toEqual([{ string: 4, fret: 10, label: 'C' }]);
    expect(cells('root')).toEqual(['s6f8', 's1f8']);
    expect(markers('ghost').map((m) => m.label)).toEqual(['E♭', 'E♭', 'E♭']);
    expect(markers('tone').map((m) => m.label)).toContain('♭7');
  });
});
