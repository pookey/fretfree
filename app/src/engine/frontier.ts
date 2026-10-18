import type { Goal, Skill } from './model';

/**
 * Design §5 (curriculum → modules) and §3.3 step 2 / §4 (the goal profile
 * reorders frontier skills). Modules group skills by topic ID (research/03);
 * a module has no unlock state of its own — it is derived from its skills.
 */

export type ModuleTrack = 'core' | 'parallel' | 'optional' | 'future';

export interface Module {
  readonly id: string;
  readonly title: string;
  /** Topic IDs (research/03) whose skills belong to this module. */
  readonly topics: readonly string[];
  /** What the module builds on, as shown on its card (design §5 "Unlocks after"). */
  readonly unlocksAfter: string | null;
  readonly track: ModuleTrack;
  readonly summary: string;
  /** The misconception feedback should target (research/03 pain points). */
  readonly misconception?: string;
}

/** Every module of design §5, in default (curriculum) order. */
export const MODULES: readonly Module[] = [
  {
    id: 'notes-1',
    title: 'Neck basics',
    topics: ['F1', 'F2', 'F3'],
    unlocksAfter: null,
    track: 'core',
    summary: 'The musical alphabet, natural notes on strings 6 and 5, and the fret markers.',
    misconception:
      'There is no sharp between B–C or E–F. Recall the note at a fret; don’t count up from the nut.',
  },
  {
    id: 'notes-2',
    title: 'Whole neck',
    topics: ['C1', 'C2'],
    unlocksAfter: 'Neck basics',
    track: 'core',
    summary: 'Octave shapes, including the G–B shift, and every note on every string.',
    misconception:
      'Frets 7–12 on the middle strings get neglected. The G–B shift breaks octave shapes.',
  },
  {
    id: 'intervals',
    title: 'Intervals',
    topics: ['C3'],
    unlocksAfter: 'The musical alphabet (and, softly, octaves)',
    track: 'core',
    summary: 'Interval shapes from m2 to P8 and the G–B +1 fret shift.',
    misconception: 'Interval shapes move up a fret when they cross from the G to the B string.',
  },
  {
    id: 'keys',
    title: 'Keys',
    topics: ['C4', 'I3'],
    unlocksAfter: 'The musical alphabet',
    track: 'core',
    summary: 'Major scale construction and degrees, the circle of fifths and key signatures.',
  },
  {
    id: 'chords',
    title: 'Chords',
    topics: ['C5'],
    unlocksAfter: 'Intervals and Keys',
    track: 'core',
    summary: 'Triads, then 7th chords, then sus and add chords.',
    misconception: 'The b7 in “7” is not the 7 in “maj7”.',
  },
  {
    id: 'harmony',
    title: 'Harmony',
    topics: ['C8'],
    unlocksAfter: 'Keys and triads',
    track: 'core',
    summary: 'Diatonic chords in any key, Roman and Nashville numerals.',
  },
  {
    id: 'progressions',
    title: 'Progressions',
    topics: ['C9', 'C10'],
    unlocksAfter: 'Harmony',
    track: 'core',
    summary: 'Common progressions, capo and transposition, and hearing them.',
    misconception: 'I–V–vi–IV and vi–IV–I–V are rotations of each other.',
  },
  {
    id: 'caged',
    title: 'CAGED',
    topics: ['C6'],
    unlocksAfter: 'Natural notes and triads',
    track: 'core',
    summary: 'The five shapes from their triad cores, chaining and root finding.',
    misconception: 'CAGED is a map, not five grips to memorise, and it doesn’t replace note names.',
  },
  {
    id: 'pentatonic',
    title: 'Pentatonic',
    topics: ['C7'],
    unlocksAfter: 'CAGED',
    track: 'core',
    summary: 'Pentatonic boxes linked to CAGED shapes, and the relative minor.',
    misconception: '“Box prison”: hear the root and move between boxes.',
  },
  {
    id: 'triads',
    title: 'Triads',
    topics: ['I1'],
    unlocksAfter: 'CAGED and chords',
    track: 'core',
    summary: 'Triads and inversions on every string set, and voice leading.',
    misconception: 'Triads are the cores of the CAGED shapes, not a new set of shapes.',
  },
  {
    id: 'arpeggios',
    title: 'Arpeggios',
    topics: ['I2'],
    unlocksAfter: 'CAGED and pentatonic',
    track: 'core',
    summary: 'Chord tones inside shapes and boxes, and target notes.',
  },
  {
    id: 'minor-function',
    title: 'Minor and function',
    topics: ['I4', 'I5'],
    unlocksAfter: 'Progressions',
    track: 'core',
    summary: 'Minor-key harmony, chord function and substitution.',
    misconception: 'E7 does belong in A minor: it is the harmonic-minor V.',
  },
  {
    id: 'scales',
    title: 'Scales',
    topics: ['I7'],
    unlocksAfter: 'CAGED',
    track: 'core',
    summary: 'The major scale in five positions, from any degree.',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    topics: [],
    unlocksAfter: null,
    track: 'optional',
    summary: 'Modes, drop-2 voicings and reharmonisation.',
  },
  {
    id: 'rhythm',
    title: 'Rhythm',
    topics: ['F4'],
    unlocksAfter: null,
    track: 'parallel',
    summary: 'Tap and strum timing against a click.',
    misconception: 'Theory-heavy learners neglect timing.',
  },
  {
    // Design §5 also lists I6 progression ear under Progressions. Each topic
    // belongs to one module here, so I6 lives only in Ear; the songs profile
    // promotes Ear as well, which keeps progression ear near Progressions.
    id: 'ear',
    title: 'Ear',
    topics: ['I6'],
    unlocksAfter: null,
    track: 'parallel',
    summary: 'Hear intervals, chord quality and progressions, from day one.',
  },
  {
    id: 'meter',
    title: 'Meter',
    topics: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
    unlocksAfter: 'Rhythm',
    track: 'future',
    summary: 'Time signatures, simple vs compound meter, counting and meter by ear.',
  },
  {
    id: 'reading',
    title: 'Reading',
    topics: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'],
    unlocksAfter: 'Natural notes on strings 6 and 5, and time signatures',
    track: 'future',
    summary: 'Staff reading for guitar, staff ↔ fretboard by position, and sight-reading.',
  },
];

