import { NATURAL_PCS, chromaToPc, noteAt } from '../../theory';
import { findItemId, type Item, type Skill } from '../model';
import { FRETS_0_12, itemsOf, memo, noteItems } from './helpers';

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

const PCS = Array.from({ length: 12 }, (_, c) => chromaToPc(c));

/**
 * Name each natural (or each sharp or flat) on the strings, and find each
 * on them, a string at a time: the notes up the string, then the finds.
 */
function stringItems(skillId: string, strings: readonly number[], natural: boolean): Item[] {
  const keep = (pc: string) => NATURAL_PCS.includes(pc) === natural;
  return strings.flatMap((string) => [
    ...noteItems(
      skillId,
      FRETS_0_12.map((fret) => ({ string, fret })).filter((p) => keep(noteAt(p).pc)),
    ),
    ...itemsOf(
      skillId,
      PCS.filter(keep).map((pc) => findItemId(pc, string)),
    ),
  ]);
}

interface Stage {
  id: string;
  strings: readonly number[];
  /** The sharps and flats; a naturals stage is titled by its string. */
  title?: string;
  softPrerequisites?: readonly string[];
  /** Probed in placement (above); the other stages skip it. */
  probe?: boolean;
}

// Skill IDs are literals: e2e/helpers/skills.ts reads them from the source.
const STAGES: readonly Stage[] = [
  { id: 'C2.string1-naturals', strings: [1] },
  // Reached from string 6 by the octave shape two strings up.
  { id: 'C2.string4-naturals', strings: [4], softPrerequisites: ['C1.octaves'] },
  { id: 'C2.string3-naturals', strings: [3] },
  // Reached from string 4 by the octave shape across the G–B shift.
  {
    id: 'C2.string2-naturals',
    strings: [2],
    softPrerequisites: ['C1.octaves-gb-shift'],
    probe: true,
  },
  { id: 'C2.low-accidentals', strings: [6, 5], title: 'Sharps and flats on strings 6 and 5' },
  // The ID predates the stages: drills, fixtures and saved progress name it.
  {
    id: 'C2.all-notes',
    strings: [1, 4, 3, 2],
    title: 'Sharps and flats on strings 4 to 1',
    probe: true,
  },
];

export const C2_STAGE_IDS: readonly string[] = STAGES.map((s) => s.id);

const F2_STRINGS = ['F2.string6-naturals', 'F2.string5-naturals'];

/**
 * The stage before, practising. A probed stage also names the probed stage
 * before it (or F2), which it implies anyway: placement leaves the stages
 * between out, and this keeps a beginner who doesn't know F2 from being
 * asked about string 2 or the sharps and flats.
 */
function prerequisitesOf(i: number): string[] {
  if (i === 0) return F2_STRINGS;
  if (!STAGES[i]?.probe) return [C2_STAGE_IDS[i - 1] as string];
  const probed = C2_STAGE_IDS.slice(0, i).filter((_, j) => STAGES[j]?.probe);
  return [C2_STAGE_IDS[i - 1] as string, ...(probed.length ? probed.slice(-1) : F2_STRINGS)];
}

export const skills: Skill[] = STAGES.map((s, i) => ({
  id: s.id,
  topic: 'C2',
  order: 1200 + i * 10,
  title: s.title ?? `Natural notes on string ${s.strings[0]}`,
  prerequisites: prerequisitesOf(i),
  softUnlock: true,
  ...(s.softPrerequisites ? { softPrerequisites: s.softPrerequisites } : {}),
  ...(s.probe ? {} : { skipPlacement: true }),
  drillTypes: DRILLS,
  items: memo(() => stringItems(s.id, s.strings, !s.title)),
}));
