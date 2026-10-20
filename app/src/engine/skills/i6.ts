import type { ChordKind, IntervalName } from '../../theory';
import {
  earChordItemId,
  earIntervalItemId,
  progressionEarItemId,
  type EarDirection,
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

export interface EarGroup<T extends string> {
  /** The skill's ID suffix, and how D14 names the set. */
  readonly id: string;
  readonly title: string;
  readonly members: readonly T[];
}

/** Rising intervals, in teaching order: the most distinct first, then closer pairs. */
export const I6_INTERVAL_GROUPS: readonly EarGroup<IntervalName>[] = [
  { id: 'fourths-fifths', title: '4ths, 5ths and octaves', members: ['P4', 'P5', 'P8'] },
  { id: 'thirds', title: '3rds', members: ['m3', 'M3'] },
  { id: 'seconds-sixths', title: '2nds and 6ths', members: ['m2', 'M2', 'm6', 'M6'] },
  { id: 'sevenths', title: '7ths and the tritone', members: ['TT', 'm7', 'M7'] },
];

export const I6_CHORD_GROUPS: readonly EarGroup<ChordKind>[] = [
  { id: 'major-minor', title: 'Major or minor', members: ['major', 'minor'] },
  {
    id: 'diminished-augmented',
    title: 'Diminished and augmented',
    members: ['diminished', 'augmented'],
  },
  { id: 'sevenths', title: '7th chords', members: ['7', 'maj7', 'm7', 'm7b5'] },
];

export const I6_PROGRESSION_GROUPS: readonly EarGroup<string>[] = [
  {
    id: 'pop',
    title: 'Pop and rock',
    members: ['I-IV-V', 'I-V-vi-IV', 'vi-IV-I-V', 'I-vi-IV-V'],
  },
  { id: 'cadences', title: 'ii–V–I and the minor vamp', members: ['ii-V-I', 'i-bVII-bVI-bVII'] },
  { id: 'blues', title: '12-bar blues', members: ['12-bar-blues', '12-bar-blues-quick-change'] },
];

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

const RISING: Group[] = I6_INTERVAL_GROUPS.map((g, i) => ({
  id: `I6.intervals-${g.id}`,
  title: `Hear intervals: ${g.title}`,
  // Each set opens once the one before is being practised (soft unlock).
  prerequisites:
    i === 0 ? [] : [`I6.intervals-${(I6_INTERVAL_GROUPS[i - 1] as EarGroup<string>).id}`],
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
  prerequisites: i === 0 ? [] : [`I6.chords-${(I6_CHORD_GROUPS[i - 1] as EarGroup<string>).id}`],
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
