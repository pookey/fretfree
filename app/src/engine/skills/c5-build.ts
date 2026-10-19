import type { ChordKind } from '../../theory';
import { buildChordItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C5: build a chord by tapping (research/03, D38), the reverse of naming it
 * from its dots (D36): the symbol and a root on the neck are given ("Am7,
 * root on string 5 fret 0") and the learner taps one note per string above
 * it. Each item is one chord kind from one root string:
 * `build-chord:m7@s5`. The drill picks the root and its fret per prompt, and
 * accepts any playable voicing of the chord, so a card meets its kind in many
 * keys and positions (research/02 rule 12). Roots sit on strings 6, 5 and 4,
 * where the E/G, A/C and D shape families root.
 *
 * The stages mirror D36's, so a quality is named and built over the same
 * span of the course: major with minor, then 7, maj7, m7 and m7♭5 side by
 * side (the ♭7 vs the 7, rule 6), then sus4 with sus2. Within a stage each
 * root string brings its kinds in together, string 6 first.
 *
 * Building a chord places its tones by degree, so each stage is gated on
 * finding those tones in a shape (D8's skills) and on spelling the chords
 * (rule 7). Like D8's skills these apply C5 on the neck, so the placement
 * test leaves them out (`placement.skipSkills`).
 */

const DRILLS = ['build-the-chord'];

/** Root strings, in the order they enter. */
const ROOT_STRINGS: readonly number[] = [6, 5, 4];

interface Group {
  id: string;
  title: string;
  kinds: readonly ChordKind[];
  prerequisites: readonly string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'C5.build-triads',
    title: 'Build major and minor chords on the neck',
    kinds: ['major', 'minor'],
    prerequisites: ['C5.tones-fifths'],
  },
  {
    id: 'C5.build-sevenths',
    title: 'Build 7th chords on the neck',
    // 7 next to maj7 (the ♭7 vs the 7), and m7 next to m7♭5.
    kinds: ['7', 'maj7', 'm7', 'm7b5'],
    prerequisites: ['C5.build-triads', 'C5.tones-sevenths'],
  },
  {
    id: 'C5.build-sus',
    title: 'Build sus chords on the neck',
    kinds: ['sus4', 'sus2'],
    prerequisites: ['C5.build-triads', 'C5.sus-add'],
  },
];

/** Root string by root string, each with every kind of the stage. */
export function buildChordIds(kinds: readonly ChordKind[]): string[] {
  return ROOT_STRINGS.flatMap((s) => kinds.map((kind) => buildChordItemId(kind, s)));
}

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C5',
  // After D36's naming stages (1570–1590), before C6 (1600).
  order: 1593 + i * 2,
  title: g.title,
  prerequisites: g.prerequisites,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, buildChordIds(g.kinds))),
}));
