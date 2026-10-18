import type { Skill } from '../model';
import { memo, naturalsOnString, noteItems } from './helpers';

/** F2: natural notes on strings 6 and 5, frets 0–12 (research/03). */
export const skills: Skill[] = [
  {
    id: 'F2.string6-naturals',
    topic: 'F2',
    order: 200,
    title: 'Natural notes on string 6',
    prerequisites: [],
    drillTypes: ['name-the-note'],
    items: memo(() => noteItems('F2.string6-naturals', naturalsOnString(6))),
  },
  {
    id: 'F2.string5-naturals',
    topic: 'F2',
    order: 210,
    title: 'Natural notes on string 5',
    prerequisites: [],
    drillTypes: ['name-the-note'],
    items: memo(() => noteItems('F2.string5-naturals', naturalsOnString(5))),
  },
];
