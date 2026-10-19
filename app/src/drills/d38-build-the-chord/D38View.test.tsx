import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { buildChordItemId, type GuideLevel } from '../../engine/model';
import type { SizeClass } from '../../shell/size-class';
import { STANDARD_TUNING, type ChordKind, type Position } from '../../theory';
import { resolveView } from '../lazy-view';
import type { DrillFeedback } from '../types';
import { D38View } from './D38View';
import buildTheChord from './drill';
import { d38Check, d38PromptAt, type D38Answer, type D38Prompt } from './logic';

const prompt = (kind: ChordKind = 'm7', root = 'A', string = 5, fret = 0) =>
  d38PromptAt(
    buildChordItemId(kind, string),
    kind,
    root,
    { string, fret },
    'naturals',
    STANDARD_TUNING,
    'sharp',
  );

function view(
  p: D38Prompt,
  over: {
    guided?: boolean;
    guideLevel?: GuideLevel;
    sizeClass?: SizeClass;
    feedback?: DrillFeedback<D38Answer> | null;
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
  const utils = render(<D38View {...props} />);
  return { ...utils, onAnswer, props };
}

const neck = () => screen.getByRole('group', { name: /^Fretboard:/ });
const cell = (string: number, fret: number) =>
  neck().querySelector(`[data-cell="s${string}f${fret}"]`) as SVGElement;
const tap = (string: number, fret: number) => fireEvent.pointerDown(cell(string, fret));
const markers = (style: string) =>
  [...neck().querySelectorAll(`[data-testid="marker-${style}"]`)].map((m) => ({
    string: Number(m.getAttribute('data-string')),
    fret: Number(m.getAttribute('data-fret')),
    label: m.textContent,
  }));
const slots = () =>
  within(screen.getByRole('list', { name: 'Your voicing, low string first' }))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('aria-label'));
const fb = (p: D38Prompt, answer: D38Answer): DrillFeedback<D38Answer> => ({
  answer,
  result: d38Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });
const AM7: Position[] = [at(4, 2), at(3, 0), at(2, 1), at(1, 0)];

