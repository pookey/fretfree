import { allStrings, chromaToPc } from '../../theory';
import { findItemId, type Skill } from '../model';
import { FRETS_0_12, itemsOf, memo, noteItems } from './helpers';
import { skills as f2Skills } from './f2';

/**
 * C2: all notes on all strings, including accidentals (research/03), in both
 * directions (research/02 rule 1), and found by ear (D15, rule 13). The F2
 * naturals on strings 6 and 5 stay F2's items, so every item ID belongs to
 * exactly one skill.
 */
export const skills: Skill[] = [
  {
    id: 'C2.all-notes',
    topic: 'C2',
    order: 1200,
    title: 'Every note on every string',
    prerequisites: ['F2.string6-naturals', 'F2.string5-naturals'],
    softUnlock: true,
    drillTypes: ['name-the-note', 'find-the-note', 'play-the-note', 'hear-it-find-it'],
    items: memo(() => {
      const f2 = new Set(f2Skills.flatMap((s) => s.items().map((i) => i.id)));
      const strings = allStrings();
      return [
        ...noteItems(
          'C2.all-notes',
          strings.flatMap((string) => FRETS_0_12.map((fret) => ({ string, fret }))),
        ),
        ...itemsOf(
          'C2.all-notes',
          strings.flatMap((string) =>
            Array.from({ length: 12 }, (_, c) => findItemId(chromaToPc(c), string)),
          ),
        ),
      ].filter((i) => !f2.has(i.id));
    }),
  },
];
