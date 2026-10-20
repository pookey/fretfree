import type { IntervalName } from '../../theory';
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

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  ids: () => string[];
}

const rising = (intervals: readonly IntervalName[]) => () =>
  intervals.map((i) => earIntervalItemId(i, 'up'));
const every = (direction: EarDirection) => () =>
  ALL_INTERVALS.map((i) => earIntervalItemId(i, direction));

/**
 * The first interval and chord sets open once the learner's first skill is
 * being practised (soft unlock): still day one, but the very first session
 * stays the neck's, as the onboarding path expects. "Start with sound"
 * (M4-10) is the route for learners who want ear first.
 */
const DAY_ONE = ['F1.alphabet'];

const RISING: Group[] = I6_INTERVAL_GROUPS.map((g, i) => ({
  id: `I6.intervals-${g.id}`,
  title: `Hear intervals: ${g.title}`,
  // Each set opens once the one before is being practised (soft unlock).
  prerequisites:
    i === 0 ? DAY_ONE : [`I6.intervals-${(I6_INTERVAL_GROUPS[i - 1] as EarGroup<string>).id}`],
  ids: rising(g.members),
}));

const LAST_RISING = (RISING[RISING.length - 1] as Group).id;

const INTERVALS: Group[] = [
  ...RISING,
  {
    id: 'I6.intervals-falling',
    title: 'Hear intervals falling',
    prerequisites: [LAST_RISING],
    ids: every('down'),
  },
  {
    id: 'I6.intervals-together',
    title: 'Hear intervals played together',
    prerequisites: [LAST_RISING],
    ids: every('together'),
  },
];

const CHORDS: Group[] = I6_CHORD_GROUPS.map((g, i) => ({
  id: `I6.chords-${g.id}`,
  title: `Hear chords: ${g.title.charAt(0).toLowerCase()}${g.title.slice(1)}`,
  prerequisites:
    i === 0 ? DAY_ONE : [`I6.chords-${(I6_CHORD_GROUPS[i - 1] as EarGroup<string>).id}`],
  ids: () => g.members.map(earChordItemId),
}));

/** The C9 skill that teaches each progression set's numerals. */
const PROGRESSION_PREREQS: Record<string, readonly string[]> = {
  pop: ['C9.pop'],
  cadences: ['I6.progressions-pop', 'C9.ii-V-I', 'C9.minor'],
  blues: ['I6.progressions-pop', 'C9.blues'],
};

const PROGRESSIONS: Group[] = I6_PROGRESSION_GROUPS.map((g) => ({
  id: `I6.progressions-${g.id}`,
  title: `Hear progressions: ${g.title}`,
  prerequisites: PROGRESSION_PREREQS[g.id] ?? [],
  ids: () => g.members.map(progressionEarItemId),
}));

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
