import type { CagedShapeName, ChordKind } from '../../theory';
import { templatesFor } from '../../theory/voicings';
import { chordNameItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C5: name the chord from its dots (research/03, D36). A voicing is drawn on
 * the neck or as a chord diagram, and the learner names its root, then its
 * quality. Each item is one quality in one shape family:
 * `chord-name:A-shape@m7` is a m7 voicing from the A-shape family (Am7
 * x02010 at the nut, a barre chord further up). The drill picks the root and
 * the neck position per prompt, so a card meets its shape in many keys and
 * positions (research/02 rule 12), the grain of the CAGED cards (design §3.1).
 *
 * Confusable qualities share a skill and enter side by side (rule 6): each
 * shape brings in its major and minor together, then its 7, maj7, m7 and
 * m7♭5, then its sus4 and sus2. The barre-chord families (E, A) come first,
 * then D, C and G.
 *
 * Naming a chord reads the 3rd (and the 7th) from the root, so each stage is
 * gated on finding those tones in a shape (D8's skills) and on spelling the
 * chords (rule 7). Like D8's skills, these apply C5 on the neck, so the
 * placement test leaves them out (M3-13).
 */

const DRILLS = ['name-the-chord'];

/** Shape families in the order they enter. */
const SHAPE_ORDER: readonly CagedShapeName[] = ['E', 'A', 'D', 'C', 'G'];

interface Group {
  id: string;
  title: string;
  kinds: readonly ChordKind[];
  prerequisites: readonly string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'C5.name-triads',
    title: 'Name major and minor chords from their shapes',
    kinds: ['major', 'minor'],
    prerequisites: ['C5.tones-thirds'],
  },
  {
    id: 'C5.name-sevenths',
    title: 'Name 7th chords from their shapes',
    // 7 next to maj7 (the ♭7 vs the 7), and m7 next to m7♭5.
    kinds: ['7', 'maj7', 'm7', 'm7b5'],
    prerequisites: ['C5.name-triads', 'C5.tones-sevenths'],
  },
  {
    id: 'C5.name-sus',
    title: 'Name sus chords from their shapes',
    kinds: ['sus4', 'sus2'],
    prerequisites: ['C5.name-triads', 'C5.sus-add'],
  },
];

/** Shape by shape, each with every kind it has a voicing for. */
export function chordNameIds(kinds: readonly ChordKind[]): string[] {
  return SHAPE_ORDER.flatMap((shape) =>
    kinds
      .filter((kind) => templatesFor(kind).some((t) => t.shape === shape))
      .map((kind) => chordNameItemId(shape, kind)),
  );
}

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C5',
  order: 1570 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  skipPlacement: true,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, chordNameIds(g.kinds))),
}));
