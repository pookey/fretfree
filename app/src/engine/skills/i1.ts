import type { TriadQuality } from '../../theory';
import { INVERSIONS, inversionItemId, type StringSetLow } from '../items/inversion';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * I1: triads on string sets, in every inversion (research/03: "all 3
 * inversions on each string set"). Two cards per inversion, set and quality,
 * one each way (research/02 rule 1):
 *
 * - `inversion:1@s3/major` builds the 1st inversion on strings 3–1 from its
 *   root;
 * - `inversion-name:1@s3/major` names the inversion of a triad drawn there.
 *
 * D18 picks the root and neck position per prompt, so each card meets its
 * shape in many keys and positions (rule 12). Building comes before naming
 * within each set: the name card recognises the shape the build card made.
 *
 * The top sets (3–1, 4–2) come first: they hold the CAGED triad cores
 * (research/03: "show that triads are the cores of the CAGED shapes"), and
 * D18's panel names the shape each one sits in. Major comes before minor,
 * as in C6. The voice-leading puzzle (D19, M6-04) adds its own skill file.
 */

const DRILLS = ['triad-inversions'];

function setItems(sets: readonly StringSetLow[], quality: TriadQuality): string[] {
  return sets.flatMap((low) =>
    (['inversion', 'inversion-name'] as const).flatMap((kind) =>
      INVERSIONS.map((inv) => inversionItemId(kind, inv, low, quality)),
    ),
  );
}

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  softUnlock: boolean;
  sets: readonly StringSetLow[];
  quality: TriadQuality;
}

const TOP: readonly StringSetLow[] = [3, 4];
const LOW: readonly StringSetLow[] = [5, 6];

const GROUPS: readonly Group[] = [
  {
    id: 'I1.major-top-sets',
    title: 'Major triad inversions: strings 3–1 and 4–2',
    // Rule 7: the triad cores of the CAGED shapes first, then their inversions.
    prerequisites: ['C6.triad-cores'],
    softUnlock: false,
    sets: TOP,
    quality: 'major',
  },
  {
    id: 'I1.major-low-sets',
    title: 'Major triad inversions: strings 5–3 and 6–4',
    prerequisites: ['I1.major-top-sets'],
    softUnlock: true,
    sets: LOW,
    quality: 'major',
  },
  {
    id: 'I1.minor-top-sets',
    title: 'Minor triad inversions: strings 3–1 and 4–2',
    prerequisites: ['I1.major-top-sets', 'C6.minor-cores'],
    softUnlock: true,
    sets: TOP,
    quality: 'minor',
  },
  {
    id: 'I1.minor-low-sets',
    title: 'Minor triad inversions: strings 5–3 and 6–4',
    prerequisites: ['I1.major-low-sets', 'I1.minor-top-sets'],
    softUnlock: true,
    sets: LOW,
    quality: 'minor',
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'I1',
  // After C7 (the M-Pentatonic module), before C10.
  order: 1800 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  softUnlock: g.softUnlock,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, setItems(g.sets, g.quality))),
}));
