import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine';
import { cagedShape, crossesGBShift, midiAt } from '../../theory';
import example, { MAP_CALLOUT, cagedStep } from './c6-caged-map';
import { exampleFor } from './index';
import { exampleMarkers, stepRange, type ExampleState } from './logic';

const SHAPES = [
  ['A', 'C'],
  ['E', 'G'],
  ['D', 'A'],
] as const;

describe('c6-caged-map', () => {
  it('is the C6 example, with minor skills taking the minor one', () => {
    const c6 = SKILLS.filter((s) => s.topic === 'C6');
    expect(c6.length).toBeGreaterThan(0);
    for (const skill of c6) {
      expect(exampleFor(skill)?.id, skill.id).toBe(
        skill.id.includes('minor') ? 'c6-minor-map' : 'c6-caged-map',
      );
    }
  });

  it('finds a note of each shape from one of its roots, and the template agrees', () => {
    example.steps.forEach((step, i) => {
      const [name, root] = SHAPES[i]!;
      const notes = cagedShape(name, root).notes;
      const given = notes.find((n) => n.string === step.given[0]!.string)!;
      expect(given).toMatchObject({ ...step.given[0], degree: 'R' });
      expect(notes).toContainEqual(expect.objectContaining(step.answer));
      // The rest of the shape is context: everything but the answer.
      expect(step.shape).toHaveLength(notes.length - 1);
      expect(step.shape).not.toContainEqual(expect.objectContaining(step.answer));
    });
  });

  it('crosses the G–B pair every time, calling out grips at the trap', () => {
    for (const step of example.steps) {
      expect(crossesGBShift(step.given[0]!.string, step.answer.string)).toBe(true);
      expect(step.trap?.message).toContain(MAP_CALLOUT);
    }
    expect(MAP_CALLOUT).toMatch(/map, not five grips/);
    expect(example.idea).toMatch(/Don’t memorise five grips/);
  });

  it('frames the whole shape in its window', () => {
    for (const step of example.steps) {
      const { from, to } = stepRange(step, example.range);
      for (const n of step.shape!) {
        expect(n.fret).toBeGreaterThanOrEqual(from);
        expect(n.fret).toBeLessThanOrEqual(to);
      }
    }
  });

  it('draws the rest of the shape around the root as context', () => {
    const worked: ExampleState = { step: 0, tapped: null, nudge: false };
    const markers = exampleMarkers(example, worked);
    // The given root is the one root square; the shape fills the other three
    // cells, and the root joins their outline. The answer stays out of it.
    expect(markers.filter((m) => m.style === 'root')).toHaveLength(1);
    expect(markers.filter((m) => m.style === 'tone')).toHaveLength(3);
    expect(markers.filter((m) => m.group === 'example-shape')).toHaveLength(4);
    expect(markers.find((m) => m.style === 'target')?.group).toBeUndefined();
  });

  it('names the step for the shape and the chord', () => {
    expect(example.steps.map((s) => s.prompt)).toEqual([
      'The A shape of C: find its 3rd on string 2.',
      'The E shape of G: find its 5th on string 2.',
      'The D shape of A: find its other root on string 2.',
    ]);
    expect(cagedStep('E', 'G', 6, 'b7', 4, { quality: 'dominant7' }).prompt).toBe(
      'The E shape of G7: find its ♭7 on string 4.',
    );
  });

  it('refuses a step the template does not have', () => {
    // String 4 of the A shape is the 5th, not a root.
    expect(() => cagedStep('A', 'C', 4, '3', 2)).toThrow(/no root on 4/);
    // String 2 of the A shape is the 3rd, not the 5th.
    expect(() => cagedStep('A', 'C', 3, '5', 2)).toThrow(/5 on 2/);
    // Down the strings is not a shape from the root.
    expect(() => cagedStep('A', 'C', 3, 'R', 5)).toThrow();
    expect(midiAt({ string: 5, fret: 3 })).toBeLessThan(midiAt({ string: 3, fret: 5 }));
  });
});
