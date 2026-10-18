import { NATURAL_PCS, chromaToPc } from '../../theory';
import { octavesItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C1, whole neck: "tap every G" (research/03 C1: find all Gs in under 15s).
 * One item per pitch class, `octaves:G`, so the multi-target drill has its
 * own FSRS cards (research/02 rule 1): every position of one note is one
 * fact (name → positions). The single-shape items stay in `c1.ts`. Naturals
 * come first, then the sharps.
 */

const CHROMATIC = Array.from({ length: 12 }, (_, c) => chromaToPc(c, 'sharp'));
const PCS = [...NATURAL_PCS, ...CHROMATIC.filter((pc) => !NATURAL_PCS.includes(pc))];

export const skills: Skill[] = [
  {
    id: 'C1.every-octave',
    topic: 'C1',
    order: 1130,
    title: 'Every octave across the neck',
    prerequisites: ['C1.octaves', 'C1.octaves-gb-shift'],
    softUnlock: true,
    drillTypes: ['octave-finder'],
    items: memo(() =>
      itemsOf(
        'C1.every-octave',
        PCS.map((pc) => octavesItemId(pc)),
      ),
    ),
  },
];