describe('<D38View>', () => {
  it('is the D38 plugin’s view, loaded on first use', async () => {
    expect(await resolveView(buildTheChord.render)).toBe(D38View);
  });

  it('asks for the chord from its root, giving nothing else away', () => {
    view(prompt());
    expect(screen.getByTestId('d38-prompt')).toHaveTextContent('Build Am7 from this root');
    expect(markers('root')).toEqual([{ string: 5, fret: 0, label: 'A' }]);
    expect(markers('target')).toEqual([]);
    expect(screen.getByTestId('d38-explain')).toHaveTextContent(
      'The square is the root, A, on string 5. Tap one note on each of strings 4–1; tap a note again to mute it.',
    );
    expect(slots()).toEqual([
      'String 6: muted',
      'String 5: fret 0, the root',
      'String 4: muted',
      'String 3: muted',
      'String 2: muted',
      'String 1: muted',
    ]);
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '15');
  });

  it('places one plain note per string, mutes on a second tap, and checks the voicing', () => {
    const p = prompt();
    const { onAnswer } = view(p, { guideLevel: 1 });
    tap(4, 2);
    tap(4, 3);
    expect(markers('tone')).toEqual([{ string: 4, fret: 3, label: '' }]);
    tap(4, 3);
    expect(markers('tone')).toEqual([]);
    expect(screen.getByTestId('d38-notice')).toHaveTextContent('String 4 muted.');
    for (const p2 of AM7) tap(p2.string, p2.fret);
    // No degrees before the check (rule 4).
    expect(markers('third')).toEqual([]);
    expect(slots()[2]).toBe('String 4: fret 2');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith(AM7);
  });

  it('names placed notes at guide level 3', () => {
    view(prompt(), { guideLevel: 3 });
    tap(2, 1);
    expect(markers('tone')).toEqual([{ string: 2, fret: 1, label: 'C' }]);
  });

  it('keeps the strings below the root muted, and says why', () => {
    view(prompt());
    tap(6, 3);
    expect(markers('tone')).toEqual([]);
    expect(screen.getByTestId('d38-notice')).toHaveTextContent(
      'String 6 stays muted: the root is the lowest note.',
    );
    tap(5, 3);
    expect(screen.getByTestId('d38-notice')).toHaveTextContent('String 5 plays the root, A.');
    expect(markers('tone')).toEqual([]);
  });

  it('marks a note below the root as wrong in feedback', () => {
    const p = prompt('7', 'B', 6, 7);
    const answer = [at(5, 0), at(4, 7), at(3, 8)];
    view(p, { feedback: fb(p, answer) });
    expect(markers('wrong')).toEqual([{ string: 5, fret: 0, label: '♭7' }]);
    expect(slots()[1]).toBe('String 5: fret 0, flat 7th, below the root');
    expect(screen.getByTestId('d38-explain')).toHaveTextContent(
      'Open A on string 5 is below the root: the root must be the lowest note.',
    );
  });

  it('clears the voicing', () => {
    view(prompt());
    tap(3, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(markers('tone')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('shows a worked example by degree to copy (rule 8)', () => {
    view(prompt(), { guided: true, guideLevel: 0 });
    expect(screen.getByTestId('d38-prompt')).toHaveTextContent(
      'This is one voicing of Am7 from this root. Tap its notes, then Check.',
    );
    expect(markers('target')).toEqual([
      { string: 4, fret: 2, label: '5' },
      { string: 3, fret: 0, label: '♭7' },
      { string: 2, fret: 1, label: '♭3' },
      { string: 1, fret: 0, label: '5' },
    ]);
    tap(4, 2);
    expect(markers('target')).toHaveLength(3);
  });

  it('draws a right voicing by degree, in shape and colour', () => {
    const p = prompt();
    view(p, { feedback: fb(p, AM7) });
    expect(markers('fifth')).toHaveLength(2);
    expect(markers('seventh')).toEqual([{ string: 3, fret: 0, label: '♭7' }]);
    expect(markers('third')).toEqual([{ string: 2, fret: 1, label: '♭3' }]);
    expect(screen.getByTestId('d38-explain')).toHaveTextContent(
      "Yes: that's Am7, R 5 ♭7 ♭3 5 from string 5 (x 0 2 0 1 0).",
    );
    expect(slots()[4]).toBe('String 2: fret 1, flat 3rd');
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
  });

  it('marks notes the chord lacks, rings a voicing that works, and names what is missing', () => {
    const p = prompt();
    const answer = [at(4, 2), at(3, 0), at(2, 0), at(1, 0)];
    view(p, { feedback: fb(p, answer) });
    expect(markers('wrong')).toEqual([{ string: 2, fret: 0, label: '2' }]);
    expect(markers('ghost')).toEqual([{ string: 2, fret: 1, label: '♭3' }]);
    const explain = screen.getByTestId('d38-explain');
    expect(explain).toHaveTextContent('Missing the ♭3rd (C).');
    expect(explain).toHaveTextContent('B on string 2 is the 2nd: not in Am7.');
    expect(explain).toHaveTextContent('One that works: x 0 2 0 1 0.');
    expect(slots()[4]).toBe('String 2: fret 0, 2nd, not in the chord');
  });

  it('follows the root on iPad portrait and compact, without the hint on compact', () => {
    const p = prompt('major', 'C', 5, 3);
    const { unmount } = view(p, { sizeClass: 'regular' });
    expect(neck()).toHaveAttribute('data-fret-to', '12');
    unmount();
    view(p, { sizeClass: 'compact' });
    expect(neck()).toHaveAttribute('data-fret-from', '0');
    expect(neck()).toHaveAttribute('data-fret-to', '6');
    expect(screen.queryByTestId('d38-explain')).toBeNull();
  });

  it('starts a new voicing with a new prompt', () => {
    const { rerender, props } = view(prompt());
    tap(3, 0);
    rerender(<D38View {...props} prompt={prompt('minor', 'A', 5, 0)} />);
    expect(markers('tone')).toEqual([]);
  });
});
