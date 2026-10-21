import { ENGINE_CONFIG } from './config';
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
    summary:
      'Name the notes on the two low strings without counting, and find your place from the fret markers. Everything else on the neck is measured from these.',
    misconception:
      'There’s no sharp or flat between B and C, or between E and F. And when you name a fret, recall it: don’t count up from the nut.',
  },
  {
    id: 'notes-2',
    title: 'Whole neck',
    topics: ['C1', 'C2'],
    unlocksAfter: 'Neck basics: the natural notes on strings 6 and 5',
    track: 'core',
    summary:
      'Find any note on any string, and every octave of it, so the whole neck is yours, not just the first few frets.',
    misconception:
      'Give frets 7–12 on strings 2–4 extra attention: they’re the ones most players skip. And watch the G–B shift: an octave shape that crosses from G to B moves up one fret.',
  },
  {
    id: 'intervals',
    title: 'Intervals',
    topics: ['C3'],
    unlocksAfter: 'Half and whole steps, and octave shapes',
    track: 'core',
    summary:
      'Find any interval from any root as a shape, so chords and scales stop being grips you memorise.',
    misconception:
      'When an interval shape crosses from the G string to the B string, move the top note up one fret.',
  },
  {
    id: 'keys',
    title: 'Keys',
    topics: ['C4'],
    unlocksAfter: 'Half and whole steps',
    track: 'core',
    summary:
      'Spell the major scale of every key and name any note in it by number, such as the 6th of E♭.',
    misconception:
      'Use each letter once when you spell a major scale: F♯ major has E♯, not F, so no letter is skipped or doubled.',
  },
  {
    id: 'chords',
    title: 'Chords',
    topics: ['C5'],
    unlocksAfter: '3rds (Intervals) and the sharp keys (Keys)',
    track: 'core',
    summary:
      'Spell any triad or 7th chord, and see which note in a chord shape is the root, 3rd, 5th or 7th.',
    misconception:
      'Don’t mix up the ♭7 in a “7” chord with the 7 in a “maj7”: G7 has F, Gmaj7 has F♯.',
  },
  {
    id: 'harmony',
    title: 'Harmony',
    topics: ['C8'],
    unlocksAfter: 'Triads (Chords) and scale degrees (Keys)',
    track: 'core',
    summary:
      'Name the chords of any major key by number, so a chart in Roman or Nashville numerals plays in any key.',
    misconception:
      'Expect the vi chord to be minor even though the key is major: each chord’s quality comes from the scale, not from the key’s name.',
  },
  {
    // I3 is an intermediate topic (research/03). Its own module, after
    // Harmony, keeps signatures out of the front of the Keys lane, so they no
    // longer queue behind every C4 item or come before the first chords.
    id: 'key-signatures',
    title: 'Key signatures',
    topics: ['I3'],
    unlocksAfter: 'The sharp keys (Keys); it doesn’t wait for Harmony',
    track: 'core',
    summary:
      'Say how many sharps or flats any major key has, and give its V and its relative minor from the circle of fifths.',
    misconception:
      'A key signature tells you which notes are sharp or flat. It doesn’t tell you which chord a song starts on.',
  },
  {
    id: 'progressions',
    title: 'Progressions',
    topics: ['C9', 'C10'],
    unlocksAfter: 'Triads and Roman numerals; the capo skills need only triads and the sharp keys',
    track: 'core',
    summary:
      'Build the progressions most songs use, in any key, and work out where to put a capo to play them.',
    misconception:
      'You may hear I–V–vi–IV and vi–IV–I–V as different songs, but they’re the same four chords, started in a different place.',
  },
  {
    id: 'caged',
    title: 'CAGED',
    topics: ['C6'],
    unlocksAfter: 'The natural notes on strings 6 and 5, and triads',
    track: 'core',
    summary:
      'Play one chord in five places up the neck with the CAGED shapes, and find its root in each.',
    misconception:
      'Remember that CAGED is a map of the neck, not five grips to memorise, and keep naming the notes: CAGED doesn’t replace them.',
  },
  {
    id: 'pentatonic',
    title: 'Pentatonic',
    topics: ['C7'],
    unlocksAfter: 'The minor CAGED cores',
    track: 'core',
    summary:
      'Play the pentatonic scale all over the neck, each box linked to a chord shape you already know.',
    misconception:
      'Don’t get stuck in one box. Find the root by ear, then slide to the next box from it.',
  },
  {
    id: 'triads',
    title: 'Triads',
    topics: ['I1'],
    unlocksAfter: 'The CAGED triad cores',
    track: 'core',
    summary:
      'Play any major or minor triad in every inversion on four sets of strings, and move between chords smoothly.',
    misconception:
      'You don’t need a new set of shapes: each of these triads is the core of a CAGED shape you know.',
  },
  {
    id: 'arpeggios',
    title: 'Arpeggios',
    topics: ['I2'],
    unlocksAfter:
      'The 3rd and 7th in 7th-chord shapes (Chords), the dominant 7 CAGED shapes and the minor pentatonic boxes',
    track: 'core',
    summary:
      'Find every note of a 7th chord inside the shapes and boxes you know, so a solo can land on chord tones.',
  },
  {
    id: 'minor-function',
    title: 'Minor and function',
    topics: ['I4', 'I5'],
    unlocksAfter: 'Pop and minor-key progressions',
    track: 'core',
    summary: 'Make sense of minor keys and of chords from outside the key, such as E7 in A minor.',
    misconception:
      'You’ll meet E7 in A minor songs, and it belongs there: it’s the V chord of the harmonic minor scale.',
  },
  {
    id: 'scales',
    title: 'Scales',
    topics: ['I7'],
    unlocksAfter: 'The major pentatonic boxes, which build on CAGED',
    track: 'core',
    summary:
      'Play the full major scale in five positions up the neck, starting from any note of it.',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    topics: [],
    unlocksAfter: null,
    track: 'optional',
    summary: 'Colour what you play with modes, drop-2 voicings and reharmonisation.',
  },
  {
    id: 'rhythm',
    title: 'Rhythm',
    topics: ['F4'],
    unlocksAfter: null,
    track: 'parallel',
    summary: 'Keep steady time with a click, tapping and strumming, from your first day.',
    misconception:
      'Knowing the notes isn’t playing in time. Keep tapping with the click even when the theory feels done.',
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
    summary: 'Recognise intervals, chord types and progressions by ear, from your first day.',
  },
  {
    id: 'meter',
    title: 'Meter',
    topics: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
    unlocksAfter: 'Rhythm',
    track: 'future',
    summary:
      'Read a time signature, feel simple and compound meter apart, and count any bar aloud.',
  },
  {
    id: 'reading',
    title: 'Reading',
    topics: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'],
    unlocksAfter: 'The natural notes on strings 6 and 5, and time signatures (Meter)',
    track: 'future',
    summary:
      'Read standard notation on the guitar, linking each note on the staff to a fret, and sight-read simple tunes.',
  },
  {
    // docs/design/tab-track.md §1: soft-unlocked for everyone; M9-05 promotes it.
    id: 'tab',
    title: 'Tab',
    topics: ['TAB'],
    unlocksAfter: 'The fret markers (Neck basics)',
    track: 'optional',
    summary:
      'Read any tab number as a place on the neck straight away, so learning a song from tab is quick.',
    misconception: 'Read the top line of tab as the high e string, not the low E.',
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

/**
 * Core modules on the neck itself. The neck lane draws from them, so the
 * fretboard keeps moving while a goal's modules lead (design §5, "open
 * early, in parallel").
 */
const NECK_MODULES: ReadonlySet<string> = new Set(['notes-1', 'notes-2']);

/** A lane of new material: frontier skills in today's order, with its share of new items. */
export interface FrontierLane {
  /** `goal`, `neck`, or a parallel track's module ID. */
  readonly id: string;
  readonly share: number;
  readonly skills: readonly Skill[];
  /** `parallel` for the Ear and Rhythm tracks, which take turns when the cap is short. */
  readonly group?: string;
}

export interface LaneOptions {
  /**
   * The learner's very first session: it stays Neck basics, so parallel
   * tracks wait, unless nothing else is open.
   */
  firstSession?: boolean;
  shares?: { goal: number; neck: number; parallel: number };
}

/**
 * Frontier skills split into session lanes (design §3.3 step 2, research/02
 * rules 6 and 13), each in `orderFrontier` order:
 *
 * - `goal`: every module that isn't on the neck or a parallel track, so its
 *   head is the first open goal-promoted module, or the first open one in
 *   default order for a goal that promotes none ("general").
 * - `neck`: the neck modules, Neck basics then Whole neck.
 * - one lane per open parallel track (Ear, Rhythm), sharing the parallel
 *   share, so both tracks get a turn when both are open.
 * - `later`: optional and future modules the goal doesn't promote (Tab
 *   until M9-05 promotes it for tab learners). Share 0: dealt only once no
 *   other lane can take more, as they came after everything in one queue.
 *
 * Lanes come in the order of their first skill, so the goal still decides
 * what a session opens with. Only lanes with skills are returned; the
 * session builder hands an empty lane's share to the rest.
 */
export function frontierLanes(
  skills: readonly Skill[],
  goal: Goal,
  { firstSession = false, shares = ENGINE_CONFIG.session.lanes }: LaneOptions = {},
): FrontierLane[] {
  const lanes = new Map<string, Skill[]>();
  const parallel = new Set<string>();
  const ordered = orderFrontier(skills, goal);
  const isParallel = (s: Skill) => moduleOfTopic(s.topic)?.track === 'parallel';
  const holdParallel = firstSession && ordered.some((s) => !isParallel(s));
  for (const skill of ordered) {
    const m = moduleOfTopic(skill.topic);
    if (m?.track === 'parallel' && holdParallel) continue;
    const later =
      (m?.track === 'optional' || m?.track === 'future') && !GOAL_PROFILES[goal].includes(m.id);
    const id =
      m?.track === 'parallel'
        ? m.id
        : m && NECK_MODULES.has(m.id)
          ? 'neck'
          : later
            ? 'later'
            : 'goal';
    if (m?.track === 'parallel') parallel.add(id);
    lanes.set(id, [...(lanes.get(id) ?? []), skill]);
  }
  const shareOf = (id: string) =>
    parallel.has(id)
      ? shares.parallel / parallel.size
      : id === 'neck'
        ? shares.neck
        : id === 'later'
          ? 0
          : shares.goal;
  return [...lanes].map(([id, laneSkills]) => ({
    id,
    share: shareOf(id),
    skills: laneSkills,
    ...(parallel.has(id) ? { group: 'parallel' } : {}),
  }));
}
