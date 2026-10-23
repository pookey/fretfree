import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import pentatonicBox from './drill';
import { ScalePositionPanel } from './ScalePanel';
import { ScaleView } from './ScaleView';
import { dpsCheck, dpsMakePrompt, type DpsAnswer, type DpsPrompt } from './scale';

// rng 0: the first natural key, C, at its lowest place (position 1 at frets 7–10).
const prompt = (id: string) =>
  dpsMakePrompt(
    { id, skillId: 'I7.positions' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

function view(
  p: DpsPrompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<DpsAnswer> | null;
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
  const utils = render(<ScaleView {...props} />);
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
const fb = (p: DpsPrompt, answer: DpsAnswer): DrillFeedback<DpsAnswer> => ({
  answer,
  result: dpsCheck(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });
const pos = (p: Position) => ({ string: p.string, fret: p.fret });

describe('<ScaleView> position', () => {
  it('draws the major box and asks for the rest of the position', () => {
    view(prompt('scale-position:1'));
    expect(screen.getByTestId('dpb-drill')).toHaveAttribute('data-mode', 'position');
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent(
      /^Fill in C major position 1 around this box$/,
    );
    expect(cells('root')).toEqual(['s6f8', 's4f10', 's1f8']);
    // The box's 3rds and 5ths in their shapes, as C7 draws them; the 2nds and 6ths dots.
    const thirds = markers('third');
    const fifths = markers('fifth');
    expect(thirds.length).toBeGreaterThan(0);
    expect(fifths.length).toBeGreaterThan(0);
    expect(thirds.length + fifths.length + markers('tone').length).toBe(9);
    expect(markers('target')).toEqual([]);
    expect(screen.getByTestId('dpb-count')).toHaveTextContent(/^Found 0$/);
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      'The squares are the roots, C; the dots are major box 1.',
    );
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '15');
  });

  it('hints at the 4ths and 7ths, and the total, from guide level 2 (rule 9)', () => {
    view(prompt('scale-position:1'), { guideLevel: 2 });
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent('(add the 4ths and 7ths)');
    expect(screen.getByTestId('dpb-count')).toHaveTextContent('Found 0 of 5');
  });

  it('marks each found note by degree, ignores the box, and answers at the last', () => {
    const p = prompt('scale-position:1');
    const { onAnswer } = view(p);
    tap(at(6, 8)); // a given box note is not an answer
    tap(at(5, 8));
    tap(at(5, 8)); // a second tap on a found note is ignored
    expect(onAnswer).not.toHaveBeenCalled();
    expect(markers('correct')).toEqual([{ string: 5, fret: 8, label: '4' }]);
    for (const t of p.targets) tap(t);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0]![0]).toHaveLength(5);
  });

  it('answers at the first wrong tap, and on Done', () => {
    const p = prompt('scale-position:1');
    const first = view(p);
    tap(at(6, 9));
    expect(first.onAnswer).toHaveBeenCalledWith([at(6, 9)]);
    first.unmount();

    const second = view(p);
    tap(at(5, 8));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(second.onAnswer).toHaveBeenCalledWith([at(5, 8)]);
  });

  it('copies the position in a worked example', () => {
    const p = prompt('scale-position:1');
    view(p, { guided: true });
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent(
      'This is C major position 1, around box 1 (the E shape). Tap the 5 ringed notes to continue.',
    );
    expect(ringed().map((m) => m.label)).toEqual(['7', '4', '7', '4', '7']);
    expect(markers('target')).toEqual([]);
    expect(screen.getByTestId('dpb-count')).toHaveTextContent('Found 0 of 5');
    // The hint names what to tap, not the box it's given.
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      'The squares are the roots, C. The ringed notes are the 4ths (F) and 7ths (B).',
    );
    expect(markers('fifth').map((m) => m.label)).toEqual(['5', '5']);
  });

  it('shows what was missed and the wrong tap in feedback, and ignores taps', () => {
    const p = prompt('scale-position:1');
    const { onAnswer } = view(p, { feedback: fb(p, [at(5, 8), at(6, 9)]) });
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      "You tapped string 6, fret 9: that note isn't in C major.",
    );
    expect(markers('wrong')).toEqual([{ string: 6, fret: 9, label: 'C♯' }]);
    expect(markers('ghost').map((m) => m.label)).toEqual(['7', '7', '4', '7']);
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    tap(at(6, 7));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('shows 12 frets on iPad portrait, and a window on compact', () => {
    const p = prompt('scale-position:1');
    const { unmount } = view(p, { sizeClass: 'regular' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    unmount();
    view(p, { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '6');
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    expect(screen.queryByTestId('dpb-explain')).not.toBeInTheDocument();
  });

  it('starts a new round for a new prompt', () => {
    const p = prompt('scale-position:1');
    const { rerender, props } = view(p);
    tap(at(5, 8));
    expect(markers('correct')).toHaveLength(1);
    rerender(<ScaleView {...props} prompt={prompt('scale-position:2')} />);
    expect(markers('correct')).toHaveLength(0);
  });
});

describe('<ScaleView> run', () => {
  it('draws only the roots and asks for the run from a degree', () => {
    view(prompt('scale-run:1@5'), { guideLevel: 2 });
    expect(screen.getByTestId('dpb-drill')).toHaveAttribute('data-mode', 'run');
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent(
      'Play C major position 1 up from the 5th (the E shape)',
    );
    expect(cells('root')).toEqual(['s6f8', 's4f10', 's1f8']);
    expect(markers('tone')).toEqual([]);
    expect(screen.getByTestId('dpb-count')).toHaveTextContent('Played 0 of 8');
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      'Start on the lowest 5th and go up to the highest.',
    );
  });

  it('takes the notes in order, a root among them, and answers on one out of order', () => {
    const p = prompt('scale-run:1@5');
    const first = view(p);
    for (const t of p.targets.slice(0, 4)) tap(t);
    // The root on string 4 was drawn, and is now played.
    expect(markers('correct').map((m) => m.label)).toEqual(['5', '6', '7', 'C']);
    expect(cells('root')).toEqual(['s6f8', 's1f8']);
    expect(first.onAnswer).not.toHaveBeenCalled();
    tap(p.targets[5]!);
    expect(first.onAnswer).toHaveBeenCalledWith([...p.targets.slice(0, 4), p.targets[5]!].map(pos));
    first.unmount();

    const second = view(p);
    for (const t of p.targets) tap(t);
    expect(second.onAnswer).toHaveBeenCalledTimes(1);
    expect(second.onAnswer.mock.calls[0]![0]).toEqual(p.targets.map(pos));
  });

  it('walks through a worked example, every note marked', () => {
    const p = prompt('scale-run:1@5');
    view(p, { guided: true });
    expect(screen.getByTestId('dpb-prompt')).toHaveTextContent(
      'This is C major position 1 from the 5th. Tap the 8 ringed notes in order to continue.',
    );
    // Each note named, the root a square and the 3rd and 5ths in their shapes, all ringed.
    expect(ringed().map((m) => m.label)).toEqual(['5', '6', '7', 'C', '2', '3', '4', '5']);
    expect(markers('target')).toEqual([]);
    expect(markers('fifth').map((m) => m.label)).toEqual(['5', '5']);
    expect(cells('root')).toEqual(['s6f8', 's4f10', 's1f8']);
    expect(screen.getByTestId('dpb-count')).toHaveTextContent('Played 0 of 8');
  });

  it('names a wrong start in feedback', () => {
    const p = prompt('scale-run:1@5');
    view(p, { feedback: fb(p, [at(5, 8)]) });
    expect(screen.getByTestId('dpb-explain')).toHaveTextContent(
      'You tapped string 5, fret 8, the lowest 4th.',
    );
    expect(markers('ghost')).toHaveLength(8);
  });
});

function panel(
  p: DpsPrompt,
  guideLevel: GuideLevel,
  over: { guided?: boolean; answered?: boolean } = {},
) {
  return render(
    <ScalePositionPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.answered ? { answer: [], result: dpsCheck(p, []) } : null}
    />,
  );
}

const current = () =>
  [...document.querySelectorAll('td[aria-current="true"]')].map((td) => td.textContent);

describe('<ScalePositionPanel>', () => {
  it('is what the plugin renders for an I7 card, loaded on first use', async () => {
    const Panel = pentatonicBox.contextPanel!;
    const View = pentatonicBox.render;
    const p = prompt('scale-position:3');
    const common = {
      prompt: p,
      guideLevel: 2,
      guided: false,
      handedness: 'right',
      tuning: STANDARD_TUNING,
      feedback: null,
    } as const;
    render(<Panel {...common} />);
    render(<View {...common} sizeClass="regular-wide" onAnswer={() => {}} />);
    // The first lazy load transforms every drill's views: seconds on a busy machine.
    const heading = await screen.findByRole(
      'heading',
      { name: 'C major positions' },
      { timeout: 30_000 },
    );
    expect(heading).toBeVisible();
    expect(await screen.findByTestId('dpb-drill')).toHaveAttribute('data-mode', 'position');
  }, 40_000);

  it('marks the asked position, and keeps the shapes back below guide level 2', () => {
    panel(prompt('scale-position:2'), 1);
    expect(current()).toEqual(['2']);
    expect(screen.queryByRole('rowheader', { name: 'Shape' })).not.toBeInTheDocument();
    expect(screen.queryByText(/4th and 7th added/)).not.toBeInTheDocument();
  });

  it('pairs each position with its shape once hinted, and explains at full guides', () => {
    const { unmount } = panel(prompt('scale-position:2'), 2);
    expect(current()).toEqual(['2', 'D']);
    unmount();
    panel(prompt('scale-position:2'), 0, { guided: true });
    expect(screen.getByText(/4th and 7th added/)).toBeVisible();
  });

  it('spells out a run only once answered (rule 4)', () => {
    const p = prompt('scale-run:1@5');
    const { unmount } = panel(p, 3);
    expect(screen.queryByTestId('dps-run')).not.toBeInTheDocument();
    unmount();
    panel(p, 1, { answered: true });
    expect(screen.getByTestId('dps-run')).toHaveTextContent('From the 5th: 5 6 7 R 2 3 4 5');
  });
});
