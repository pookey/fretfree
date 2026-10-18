import { INLAY_FRETS } from '../../theory';
import { findMarkerItemId, markerItemId, repeatItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/** F3: fret-marker landmarks (3/5/7/9/12) and the 12th-fret repeat (research/03). */

const MARKERS = INLAY_FRETS.filter((f) => f <= 12);
/** The open string and every landmark repeat an octave (12 frets) higher. */
const REPEAT_FROM = [0, ...MARKERS];

export const skills: Skill[] = [
  {
    id: 'F3.markers',
    topic: 'F3',
    order: 300,
    title: 'Fret markers 3, 5, 7, 9 and 12',
    prerequisites: [],
    drillTypes: ['fret-landmarks'],
    items: memo(() =>
      itemsOf('F3.markers', [...MARKERS.map(markerItemId), ...MARKERS.map(findMarkerItemId)]),
    ),
  },
  {
    id: 'F3.repeat-12',
    topic: 'F3',
    order: 310,
    title: 'The neck repeats at the 12th fret',
    prerequisites: ['F3.markers'],
    softUnlock: true,
    drillTypes: ['fret-landmarks'],
    items: memo(() =>
      itemsOf('F3.repeat-12', [
        ...REPEAT_FROM.map((f) => repeatItemId(12, f)),
        ...REPEAT_FROM.map((f) => repeatItemId(-12, f + 12)),
      ]),
    ),
  },
];
