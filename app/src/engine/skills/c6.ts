import { CAGED_ORDER, type CagedQuality } from '../../theory';
import { cagedItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C6: the CAGED shapes, built from a root (research/03). One card per shape,
 * part and quality: `caged-core:A-shape@major` builds the A shape's triad
 * core and `caged:A-shape@major` the whole shape. The drill picks the root
 * and neck position per prompt, so each card meets its shape in many keys
 * and positions (research/02 rule 12) and stays one fact: the template.
 *
 * Triad cores come before whole shapes (research/03: full G and C shapes are
 * hard to fret, so start from partial shapes and triads, which are the cores
 * of the shapes), and major before minor and dominant 7. The C and A shapes
 * both root on string 5 and are the classic confusion, so they share every
 * skill and interleave (rule 6); the drills key them `caged:C` and `caged:A`
 * for the seed pair.
 */

const DRILLS = ['build-caged'];

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  /** Rule 7 gates the first CAGED skill on mastered notes and triads; later ones open as usual. */
  softUnlock: boolean;
  kind: 'caged' | 'caged-core';
  quality: CagedQuality;
}

const GROUPS: readonly Group[] = [
  {
    id: 'C6.triad-cores',
    title: 'CAGED triad cores',
    // Rule 7: natural notes on strings 6 and 5 → CAGED (the roots sit there),
    // and triads before CAGED (research/03: triads are the shapes' cores).
    prerequisites: ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads'],
    softUnlock: false,
    kind: 'caged-core',
    quality: 'major',
  },
  {
    id: 'C6.major-shapes',
    title: 'CAGED shapes: major',
    prerequisites: ['C6.triad-cores'],
    softUnlock: true,
    kind: 'caged',
    quality: 'major',
  },
  {
    id: 'C6.minor-cores',
    title: 'CAGED triad cores: minor',
    prerequisites: ['C6.triad-cores'],
    softUnlock: true,
    kind: 'caged-core',
    quality: 'minor',
  },
  {
    id: 'C6.minor-shapes',
    title: 'CAGED shapes: minor',
    prerequisites: ['C6.major-shapes', 'C6.minor-cores'],
    softUnlock: true,
    kind: 'caged',
    quality: 'minor',
  },
  {
    id: 'C6.dominant7-shapes',
    title: 'CAGED shapes: dominant 7',
    // A 7 shape is the major shape with a b7 (C3's 7th shapes).
    prerequisites: ['C6.major-shapes', 'C3.sevenths'],
    softUnlock: true,
    kind: 'caged',
    quality: 'dominant7',
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C6',
  order: 1600 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  softUnlock: g.softUnlock,
  drillTypes: DRILLS,
  items: memo(() =>
    itemsOf(
      g.id,
      CAGED_ORDER.map((shape) => cagedItemId(g.kind, shape, g.quality)),
    ),
  ),
}));
