import { BOX_NUMBERS, type ScaleDegree } from '../../theory';
import { scalePositionItemId, scaleRunItemId } from '../items/scale-position';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * I7: the major scale in five CAGED positions, played from any degree
 * (research/03). The pentatonic-box drill serves it:
 *
 * - `scale-position:1`: major pentatonic box 1 is drawn, and the learner
 *   fills in the rest of position 1, the 4ths and 7ths the box leaves out
 *   (rule 7: CAGED → pentatonic → full scale). Positions use the box
 *   numbers: 1 → E shape … 5 → G shape.
 * - `scale-run:1@5`: only the roots are drawn, and the learner plays
 *   position 1 up from its lowest 5th to its highest. Degree 1 is the run
 *   from root to root, so those cards come first.
 *
 * The drill picks the key and neck position per prompt, so each card meets
 * its position in many keys and places (rule 12). The runs of one position
 * sit side by side: starting on the wrong degree is the confusion they
 * share, and the drill logs it against that degree's card (rule 6).
 */

const DRILLS = ['pentatonic-box'];

const OTHER_DEGREES: readonly ScaleDegree[] = [2, 3, 4, 5, 6, 7];

export const skills: Skill[] = [
  {
    id: 'I7.positions',
    topic: 'I7',
    order: 1800,
    title: 'Major scale: the five positions',
    // Each position is its major pentatonic box with the gaps filled in.
    prerequisites: ['C7.major-boxes'],
    softUnlock: false,
    drillTypes: DRILLS,
    items: memo(() => itemsOf('I7.positions', BOX_NUMBERS.map(scalePositionItemId))),
  },
  {
    id: 'I7.root-runs',
    topic: 'I7',
    order: 1810,
    title: 'Major scale positions from the root',
    prerequisites: ['I7.positions'],
    softUnlock: false,
    drillTypes: DRILLS,
    items: memo(() =>
      itemsOf(
        'I7.root-runs',
        BOX_NUMBERS.map((p) => scaleRunItemId(p, 1)),
      ),
    ),
  },
  {
    id: 'I7.degree-runs',
    topic: 'I7',
    order: 1820,
    title: 'Major scale positions from any degree',
    prerequisites: ['I7.root-runs'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() =>
      itemsOf(
        'I7.degree-runs',
        BOX_NUMBERS.flatMap((p) => OTHER_DEGREES.map((d) => scaleRunItemId(p, d))),
      ),
    ),
  },
];
