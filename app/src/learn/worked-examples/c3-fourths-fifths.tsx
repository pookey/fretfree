import { shapeStep } from './shapes';
import type { WorkedExample } from './types';

/**
 * C3: 4ths and 5ths across the G–B pair are one fret higher than their
 * shapes on the lower strings (research/03: the +1 fret shift). The 4th and
 * the 5th alternate, so the shift is learnt as one rule, not two grips.
 * The 5th's trap is a tritone, so its root is B: the trap is then F, which
 * the neck labels as the copy spells it.
 */
const example: WorkedExample = {
  id: 'c3-fourths-fifths',
  for: ['C3.fourths-fifths'],
  title: '4ths and 5ths across the G–B shift',
  idea: 'On the lower strings a perfect 4th is one string up at the same fret, and a 5th is one string up, two frets up. From G to B, both move one fret up.',
  steps: [
    shapeStep({ string: 3, fret: 5 }, 'P4', 2),
    shapeStep({ string: 3, fret: 4 }, 'P5', 2),
    shapeStep({ string: 3, fret: 7 }, 'P4', 2),
  ],
};

export default example;
