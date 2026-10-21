import { capoItemId, type CapoItemKind, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C10: capo and transposition (research/03: "Song in B♭, using G shapes:
 * which capo fret?"). Each card is one open-shape key in one direction, and
 * the capo fret varies per prompt (research/02 rule 12):
 *
 * - `capo-sound:G`: G shapes, capo on fret 3, which key sounds? (B♭)
 * - `capo-shape:G`: a song in B♭, capo on fret 3, which shapes? (G)
 * - `capo-fret:G`: a song in B♭, played with G shapes, which fret? (3)
 *
 * The first two are the confusable pair behind "transposing in the wrong
 * direction" (research/03 C10): a capo raises the shapes, so the sounding key
 * is above them and the shapes are below the song. They enter side by side,
 * shape by shape, so the directions are mixed from the start (rule 6), and
 * D13 keys them `capo:up` and `capo:down` for the confusion matrix.
 *
 * The first stage opens once the sharp keys (key names) and triads are
 * practising. It asked for both mastered until M10-02, but a capo question
 * needs "which key sounds", fret arithmetic on key names, not mastered
 * spelling; rule 7's chord construction → progressions gate is C9's, not
 * this one's. The later stages build on it alone.
 */

const DRILLS = ['capo'];

/** Directions in the order a shape's cards enter: up, then down, then the fret. */
const KINDS: readonly CapoItemKind[] = ['capo-sound', 'capo-shape', 'capo-fret'];

interface Group {
  id: string;
  title: string;
  /** Open-shape keys (`OPEN_SHAPE_KEYS` labels) in the order they enter. */
  shapes: readonly string[];
  prerequisites: readonly string[];
  softPrerequisites?: readonly string[];
  /** Opens once the prerequisites are merely practising. */
  softUnlock: boolean;
}

const GROUPS: readonly Group[] = [
  {
    id: 'C10.capo-g-c-d',
    title: 'Capo with G, C and D shapes',
    // The shapes most songs are played in under a capo.
    shapes: ['G', 'C', 'D'],
    prerequisites: [],
    softPrerequisites: ['C4.sharp-keys', 'C5.triads'],
    softUnlock: false,
  },
  {
    id: 'C10.capo-a-e',
    title: 'Capo with A and E shapes',
    shapes: ['A', 'E'],
    prerequisites: ['C10.capo-g-c-d'],
    // Low-risk: the same maths on more shapes.
    softUnlock: true,
  },
  {
    id: 'C10.capo-minor',
    title: 'Capo with Am, Em and Dm shapes',
    shapes: ['Am', 'Em', 'Dm'],
    prerequisites: ['C10.capo-g-c-d'],
    // Low-risk: the same maths on more shapes.
    softUnlock: true,
  },
];

/** Shape by shape, each in every direction. */
export function capoIds(shapes: readonly string[]): string[] {
  return shapes.flatMap((shape) => KINDS.map((kind) => capoItemId(kind, shape)));
}

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C10',
  order: 2000 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  ...(g.softPrerequisites ? { softPrerequisites: g.softPrerequisites } : {}),
  softUnlock: g.softUnlock,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, capoIds(g.shapes))),
}));
