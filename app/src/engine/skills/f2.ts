import { NATURAL_PCS } from '../../theory';
import { findItemId, type Skill } from '../model';
import { itemsOf, memo, naturalsOnString, noteItems } from './helpers';

/**
 * F2: natural notes on strings 6 and 5, frets 0–12 (research/03). Each fact is
 * bidirectional (research/02 rule 1): name the note at a fret, and find a
 * named note on the string. D16 (play-the-note) finds it on a real guitar,
 * in mic mode only.
 */

function naturals(skillId: string, string: number) {
  return [
    ...noteItems(skillId, naturalsOnString(string)),
    ...itemsOf(
      skillId,
      NATURAL_PCS.map((pc) => findItemId(pc, string)),
    ),
  ];
}

export const skills: Skill[] = [
  {
    id: 'F2.string6-naturals',
    topic: 'F2',
    order: 200,
    title: 'Natural notes on string 6',
    prerequisites: [],
    drillTypes: ['name-the-note', 'find-the-note', 'play-the-note'],
    items: memo(() => naturals('F2.string6-naturals', 6)),
  },
  {
    id: 'F2.string5-naturals',
    topic: 'F2',
    order: 210,
    title: 'Natural notes on string 5',
    prerequisites: [],
    drillTypes: ['name-the-note', 'find-the-note', 'play-the-note'],
    items: memo(() => naturals('F2.string5-naturals', 5)),
  },
];
