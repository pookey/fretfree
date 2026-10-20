import type { ChordDegree, ChordKind } from '../../theory';
import { chordToneItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * I2: CAGED arpeggios (research/03: "chord tones inside any box"), drilled
 * by D8. A 7th chord's arpeggio is its four tones in one shape: C5's
 * `C5.tones-sevenths` finds the 3rd and 7th, the notes that decide the
 * quality, and I2 adds the root and the 5th, so every tone of the 7, maj7
 * and m7 shapes is found in both directions. `chord-tone:5@maj7` taps the
 * 5th in a maj7 shape, and `chord-tone-name:5@maj7` names a ringed 5th
 * among the root, both 3rds, the 5th and both 7ths. The drill picks the
 * shape (open, barre or CAGED), root and position per prompt (research/02
 * rule 12).
 *
 * Root first, then the 5th (user request, 2026-10-18, as C5's stages): the
 * 5th is found from the root. Within a stage 7, maj7 and m7 sit side by
 * side and interleave, and the name buttons always offer both 3rds and both
 * 7ths, so the quality's confusions stay in play (rule 6). D8 draws a 5th
 * card only in shapes that hold one: the C-shape 7 (x3231x) has none.
 *
 * Design §5 opens Arpeggios after CAGED and Pentatonic: the first stage is
 * gated on the dominant-7 CAGED shapes and the minor boxes, and on C5's
 * 7th-chord tones (rule 7). As with D8's C5 stages, none soft-unlocks and
 * placement skips them: practice on the neck, not a gate.
 */

const DRILLS = ['chord-tone'];

/** The 7th-chord kinds D8 has shapes for, in the order they enter. */
export const I2_KINDS: readonly ChordKind[] = ['7', 'maj7', 'm7'];

interface Group {
  id: string;
  title: string;
  degree: ChordDegree;
  prerequisites: readonly string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'I2.sevenths-roots',
    title: 'Find the root in 7th-chord arpeggios',
    degree: '1',
    prerequisites: ['C5.tones-sevenths', 'C6.dominant7-shapes', 'C7.minor-boxes'],
  },
  {
    id: 'I2.sevenths-fifths',
    title: 'Find the 5th in 7th-chord arpeggios',
    degree: '5',
    prerequisites: ['I2.sevenths-roots'],
  },
];

/** Tap then name, per kind, so both directions of a fact enter together. */
function toneIds(degree: ChordDegree): string[] {
  return I2_KINDS.flatMap((chord) => [
    chordToneItemId('chord-tone', degree, chord),
    chordToneItemId('chord-tone-name', degree, chord),
  ]);
}

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'I2',
  // After Pentatonic (C7), which the module opens after.
  order: 1800 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  skipPlacement: true,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, toneIds(g.degree))),
}));
