import { describe, expect, it } from 'vitest';
import { cagedShape, intervalBetween } from '../../theory';
import { MAP_CALLOUT } from './c6-caged-map';
import example, { minorThirdStep } from './c6-minor-map';

describe('c6-minor-map', () => {
  it('finds the ♭3 of each minor shape from a root, where the template has it', () => {
    const shapes = [
      ['A', 'D'],
      ['E', 'A'],
      ['D', 'E'],
    ] as const;
    example.steps.forEach((step, i) => {
      const [name, root] = shapes[i]!;
      const notes = cagedShape(name, root, { quality: 'minor' }).notes;
      expect(notes).toContainEqual({ ...step.answer, degree: 'b3' });
      expect(intervalBetween(step.given[0]!, step.answer)).toBe('m3');
      expect(step.trap?.message).toContain(MAP_CALLOUT);
    });
  });

  it('traps the major shape’s 3rd where the G–B shift does not', () => {
    const step = minorThirdStep('E', 'A', 4, 3);
    expect(step.trap).toEqual({
      at: { string: 3, fret: 6 },
      name: 'C#',
      message: `That's C#: the major 3rd, from the E shape of A major. A minor flattens it a fret, to C. ${MAP_CALLOUT}`,
    });
    expect(intervalBetween(step.given[0]!, step.trap!.at)).toBe('M3');
    // Across G–B the trap stays the unshifted shape.
    expect(minorThirdStep('A', 'D', 3, 2).trap?.message).toMatch(/without the G–B shift/);
  });
});
