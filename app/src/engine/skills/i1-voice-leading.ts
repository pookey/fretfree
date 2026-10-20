import type { StringSetLow } from '../items/inversion';
import { VOICE_LEAD_MOVES, voiceLeadItemId } from '../items/voice-lead';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * I1 voice leading (research/03: "voice-lead I–IV–V"; the voice-leading
 * puzzle). One card per move between two of I, IV and V on a string set:
 * `voice-lead:I-IV@s3` draws a I triad on strings 3–1 and asks for the IV
 * nearest it. Each move is a card both ways, I → IV and IV → I (research/02
 * rule 1). D19 picks the key, the I's inversion and the neck position per
 * prompt (rule 12).
 *
 * Within each set the progression I–IV–V–I comes first, then the moves
 * back. The top sets open once their inversions are mastered (rule 7: the
 * puzzle moves between the inversions D18 teaches), the low sets once
 * theirs are known too.
 */

const DRILLS = ['voice-leading'];

function setItems(sets: readonly StringSetLow[]): string[] {
  return sets.flatMap((low) =>
    VOICE_LEAD_MOVES.map(([from, to]) => voiceLeadItemId(from, to, low)),
  );
}

export const skills: Skill[] = [
  {
    id: 'I1.voice-leading-top-sets',
    topic: 'I1',
    // After I1's inversions (1800–1830), before C10.
    order: 1840,
    title: 'Voice-lead I–IV–V: strings 3–1 and 4–2',
    prerequisites: ['I1.major-top-sets'],
    softUnlock: false,
    drillTypes: DRILLS,
    items: memo(() => itemsOf('I1.voice-leading-top-sets', setItems([3, 4]))),
  },
  {
    id: 'I1.voice-leading-low-sets',
    topic: 'I1',
    order: 1850,
    title: 'Voice-lead I–IV–V: strings 5–3 and 6–4',
    prerequisites: ['I1.major-low-sets', 'I1.voice-leading-top-sets'],
    softUnlock: true,
    drillTypes: DRILLS,
    items: memo(() => itemsOf('I1.voice-leading-low-sets', setItems([5, 6]))),
  },
];
