import { chromaOf, type ChordDegree, type ChordKind } from '../../theory';
import { chordTonesItemId, type Skill } from '../model';
import { c5Roots } from './c5';
import { itemsOf, memo } from './helpers';

/**
 * C5: chord tones across the neck (user request, 2026-10-18: "highlight all
 * notes in a C chord"), drilled by D37. One card per chord, in both grains
 * the drill asks: `chord-tones:C` taps every note of C major, and
 * `chord-tones:3@C` every 3rd of it. The drill varies the region per prompt
 * (a CAGED shape's span, then the whole neck), so a card meets its chord in
 * many places (research/02 rule 12).
 *
 * Degree cards are the notes that decide the quality, and each is asked
 * once: the 3rd of C7 is the 3rd of C, and the ♭7 of Cm7 is the ♭7 of C7,
 * so neither gets a second card (rule 1). Within a root the major and minor
 * chord enter together, as do 7 and maj7, so the confusable pairs
 * interleave (rule 6); the drill keys them by D7's concepts (`triad:maj`,
 * `chord:7` …) and by interval (`M3`, `m7` …), so the seed pairs apply.
 *
 * The stage is gated on spelling the chords (C5) and on finding every
 * octave of a note (C1), the two halves of the task (rule 7). The placement
 * test skips these skills (`placement.skipSkills`): a whole-neck round is
 * practice, not a probe.
 */

const DRILLS = ['chord-tones-neck'];

/** Natural roots first, then the common flats and F♯. */
const ROOT_ORDER: readonly number[] = [0, 7, 2, 9, 4, 5, 11, 10, 3, 6, 8, 1];

/** A kind's 12 roots as `c5Roots` spells them, in `ROOT_ORDER`. */
function roots(kind: ChordKind): string[] {
  const byChroma = new Map(c5Roots(kind).map((r) => [chromaOf(r), r]));
  return ROOT_ORDER.map((c) => byChroma.get(c) as string);
}

type Card = readonly [kind: ChordKind, degree: ChordDegree | null];

interface Group {
  id: string;
  title: string;
  /** The cards of one root, in the order they enter. */
  cards: readonly Card[];
  prerequisites: readonly string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'C5.neck-triads',
    title: 'Tap every note of a triad across the neck',
    cards: [
      ['major', null],
      ['minor', null],
      ['major', '3'],
      ['minor', 'b3'],
    ],
    prerequisites: ['C5.triads', 'C1.every-octave'],
  },
  {
    id: 'C5.neck-sevenths',
    title: 'Tap every note of a 7th chord across the neck',
    cards: [
      ['7', null],
      ['maj7', null],
      ['m7', null],
      ['7', 'b7'],
      ['maj7', '7'],
    ],
    prerequisites: ['C5.neck-triads', 'C5.sevenths'],
  },
];

/** Each root in turn, with every card on it: C, Cm, 3@C, b3@Cm, G, … */
function cardIds(cards: readonly Card[]): string[] {
  const byKind = new Map(cards.map(([kind]) => [kind, roots(kind)]));
  return ROOT_ORDER.flatMap((_, i) =>
    cards.map(([kind, degree]) => chordTonesItemId(byKind.get(kind)?.[i] as string, kind, degree)),
  );
}

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C5',
  order: 1597.5 + i * 0.2,
  title: g.title,
  prerequisites: g.prerequisites,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, cardIds(g.cards))),
}));
