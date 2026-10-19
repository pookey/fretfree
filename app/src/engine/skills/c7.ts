import { BOX_NUMBERS, relativeBoxNumber } from '../../theory';
import { pentaItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C7: pentatonic boxes linked to CAGED, and the relative minor or major
 * (research/03). One card per box and quality: `penta-box:1@minor` builds
 * minor box 1 around the E shape it wraps, and `penta-relative:1@minor`
 * finds the relative major's root inside that box. The drill picks the root
 * and neck position per prompt, so each card meets its box in many keys and
 * positions (research/02 rule 12).
 *
 * Box N wraps the same CAGED shape in both qualities (1 → E, 2 → D, 3 → C,
 * 4 → A, 5 → G), so a box is learned as the shape plus the notes around it
 * (research/03: "overlay a box on its shape"). Minor comes first, as the
 * box numbering does, then major, then the relative link.
 *
 * Relative cards run in pairs that share a fingering: A minor box 1 is
 * C major box 5. Finding C in one and A in the other is the classic mix-up,
 * so each pair sits side by side and interleaves (rule 6); the drill keys a
 * wrong tap on the box's own root as that confusion.
 */

const DRILLS = ['pentatonic-box'];

/** Each minor box, then the major box with the same notes at the same frets. */
const RELATIVE_ITEMS = BOX_NUMBERS.flatMap((box) => [
  pentaItemId('penta-relative', box, 'minor'),
  pentaItemId('penta-relative', relativeBoxNumber(box, 'minor'), 'major'),
]);

export const skills: Skill[] = [
  {
    id: 'C7.minor-boxes',
    topic: 'C7',
    order: 1700,
    title: 'Pentatonic boxes: minor',
    // Rule 7: CAGED → pentatonic. Each minor box wraps a minor CAGED shape.
    prerequisites: ['C6.minor-shapes'],
    softUnlock: false,
    drillTypes: DRILLS,
    items: memo(() =>
      itemsOf(
        'C7.minor-boxes',
        BOX_NUMBERS.map((b) => pentaItemId('penta-box', b, 'minor')),
      ),
    ),
  },
  {
    id: 'C7.major-boxes',
    topic: 'C7',
    order: 1710,
    title: 'Pentatonic boxes: major',
    prerequisites: ['C7.minor-boxes'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() =>
      itemsOf(
        'C7.major-boxes',
        BOX_NUMBERS.map((b) => pentaItemId('penta-box', b, 'major')),
      ),
    ),
  },
  {
    id: 'C7.relative',
    topic: 'C7',
    order: 1720,
    title: 'Relative minor and major in a box',
    prerequisites: ['C7.minor-boxes', 'C7.major-boxes'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() => itemsOf('C7.relative', RELATIVE_ITEMS)),
  },
];
