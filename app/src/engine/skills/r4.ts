import { RHYTHM_CELLS, type CellFeel, type RhythmCell } from '../../theory/rhythm';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * R4: rhythm notation (research/03 track R: "note and rest values, dots,
 * ties, beams, 8ths → 16ths → triplets, syncopation"; "count and tap a
 * written bar accurately"). Every card is a rhythm cell (`rhythm:<slug>`,
 * the catalogue in `theory/rhythm.ts`), read in a bar and tapped against the
 * timing engine's click (D27), or played on a guitar in mic mode.
 *
 * Cells come in by their teaching stage (`cell.stage`): quarters and
 * eighths, sixteenths, dotted rhythms, triplets, then syncopation; compound
 * cells once 6/8 has been heard (T4, sound before symbol, design §12). Each
 * cell's first rep plays it before its notation shows. Dotted and straight
 * cells are each other's `confusable`, and D27 writes the two side by side
 * in one bar, so reading the dot is what the rep tests (research/02 rule 6).
 *
 * Reading a rhythm is practice, not something to place out of, and the
 * placement test has no click: every skill skips it.
 */

export const R4_DRILLS = ['rhythm-reading'];

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  feel: CellFeel;
  stages: readonly RhythmCell['stage'][];
}

// Skill IDs are written out: e2e/helpers/skills.ts reads them from this file.
const GROUPS: readonly Group[] = [
  {
    id: 'R4.eighths',
    title: 'Read rhythms: quarters, halves and eighths',
    // Read a time signature, and tap eighths, before reading a bar of them.
    prerequisites: ['T1.simple-meters', 'F4.eighths'],
    feel: 'simple',
    stages: [1],
  },
  {
    id: 'R4.sixteenths',
    title: 'Read sixteenth notes',
    prerequisites: ['R4.eighths'],
    feel: 'simple',
    stages: [2],
  },
  {
    id: 'R4.dotted',
    title: 'Dotted rhythms: dotted or straight?',
    prerequisites: ['R4.sixteenths'],
    feel: 'simple',
    stages: [3],
  },
  {
    id: 'R4.triplets',
    title: 'Read triplets',
    prerequisites: ['R4.dotted'],
    feel: 'simple',
    stages: [4],
  },
  {
    id: 'R4.syncopation',
    title: 'Read syncopation: off the beat',
    prerequisites: ['R4.dotted'],
    feel: 'simple',
    stages: [5],
  },
  {
    id: 'R4.compound',
    title: 'Read rhythms in 6/8',
    // Sound before symbol: hear 6/8 (T4) before reading it.
    prerequisites: ['R4.eighths', 'T4.compound'],
    feel: 'compound',
    stages: [1, 2],
  },
  {
    id: 'R4.compound-dotted',
    title: 'Dotted rhythms and duplets in 6/8',
    prerequisites: ['R4.compound', 'R4.dotted'],
    feel: 'compound',
    stages: [3, 4, 5],
  },
];

/** The cells a group teaches, in the catalogue's teaching order. */
function cellsOf(g: Group): string[] {
  return RHYTHM_CELLS.filter((c) => c.feel === g.feel && g.stages.includes(c.stage)).map(
    (c) => c.id,
  );
}

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'R4',
  // The Reading module; R1–R3 have the orders before it.
  order: 3300 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  softUnlock: true,
  skipPlacement: true,
  drillTypes: R4_DRILLS,
  items: memo(() => itemsOf(g.id, cellsOf(g))),
}));
