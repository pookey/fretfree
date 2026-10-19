import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GuideLevel, Handedness } from '../../engine/model';
import { DROP_D_TUNING, STANDARD_TUNING, type Position, type Tuning } from '../../theory';
import type { DrillFeedback } from '../types';
import octaveFinder from './drill';
import {
  OctaveContextPanel,
  frets,
  octaveShapes,
  shapeLabel,
  shapeOfPrompt,
  shapeTitle,
} from './ContextPanel';
import { d4Check, d4MakePrompt, type D4Answer, type D4Prompt } from './logic';
import { resolveView } from '../lazy-view';

const prompt = (id: string, tuning: Tuning = STANDARD_TUNING) =>
  d4MakePrompt(
    { id, skillId: 'C1.octaves' },
    { tuning, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

const fb = (p: D4Prompt, answer: D4Answer): DrillFeedback<D4Answer> => ({
  answer,
  result: d4Check(p, answer),
});

function panel(
  p: D4Prompt,
  over: {
    guideLevel?: GuideLevel;
    guided?: boolean;
    handedness?: Handedness;
    feedback?: DrillFeedback<D4Answer> | null;
  } = {},
) {
  return render(
    <OctaveContextPanel
      prompt={p}
      guideLevel={over.guideLevel ?? 3}
      guided={over.guided ?? false}
      handedness={over.handedness ?? 'right'}
      tuning={STANDARD_TUNING}
      feedback={over.feedback ?? null}
    />,
  );
}

const shapes = () =>
  within(screen.getByRole('list', { name: 'Octave shapes' })).getAllByRole('listitem');
const current = () => shapes().filter((li) => li.getAttribute('aria-current') === 'true');
const at = (string: number, fret: number): Position => ({ string, fret });

describe('octaveShapes', () => {
  it('groups the C1 pairs into the standard shapes', () => {
    expect(
      octaveShapes(STANDARD_TUNING).map((s) => [s.distance, s.offset, s.gbShift, s.pairs]),
    ).toEqual([
      [
        2,
        2,
        false,
        [
          [6, 4],
          [5, 3],
        ],
      ],
      [
        2,
        3,
        true,
        [
          [4, 2],
          [3, 1],
        ],
      ],
      [3, -3, false, [[6, 3]]],
      [
        3,
        -2,
        true,
        [
          [5, 2],
          [4, 1],
        ],
      ],
      [5, 0, true, [[6, 1]]],
    ]);
  });

  it('follows the tuning: in drop D, 6→4 is the same fret', () => {
    const drop = octaveShapes(DROP_D_TUNING);
    expect(drop.find((s) => s.pairs.some(([a, b]) => a === 6 && b === 4))?.offset).toBe(0);
    expect(drop.find((s) => s.pairs.some(([a, b]) => a === 5 && b === 3))?.offset).toBe(2);
  });

  it('names a shape and its frets', () => {
    const [two, gb, three, , double] = octaveShapes(STANDARD_TUNING);
    expect(shapeTitle(two!)).toBe('2 strings over');
    expect(shapeTitle(gb!)).toBe('2 strings over, across G–B');
    expect(shapeTitle(double!)).toBe('Double octave');
    expect([frets(2), frets(-3), frets(0), frets(1)]).toEqual(['+2', '−3', '0', '+1']);
    expect(shapeLabel(two!)).toBe('Note on string 6, octave on string 4, 2 frets higher');
    expect(shapeLabel(three!)).toBe('Note on string 6, octave on string 3, 3 frets lower');
    expect(shapeLabel(double!)).toBe('Note on string 6, octave on string 1, same fret');
  });

  it("finds a single prompt's shape either way along the strings", () => {
    const all = octaveShapes(STANDARD_TUNING);
    expect(shapeOfPrompt(all, prompt('octave:s4f5→s2'))?.offset).toBe(3);
    expect(shapeOfPrompt(all, prompt('octave:s2f8→s4'))?.offset).toBe(3);
    expect(shapeOfPrompt(all, prompt('octave:s1f5→s6'))?.distance).toBe(5);
    expect(shapeOfPrompt(all, prompt('octaves:G'))).toBeNull();
  });
});

describe('<OctaveContextPanel>', () => {
  it('is the D4 plugin’s context panel', async () => {
    expect(await resolveView(octaveFinder.contextPanel!)).toBe(OctaveContextPanel);
  });

  it('draws every shape with a square note and a round octave at full guides', () => {
    panel(prompt('octave:s6f5→s4'));
    expect(screen.getByRole('heading', { name: 'Octave shapes' })).toBeInTheDocument();
    expect(shapes()).toHaveLength(5);
    for (const li of shapes()) {
      const svg = within(li).getByRole('img');
      expect(svg.querySelector('rect[data-testid="shape-root"]')).not.toBeNull();
      expect(svg.querySelector('circle[data-testid="shape-octave"]')).not.toBeNull();
    }
    expect(screen.getByRole('img', { name: /octave on string 4, 2 frets higher/ })).toBeVisible();
    expect(screen.getByRole('img', { name: /octave on string 2, 3 frets higher/ })).toBeVisible();
    expect(screen.getByRole('img', { name: /octave on string 1, same fret/ })).toBeVisible();
    expect(screen.getByText('5→3')).toBeInTheDocument();
    expect(screen.getByText(/G–B/, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/run it backwards/)).toBeInTheDocument();
  });

  it('marks the G–B pair only on shapes that cross it', () => {
    panel(prompt('octave:s6f5→s4'));
    const gb = screen.getAllByTestId('gb-pair').map((r) => r.closest('li')!.dataset.shape);
    expect(gb).toEqual(['23gb', '3-2gb', '50gb']);
  });

  it('fades with the guides', () => {
    const p = prompt('octave:s6f5→s4');
    const two = panel(p, { guideLevel: 2 });
    expect(shapes()).toHaveLength(5);
    expect(screen.getByText('5→3')).toBeInTheDocument();
    expect(screen.queryByText(/run it backwards/)).toBeNull();
    two.unmount();

    panel(p, { guideLevel: 1 });
    expect(shapes().map((li) => li.dataset.shape)).toEqual(['22', '23gb', '50gb']);
    expect(screen.queryByText('5→3')).toBeNull();
    expect(screen.queryByText(/G–B/, { selector: 'strong' })).toBeNull();
  });

  it('marks the prompt’s shape only after the answer or in a worked example', () => {
    const p = prompt('octave:s4f5→s2');
    const before = panel(p);
    expect(current()).toEqual([]);
    before.unmount();

    const after = panel(p, { feedback: fb(p, [at(2, 8)]) });
    expect(current().map((li) => li.dataset.shape)).toEqual(['23gb']);
    after.unmount();

    panel(p, { guided: true });
    expect(current().map((li) => li.dataset.shape)).toEqual(['23gb']);
  });

  it('marks nothing for an every-octave round', () => {
    const p = prompt('octaves:G');
    panel(p, { feedback: fb(p, []) });
    expect(current()).toEqual([]);
  });

  it('mirrors the diagrams for a left-handed neck', () => {
    const p = prompt('octave:s6f5→s4');
    const rootX = () =>
      Number(screen.getAllByTestId('shape-root')[0]!.getAttribute('x')) <
      Number(screen.getAllByTestId('shape-octave')[0]!.getAttribute('cx'));
    const right = panel(p);
    expect(rootX()).toBe(true);
    right.unmount();
    panel(p, { handedness: 'left' });
    expect(rootX()).toBe(false);
  });
});
