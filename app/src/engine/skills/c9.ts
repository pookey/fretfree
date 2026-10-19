import { progressionItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C9: common progressions (research/03: "play in any key; recognise from a
 * chart"). Two cards per catalogue progression (D12, drag):
 *
 * - `prog:I-V-vi-IV:build`: fill its slots with chords in a key;
 * - `prog:I-V-vi-IV:transpose`: move its chart to another key.
 *
 * The keys vary per prompt, so each card meets its progression in many keys
 * (research/02 rule 12). Within a skill every build comes before the
 * transpositions, so a progression is built before its chart is moved.
 *
 * I–V–vi–IV and vi–IV–I–V are rotations of each other, the C9 misconception
 * (research/03). They share a skill and are introduced back to back, and the
 * drill keys them `prog:I-V-vi-IV` and `prog:vi-IV-I-V`, the seed pair the
 * session interleaves (rule 6).
 */

const DRILLS = ['progression-builder'];

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  softUnlock?: boolean;
  progressions: readonly string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'C9.pop',
    title: 'Progressions: pop and rock',
    // Rule 7: chord construction → progressions. The chords sit on the key's
    // degrees (C4) and are major and minor triads (C5).
    prerequisites: ['C4.flat-key-degrees', 'C5.triads'],
    progressions: ['I-IV-V', 'I-V-vi-IV', 'vi-IV-I-V', 'I-vi-IV-V'],
  },
  {
    id: 'C9.ii-V-I',
    title: 'Progressions: ii–V–I',
    prerequisites: ['C9.pop'],
    softUnlock: true,
    progressions: ['ii-V-I'],
  },
  {
    id: 'C9.blues',
    title: 'Progressions: 12-bar blues',
    // Every bar is a dominant 7 chord.
    prerequisites: ['C9.pop', 'C5.sevenths'],
    softUnlock: true,
    progressions: ['12-bar-blues', '12-bar-blues-quick-change'],
  },
  {
    id: 'C9.minor',
    title: 'Progressions: minor keys',
    prerequisites: ['C9.pop'],
    softUnlock: true,
    progressions: ['i-bVII-bVI-bVII'],
  },
];

function ids(progressions: readonly string[]): string[] {
  return (['build', 'transpose'] as const).flatMap((task) =>
    progressions.map((p) => progressionItemId(p, task)),
  );
}

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C9',
  // After C8's numerals (1598–1599) and before CAGED at 1600: research/03
  // opens progressions early.
  order: 1599.2 + i * 0.2,
  title: g.title,
  prerequisites: g.prerequisites,
  ...(g.softUnlock ? { softUnlock: true } : {}),
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, ids(g.progressions))),
}));
