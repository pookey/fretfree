import { allStrings, chromaToPc, intervalSemitones, noteAt, type IntervalName } from '../../theory';
import { earFindItemId } from '../items/ear-find';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * I6, ear → fretboard (research/02 rule 13, research/03 I6 "hear it, then
 * play it back"): D15 plays an open string, then a note on it, and the
 * learner finds the note by ear. One card per note on each string
 * (`ear-find:G@s4`), apart from C2's `find:` cards, so an ear miss never
 * lapses what the learner knows of the neck (rule 1), and the skill fades
 * its own guides.
 *
 * An ear track runs alongside the fretboard path (design §5), so it opens
 * as soon as string 6's naturals are being practised (soft unlock), not
 * after C2. The note is heard over its open string, so none of its name
 * is needed. New cards come by interval above the open string in I6's
 * teaching order, the most distinct first, across the strings from the low
 * E up (rule 12).
 *
 * Left out of the placement test, which probes the fretboard and harmony
 * path (design §4), not the ear.
 */

export const EAR_FIND_ORDER: readonly IntervalName[] = [
  'P4',
  'P5',
  'P8',
  'm3',
  'M3',
  'm2',
  'M2',
  'm6',
  'M6',
  'TT',
  'm7',
  'M7',
];

export const EAR_FIND_SKILL = 'I6.ear-find';

export const skills: Skill[] = [
  {
    // A literal, not EAR_FIND_SKILL: e2e/helpers/skills.ts reads skill IDs
    // from the sources, so the seeds can master this skill.
    id: 'I6.ear-find',
    topic: 'I6',
    // With the other I6 skills: the Ear module's place in the goal profile
    // decides when it is offered (engine/frontier).
    order: 2540,
    title: 'Hear it, find it on the neck',
    prerequisites: ['F2.string6-naturals'],
    softUnlock: true,
    skipPlacement: true,
    drillTypes: ['hear-it-find-it'],
    items: memo(() => {
      const strings = allStrings().reverse();
      return itemsOf(
        EAR_FIND_SKILL,
        EAR_FIND_ORDER.flatMap((interval) =>
          strings.map((string) => {
            const open = noteAt({ string, fret: 0 }).chroma;
            return earFindItemId(chromaToPc(open + intervalSemitones(interval)), string);
          }),
        ),
      );
    }),
  },
];
