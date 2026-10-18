import { allStrings } from '../../theory';
import type { Skill } from '../model';
import { FRETS_0_12, memo, noteItems } from './helpers';

/** C2: all notes on all strings, including accidentals (research/03). */
export const skills: Skill[] = [
  {
    id: 'C2.all-notes',
    topic: 'C2',
    order: 1200,
    title: 'Every note on every string',
    prerequisites: ['F2.string6-naturals', 'F2.string5-naturals'],
    softUnlock: true,
    drillTypes: ['name-the-note'],
    items: memo(() =>
      noteItems(
        'C2.all-notes',
        allStrings().flatMap((string) => FRETS_0_12.map((fret) => ({ string, fret }))),
      ),
    ),
  },
];
