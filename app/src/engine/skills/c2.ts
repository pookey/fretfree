import { NATURAL_PCS, chromaToPc, noteAt } from '../../theory';
import { findItemId, type Item, type Skill } from '../model';
import { FRETS_0_12, itemsOf, memo, naturalsOnString, noteItems } from './helpers';

/**
 * C2: all notes on all strings, including accidentals (research/03), in both
 * directions (research/02 rule 1), and found with its sound (D15, rule 10).
 * The F2 naturals on strings 6 and 5 stay F2's items, so every item ID
 * belongs to exactly one skill.
 *
 * The rest of the neck comes in stages (M10-12), so each has a ring that
 * fills in days and a milestone of its own (rule 15), not one 120-item
 * skill that reads 0% for weeks:
 *
 * 1. The naturals on string 1: string 6's names two octaves up, so they
 *    transfer almost for free.
 * 2. Strings 4 and 3: each is reached from string 6 or 5 by an octave shape
 *    the learner already knows (C1.octaves).
 * 3. String 2 last of the naturals: the G–B shift makes it the hardest
 *    (C1.octaves-gb-shift).
 * 4. Sharps and flats on strings 6 and 5, then on strings 4 to 1.
 *
 * Each stage opens once the one before is practising (soft, as C2 opened on
 * F2 practising): they are the same skill on more strings, not a rule-7
 * gate. Each keeps every drill, D15 (hear it, find it) included.
 *
 * The placement test probes two stages, as one C2 skill fitted its budget:
 * string 2's naturals (the hardest; a learner who knows them knows the other
 * naturals) and the last stage (the hardest sharps and flats). The other
 * stages open in turn and arrive as new cards, which a fluent learner's
 * first Easy answers space out quickly.
 */

// D16 (play-the-note) finds the note on a real guitar, in mic mode only.
const DRILLS = ['name-the-note', 'find-the-note', 'play-the-note', 'hear-it-find-it'];

const ACCIDENTAL_PCS = Array.from({ length: 12 }, (_, c) => chromaToPc(c)).filter(
  (pc) => !NATURAL_PCS.includes(pc),
);

/** Name each natural on the string, and find each on it (as F2). */
function naturals(skillId: string, string: number) {
  return [
    ...noteItems(skillId, naturalsOnString(string)),
    ...itemsOf(
      skillId,
      NATURAL_PCS.map((pc) => findItemId(pc, string)),
    ),
  ];
}

/** Name each sharp or flat on the strings, and find each, a string at a time. */
function accidentals(skillId: string, strings: readonly number[]) {
  return strings.flatMap((string) => [
    ...noteItems(
      skillId,
      FRETS_0_12.map((fret) => ({ string, fret })).filter(
        (p) => !NATURAL_PCS.includes(noteAt(p).pc),
      ),
    ),
    ...itemsOf(
      skillId,
      ACCIDENTAL_PCS.map((pc) => findItemId(pc, string)),
    ),
  ]);
}

interface Stage {
  id: string;
  title: string;
  prerequisites: readonly string[];
  softPrerequisites?: readonly string[];
  skipPlacement?: boolean;
  items: (skillId: string) => Item[];
}

// Skill IDs are literals: e2e/helpers/skills.ts reads them from the source.
const STAGES: readonly Stage[] = [
  {
    id: 'C2.string1-naturals',
    title: 'Natural notes on string 1',
    prerequisites: ['F2.string6-naturals', 'F2.string5-naturals'],
    skipPlacement: true,
    items: (id) => naturals(id, 1),
  },
  {
    id: 'C2.string4-naturals',
    title: 'Natural notes on string 4',
    prerequisites: ['C2.string1-naturals'],
    // Reached from string 6 by the octave shape two strings up.
    softPrerequisites: ['C1.octaves'],
    skipPlacement: true,
    items: (id) => naturals(id, 4),
  },
  {
    id: 'C2.string3-naturals',
    title: 'Natural notes on string 3',
    prerequisites: ['C2.string4-naturals'],
    skipPlacement: true,
    items: (id) => naturals(id, 3),
  },
  {
    id: 'C2.string2-naturals',
    title: 'Natural notes on string 2',
    prerequisites: ['C2.string3-naturals'],
    // Reached from string 4 by the octave shape across the G–B shift.
    softPrerequisites: ['C1.octaves-gb-shift'],
    items: (id) => naturals(id, 2),
  },
  {
    id: 'C2.low-accidentals',
    title: 'Sharps and flats on strings 6 and 5',
    prerequisites: ['C2.string2-naturals'],
    skipPlacement: true,
    items: (id) => accidentals(id, [6, 5]),
  },
  {
    // The ID predates the stages: drills, fixtures and saved progress name it.
    id: 'C2.all-notes',
    title: 'Sharps and flats on strings 4 to 1',
    prerequisites: ['C2.low-accidentals'],
    items: (id) => accidentals(id, [1, 4, 3, 2]),
  },
];

export const skills: Skill[] = STAGES.map((s, i) => ({
  id: s.id,
  topic: 'C2',
  order: 1200 + i * 10,
  title: s.title,
  prerequisites: s.prerequisites,
  softUnlock: true,
  ...(s.softPrerequisites ? { softPrerequisites: s.softPrerequisites } : {}),
  ...(s.skipPlacement ? { skipPlacement: true } : {}),
  drillTypes: DRILLS,
  items: memo(() => s.items(s.id)),
}));

/** The C2 stages in teaching order: "Whole neck" needs every one mastered. */
export const C2_STAGE_IDS: readonly string[] = STAGES.map((s) => s.id);
