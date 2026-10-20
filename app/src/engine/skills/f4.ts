import {
  strumRhythmItemId,
  tapRhythmItemId,
  type StrumPattern,
  type TapPattern,
} from '../items/rhythm-pattern';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * F4: rhythm basics, the parallel rhythm track (design §5; research/03:
 * "pulse, subdivision, counting", "tap within ±30ms of a click"). Every card
 * is a one-bar rhythm played twice against the timing engine's click (D20).
 * The tempo comes from D20's adaptive scope, so a card is the rhythm itself,
 * met at many tempos (research/02 rule 12).
 *
 * The pulse comes first, then subdividing it into eighths, then rhythms
 * that sit off the beat. Strumming patterns come last: the arm keeps moving
 * down on every beat and up on every "&", so they are the eighth grid with
 * some strokes missed. They're tapped, or strummed on a real guitar in mic
 * mode.
 *
 * F4 sits on its own track with no prerequisite, so no core skill waits on
 * it. Timing is practice, not something to place out of, and the placement
 * test has no click: every skill skips it.
 */

const DRILLS = ['tap-strum-rhythm'];

const tap = (patterns: readonly TapPattern[]) => patterns.map(tapRhythmItemId);
const strum = (patterns: readonly StrumPattern[]) => patterns.map(strumRhythmItemId);

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  ids: readonly string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'F4.pulse',
    title: 'Keep the pulse: tap on the beat',
    prerequisites: [],
    ids: tap(['quarters', 'half-notes', 'backbeat']),
  },
  {
    id: 'F4.eighths',
    title: 'Subdivide the beat: eighth notes and the "&"',
    prerequisites: ['F4.pulse'],
    ids: tap(['eighths', 'offbeats', 'quarter-eighths']),
  },
  {
    id: 'F4.syncopation',
    title: 'Off the beat: syncopated rhythms',
    prerequisites: ['F4.eighths'],
    ids: tap(['charleston', 'tresillo', 'push-4']),
  },
  {
    id: 'F4.strumming',
    title: 'Strumming patterns: down on the beat, up on the "&"',
    prerequisites: ['F4.eighths'],
    ids: strum(['down-quarters', 'down-up-eighths', 'd-du-udu']),
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'F4',
  // After F3, among the foundations; the module's track ranks it in the frontier.
  order: 400 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  softUnlock: g.prerequisites.length > 0,
  skipPlacement: true,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, g.ids)),
}));
