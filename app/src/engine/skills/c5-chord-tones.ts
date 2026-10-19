import type { ChordDegree, ChordKind } from '../../theory';
import { chordToneItemId, type Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * C5: chord tones inside a shape (research/03: "find the 3rd or b7 in a
 * shape"), drilled by D8. Each item is one degree of one chord kind, in both
 * directions: `chord-tone:b3@minor` taps the ♭3 in a minor shape, and
 * `chord-tone-name:b3@minor` names a ringed ♭3. The drill picks the shape
 * (open, barre or CAGED), root and position per prompt, so a card meets its
 * degree in many keys and voicings (research/02 rule 12).
 *
 * The root comes first, then the 3rd, the 5th and the 7th (user request,
 * 2026-10-18): the triad skill lists its roots, then its 3rds, then its 5ths,
 * and new items enter in that order. The 3rd and ♭3 share a skill and
 * interleave, as do the ♭7 and the 7 (rule 6); the drill keys them by
 * interval (`M3`/`m3`, `m7`/`M7`), so the interval seed pairs apply. The
 * seventh skill pairs each 7th with its chord's 3rd, the two notes that
 * decide a seventh chord's quality.
 *
 * Two stages, not one per degree, keep the placement test's expert run
 * within its 3-minute budget (one probe group per skill). The triad stage is
 * gated on the natural notes of strings 6 and 5, where the shapes root
 * (rule 7), and on spelling triads (C5), so neither soft-unlocks.
 */

const DRILLS = ['chord-tone'];

type Tone = readonly [ChordDegree, ChordKind];

interface Group {
  id: string;
  title: string;
  tones: readonly Tone[];
  prerequisites: readonly string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'C5.tones-triads',
    title: 'Find the root, 3rd and 5th in a chord shape',
    // Roots first; then major's 3rd next to minor's ♭3.
    tones: [
      ['1', 'major'],
      ['1', 'minor'],
      ['3', 'major'],
      ['b3', 'minor'],
      ['5', 'major'],
      ['5', 'minor'],
    ],
    prerequisites: ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads'],
  },
  {
    id: 'C5.tones-sevenths',
    title: 'Find the 3rd and 7th in 7th-chord shapes',
    // The ♭7 of 7 next to the 7 of maj7, each with its chord's 3rd.
    tones: [
      ['3', '7'],
      ['b7', '7'],
      ['3', 'maj7'],
      ['7', 'maj7'],
      ['b3', 'm7'],
      ['b7', 'm7'],
    ],
    prerequisites: ['C5.tones-triads', 'C5.sevenths'],
  },
];

/** Tap then name, per tone, so both directions of a fact enter together. */
function toneIds(tones: readonly Tone[]): string[] {
  return tones.flatMap(([degree, chord]) => [
    chordToneItemId('chord-tone', degree, chord),
    chordToneItemId('chord-tone-name', degree, chord),
  ]);
}

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'C5',
  order: 1530 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  drillTypes: DRILLS,
  items: memo(() => itemsOf(g.id, toneIds(g.tones))),
}));
