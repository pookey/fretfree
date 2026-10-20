import {
  I6_CHORD_GROUPS,
  I6_INTERVAL_GROUPS,
  I6_PROGRESSION_GROUPS,
  earChordItemId,
  earIntervalItemId,
  progressionEarItemId,
  type EarDirection,
  type EarGroup,
} from '../items/ear';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * I6: ear training (research/03: "hear a progression → identify it;
 * chord-quality ID; interval ID"), a parallel track from day one (design
 * §5). D14 plays a sound and the learner names it:
 *
 * - `ear-interval:P5:up`: a rising interval; `:down` falling, `:together`
 *   both notes at once. Rising intervals come first, a few at a time, from
 *   the most distinct (4ths, 5ths and octaves) to the closest pairs. Falling
 *   and together follow as their own skills, once every rising one is known.
 * - `ear-chord:minor`: a chord's quality, major and minor first.
 * - `prog:I-V-vi-IV:ear`: a catalogue progression (C9). These open with
 *   their C9 skill, as design §5 lists progression ear under Progressions:
 *   naming one needs its numerals.
 *
 * The sound sets: each group below is a set of sounds learned together and
 * the answer buttons D14 offers at its narrowest scope. Wider scopes add a
 * neighbouring group, then all of them (research/02 rule 5), so close pairs
 * (m3/M3, major/minor, I–V–vi–IV/vi–IV–I–V) always meet (rule 6).
 *
 * Bass-movement ID (research/03 I6) is left to a later package.
 */

const DRILLS = ['ear-identify'];

/** Every interval, in group order. */
const ALL_INTERVALS = I6_INTERVAL_GROUPS.flatMap((g) => g.members);

/** A sound set's members, by its ID in `items/ear.ts`. */
function set<T extends string>(groups: readonly EarGroup<T>[], id: string): readonly T[] {
  const group = groups.find((g) => g.id === id);
  if (!group) throw new Error(`No I6 sound set ${id}`);
  return group.members;
}

const rising = (id: string) => () =>
  set(I6_INTERVAL_GROUPS, id).map((i) => earIntervalItemId(i, 'up'));
const every = (direction: EarDirection) => () =>
  ALL_INTERVALS.map((i) => earIntervalItemId(i, direction));
const chords = (id: string) => () => set(I6_CHORD_GROUPS, id).map(earChordItemId);
const progressions = (id: string) => () => set(I6_PROGRESSION_GROUPS, id).map(progressionEarItemId);

/**
 * The first interval and chord sets open once the learner's first skill is
 * being practised (soft unlock): still day one, but the very first session
 * stays the neck's, as the onboarding path expects. "Start with sound"
 * (M4-10) is the route for learners who want ear first.
 */
const DAY_ONE = ['F1.alphabet'];

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  ids: () => string[];
}

// Skill IDs are written out, not built: e2e/helpers/skills.ts reads them from
// this file's source. Each set opens once the one before is being practised.
const INTERVALS: Group[] = [
  {
    id: 'I6.intervals-fourths-fifths',
    title: 'Hear intervals: 4ths, 5ths and octaves',
    prerequisites: DAY_ONE,
    ids: rising('fourths-fifths'),
  },
  {
    id: 'I6.intervals-thirds',
    title: 'Hear intervals: 3rds',
    prerequisites: ['I6.intervals-fourths-fifths'],
    ids: rising('thirds'),
  },
  {
    id: 'I6.intervals-seconds-sixths',
    title: 'Hear intervals: 2nds and 6ths',
    prerequisites: ['I6.intervals-thirds'],
    ids: rising('seconds-sixths'),
  },
  {
    id: 'I6.intervals-sevenths',
    title: 'Hear intervals: 7ths and the tritone',
    prerequisites: ['I6.intervals-seconds-sixths'],
    ids: rising('sevenths'),
  },
  {
    id: 'I6.intervals-falling',
    title: 'Hear intervals falling',
    prerequisites: ['I6.intervals-sevenths'],
    ids: every('down'),
  },
  {
    id: 'I6.intervals-together',
    title: 'Hear intervals played together',
    prerequisites: ['I6.intervals-sevenths'],
    ids: every('together'),
  },
];

const CHORDS: Group[] = [
  {
    id: 'I6.chords-major-minor',
    title: 'Hear chords: major or minor',
    prerequisites: DAY_ONE,
    ids: chords('major-minor'),
  },
  {
    id: 'I6.chords-diminished-augmented',
    title: 'Hear chords: diminished and augmented',
    prerequisites: ['I6.chords-major-minor'],
    ids: chords('diminished-augmented'),
  },
  {
    id: 'I6.chords-sevenths',
    title: 'Hear chords: 7th chords',
    prerequisites: ['I6.chords-diminished-augmented'],
    ids: chords('sevenths'),
  },
];

// Progression ear opens with the C9 skill that teaches each set's numerals.
const PROGRESSIONS: Group[] = [
  {
    id: 'I6.progressions-pop',
    title: 'Hear progressions: pop and rock',
    prerequisites: ['C9.pop'],
    ids: progressions('pop'),
  },
  {
    id: 'I6.progressions-cadences',
    title: 'Hear progressions: ii–V–I and the minor vamp',
    prerequisites: ['I6.progressions-pop', 'C9.ii-V-I', 'C9.minor'],
    ids: progressions('cadences'),
  },
  {
    id: 'I6.progressions-blues',
    title: 'Hear progressions: 12-bar blues',
    prerequisites: ['I6.progressions-pop', 'C9.blues'],
    ids: progressions('blues'),
  },
];

function skillsOf(groups: readonly Group[], base: number): Skill[] {
  return groups.map((g, i) => ({
    id: g.id,
    topic: 'I6',
    // A parallel track: after the core path's skills, so the Ear module's
    // place in the goal profile decides when it is offered (engine/frontier).
    order: base + i,
    title: g.title,
    prerequisites: g.prerequisites,
    // Practice, not a gate: a set opens once the one before is practising.
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() => itemsOf(g.id, g.ids())),
  }));
}

export const skills: Skill[] = [
  ...skillsOf(INTERVALS, 2500),
  ...skillsOf(CHORDS, 2510),
  ...skillsOf(PROGRESSIONS, 2520),
];
