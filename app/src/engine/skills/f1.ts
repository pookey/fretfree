import { NATURAL_PCS, chromaOf } from '../../theory';
import { letterItemId, stepItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * F1: the musical alphabet, half and whole steps, and the missing sharps
 * between B–C and E–F (research/03). Items step from natural notes only; the
 * drill spells answers with the accidental preference.
 */

const DRILLS = ['note-wheel'];

/** A half step from this natural lands on another natural (B–C, E–F). */
function isNaturalHalfStep(semitones: number, from: string): boolean {
  const target = (chromaOf(from) + semitones + 12) % 12;
  return Math.abs(semitones) === 1 && NATURAL_PCS.some((pc) => chromaOf(pc) === target);
}

function steps(semitones: number, filter: (from: string) => boolean): string[] {
  return NATURAL_PCS.filter(filter).map((from) => stepItemId(semitones, from));
}

export const skills: Skill[] = [
  {
    id: 'F1.alphabet',
    topic: 'F1',
    order: 100,
    title: 'The musical alphabet',
    prerequisites: [],
    drillTypes: DRILLS,
    items: memo(() =>
      itemsOf(
        'F1.alphabet',
        [1, -1].flatMap((s) => NATURAL_PCS.map((from) => letterItemId(s, from))),
      ),
    ),
  },
  {
    id: 'F1.b-c-e-f',
    topic: 'F1',
    order: 110,
    title: 'No sharp between B–C and E–F',
    prerequisites: ['F1.alphabet'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() =>
      itemsOf(
        'F1.b-c-e-f',
        [1, -1].flatMap((s) => steps(s, (from) => isNaturalHalfStep(s, from))),
      ),
    ),
  },
  {
    id: 'F1.half-steps',
    topic: 'F1',
    order: 120,
    title: 'Half steps: sharps and flats',
    prerequisites: ['F1.b-c-e-f'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() =>
      itemsOf(
        'F1.half-steps',
        [1, -1].flatMap((s) => steps(s, (from) => !isNaturalHalfStep(s, from))),
      ),
    ),
  },
  {
    id: 'F1.whole-steps',
    topic: 'F1',
    order: 130,
    title: 'Whole steps',
    prerequisites: ['F1.half-steps'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() =>
      itemsOf(
        'F1.whole-steps',
        [2, -2].flatMap((s) => steps(s, () => true)),
      ),
    ),
  },
];