const BY_TOPIC = new Map(MODULES.flatMap((m) => m.topics.map((t) => [t, m] as const)));
const DEFAULT_INDEX = new Map(MODULES.map((m, i) => [m.id, i]));

export function moduleOfTopic(topic: string): Module | undefined {
  return BY_TOPIC.get(topic);
}

/**
 * The goal profile (design §4, research/02 personalisation): modules each
 * goal promotes to the front, in order. Every other module keeps its default
 * place behind them. Only the order changes: gating still decides what is on
 * the frontier, and spacing and retrieval stay on for every goal (rule 16).
 */
export const GOAL_PROFILES: Readonly<Record<Goal, readonly string[]>> = {
  // Songs drive motivation: harmony and progressions open early (design §5).
  songs: ['harmony', 'progressions', 'chords', 'keys', 'ear', 'rhythm'],
  // Rock and blues soloing lives in boxes and shapes over the root.
  improvise: ['pentatonic', 'caged', 'intervals', 'arpeggios', 'scales'],
  // Jazz is chord-tone and function heavy, and reading is promoted (research/03 track R).
  jazz: ['harmony', 'chords', 'intervals', 'keys', 'arpeggios', 'minor-function', 'reading'],
  general: [],
};

/** A module's priority under a goal: lower comes first. */
export function moduleRank(moduleId: string, goal: Goal): number {
  const promoted = GOAL_PROFILES[goal];
  const i = promoted.indexOf(moduleId);
  if (i >= 0) return i;
  const d = DEFAULT_INDEX.get(moduleId);
  return d === undefined ? Number.POSITIVE_INFINITY : promoted.length + d;
}

/** Every module, ordered for a goal (the Learn map). */
export function orderModules(goal: Goal, modules: readonly Module[] = MODULES): Module[] {
  return [...modules].sort((a, b) => compare(moduleRank(a.id, goal), moduleRank(b.id, goal)));
}

/** Like `a - b`, but safe for two infinite ranks. */
function compare(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function skillRank(skill: Skill, goal: Goal): number {
  const m = moduleOfTopic(skill.topic);
  return m ? moduleRank(m.id, goal) : Number.POSITIVE_INFINITY;
}

/**
 * Frontier skills ordered by the goal profile: by module priority, then the
 * skill's default `order`, then ID. Pure and stable; it reorders only, so
 * the session builder's `frontier` input still holds only unlocked skills.
 */
export function orderFrontier(skills: readonly Skill[], goal: Goal): Skill[] {
  return [...skills].sort((a, b) => {
    return (
      compare(skillRank(a, goal), skillRank(b, goal)) ||
      a.order - b.order ||
      a.id.localeCompare(b.id)
    );
  });
}
