import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { playNotes } from '../../audio/audio';
import { DEFAULT_SETTINGS, ENGINE_CONFIG, getSkill } from '../../engine';
import { midiAt } from '../../theory';
import example, { rootFirstStep } from './c5-root-first';
import { exampleFor } from './index';
import { SHAPE_GROUP, exampleMarkers, exampleSounds, stepRange, type ExampleState } from './logic';
import { WorkedExample } from './WorkedExample';

vi.mock('../../audio/audio', () => ({ playNotes: vi.fn(() => Promise.resolve()) }));

beforeEach(() => {
  vi.mocked(playNotes).mockClear();
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

const at = (step: number, tapped: ExampleState['tapped'] = null): ExampleState => ({
  step,
  tapped,
  nudge: false,
});

describe('rootFirstStep', () => {
  it('reads a major chord from its root and 3rd, trapping the bass taken for the root', () => {
    // E-shape core of A major on strings 3–1: C# (3rd) in the bass, then E, then A.
    const step = rootFirstStep('E', 'A', 'major', { showRoot: true });
    expect(step.prompt).toBe(
      'Find the root, then tap its 3rd. Its distance from the root decides major or minor.',
    );
    expect(step.given).toEqual([{ string: 1, fret: 5 }]);
    expect(step.answer).toEqual({ string: 3, fret: 6 });
    expect(step.shape?.map((n) => n.degree)).toEqual(['3', '5', 'R']);
    expect(step.explain).toBe(
      'Root first: A on string 1, fret 5. Its 3rd is C#, on string 3: A to C# is four half steps, a major 3rd, so the chord is A major.',
    );
    expect(step.hint).toBe(
      'Root first: in the E shape it’s on string 1. Then count up to the 3rd: four half steps is major, three is minor.',
    );
    expect(step.trap).toEqual({
      at: { string: 2, fret: 5 },
      name: 'E',
      message:
        "That's E, the 5th. It's a 3rd above the lowest note, C#, but the lowest note isn't always the root. Find the root first: here it's A, on string 1.",
    });
  });

  it('reads a minor chord from its ♭3, spelt from the chord', () => {
    const step = rootFirstStep('E', 'B', 'minor');
    expect(step.given).toEqual([]);
    expect(step.explain).toMatch(
      /B to D is three half steps, a minor 3rd, so the chord is B minor/,
    );
    expect(step.trap?.name).toBe('F#');
  });

  it('has no bass trap when the root is in the bass or nothing sits a 3rd above it', () => {
    // A shape: root position. C shape: 2nd inversion, the 5th in the bass.
    expect(rootFirstStep('A', 'C', 'major').trap).toBeUndefined();
    expect(rootFirstStep('C', 'D', 'major').trap).toBeUndefined();
  });
});

describe('c5-root-first', () => {
  it('is the example for the triad skills, not for sus and add chords', () => {
    expect(exampleFor(getSkill('C5.tones-roots')!)?.id).toBe('c5-root-first');
    expect(exampleFor(getSkill('C5.tones-thirds')!)?.id).toBe('c5-root-first');
    expect(exampleFor(getSkill('C5.tones-fifths')!)?.id).toBe('c5-root-first');
    expect(exampleFor(getSkill('C5.triads')!)?.id).toBe('c5-root-first');
    expect(exampleFor(getSkill('C5.sus-add')!)).toBeUndefined();
  });

  it('shows the root when worked, then leaves it to be found, in one window', () => {
    expect(example.steps.map((s) => s.given.length)).toEqual([1, 0, 0]);
    const windows = example.steps.map((s) => stepRange(s, example.range));
    expect(new Set(windows.map((w) => `${w.from}-${w.to}`)).size).toBe(1);
    // No wider than an unpinned window, so the whole shape is in view on iPad.
    expect(windows[0]!.to - windows[0]!.from + 1).toBeLessThanOrEqual(
      ENGINE_CONFIG.workedExamples.span,
    );
    for (const step of example.steps) {
      for (const n of step.shape!) {
        expect(n.fret).toBeGreaterThanOrEqual(windows[0]!.from);
        expect(n.fret).toBeLessThanOrEqual(windows[0]!.to);
      }
      // The 3rd counts up from the root by pitch class, whichever string is lower.
      const root = step.shape!.find((n) => n.degree === 'R')!;
      const up = (((midiAt(step.answer) - midiAt(root)) % 12) + 12) % 12;
      expect([3, 4]).toContain(up);
    }
    // Major and minor both appear, so the learner can't guess the quality.
    expect(example.steps.map((s) => /major/.test(s.explain))).toEqual([true, false, true]);
    // The faded stage reads another inversion than the worked one (rule 12).
    expect(example.steps.map((s) => s.shape![0]!.degree)).toEqual(['3', 'R', '3']);
  });

  it('keeps the shape plain until the answer, then labels it by degree', () => {
    const before = exampleMarkers(example, at(1));
    expect(before.map((m) => m.style)).toEqual(['tone', 'tone', 'tone']);
    expect(before.every((m) => m.group === SHAPE_GROUP && !m.forceLabel)).toBe(true);

    const answer = example.steps[1].answer;
    const after = exampleMarkers(example, at(1, answer));
    expect(after.find((m) => m.style === 'correct')).toMatchObject({
      ...answer,
      group: SHAPE_GROUP,
    });
    expect(
      after.filter((m) => m.style !== 'correct').map((m) => [m.style, m.label, m.group]),
    ).toEqual([
      ['root', 'R', SHAPE_GROUP],
      ['fifth', '5', SHAPE_GROUP],
    ]);

    // A tap on the trap marks it wrong, not as a shape note.
    const trap = example.steps[2].trap!.at;
    const wrong = exampleMarkers(example, at(2, trap));
    expect(wrong.filter((m) => m.string === trap.string && m.fret === trap.fret)).toEqual([
      expect.objectContaining({ style: 'wrong' }),
    ]);
  });

  it('sounds the whole chord, low to high', () => {
    const sounds = exampleSounds(example.steps[0]);
    expect(sounds).toEqual(['C#4', 'E4', 'A4']);
    const step = example.steps[2];
    const midis = step.shape!.map((n) => midiAt(n)).sort((a, b) => a - b);
    expect(exampleSounds(step)).toHaveLength(midis.length);
  });
});

describe('<WorkedExample> with c5-root-first', () => {
  const neck = () => screen.getByRole('group', { name: 'Worked example neck' });
  const tap = (string: number, fret: number) =>
    fireEvent.pointerDown(
      within(neck()).getByRole('button', { name: `string ${string}, fret ${fret}` }),
    );
  const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  it('works from the root, then leaves the root to find', () => {
    render(<WorkedExample example={example} />);
    // Worked: the root squared, the 3rd highlighted, the bass misread as a ghost.
    expect(screen.getByTestId('marker-root')).toHaveAttribute('data-fret', '5');
    expect(screen.getByTestId('marker-target')).toHaveAttribute('data-string', '3');
    expect(screen.getByTestId('marker-ghost')).toHaveAttribute('data-string', '2');
    expect(screen.getAllByTestId('shape-outline')).toHaveLength(1);
    tap(3, 6);
    expect(playNotes).toHaveBeenCalledWith(['C#4', 'E4', 'A4'], { muted: false, volume: 0.8 });
    next();

    // Faded: another shape and inversion, outlined, with no root square to give it away.
    expect(screen.getByTestId('example-hint')).toHaveTextContent('in the A shape it’s on string 3');
    expect(screen.queryByTestId('marker-root')).toBeNull();
    expect(screen.getAllByTestId('marker-tone')).toHaveLength(3);
    tap(2, 6);
    expect(screen.getByTestId('example-correct')).toHaveTextContent('so the chord is D minor');
    expect(screen.getByTestId('marker-root')).toHaveTextContent('R');
    next();

    // Independent: no guides beyond the inlays. Taking the bass B for the
    // root lands on the 5th: the callout says why.
    expect(neck()).toHaveAttribute('data-guide-level', '1');
    expect(screen.queryAllByTestId('shape-outline')).toHaveLength(0);
    tap(2, 3);
    expect(screen.getByTestId('example-trap')).toHaveTextContent(
      "the lowest note isn't always the root",
    );
    expect(screen.getByTestId('example-wrong')).toHaveTextContent('so the chord is G major');
    expect(screen.getByTestId('example-done')).toBeInTheDocument();
  });
});
