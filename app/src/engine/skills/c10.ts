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
 * The capo maths needs only half steps and key names, so the first stage
 * opens on F1's half steps and the sharp keys. Design §5 puts Progressions
 * after Harmony (C8); there are no C8 skills to gate on yet.
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
}

const GROUPS: readonly Group[] = [
  {
    id: 'C10.capo-g-c-d',
    title: 'Capo with G, C and D shapes',
    // The shapes most songs are played in under a capo.
    shapes: ['G', 'C', 'D'],
    prerequisites: ['F1.half-steps', 'C4.sharp-keys'],
  },
  {
    id: 'C10.capo-a-e',
    title: 'Capo with A and E shapes',
    shapes: ['A', 'E'],
    prerequisites: ['C10.capo-g-c-d'],
  },
  {
    id: 'C10.capo-minor',
    title: 'Capo with Am, Em and Dm shapes',
    shapes: ['Am', 'Em', 'Dm'],
    prerequisites: ['C10.capo-g-c-d'],
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
  // Low-risk theory, like C4: open once the prerequisites are practising.
  softUnlock: true,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, capoIds(g.shapes))),
}));
