import type { ItemKind, ItemRefs } from '../model';
import { STRING_SETS, type StringSetLow } from './inversion';

declare module '../model' {
  interface ItemRefs {
    'voice-lead': {
      kind: 'voice-lead';
      from: VoiceLeadChord;
      to: VoiceLeadChord;
      /** The string set's lowest-pitched string: 3 for strings 3–1, 6 for 6–4. */
      lowString: StringSetLow;
    };
  }
}

/** The three primary chords of a major key, as Roman numerals. */
export type VoiceLeadChord = 'I' | 'IV' | 'V';

export const VOICE_LEAD_CHORDS: readonly VoiceLeadChord[] = ['I', 'IV', 'V'];

/**
 * Every move between two of I, IV and V: the progression I–IV–V–I first,
 * then each move the other way (research/02 rule 1: both directions).
 */
export const VOICE_LEAD_MOVES: readonly (readonly [VoiceLeadChord, VoiceLeadChord])[] = [
  ['I', 'IV'],
  ['IV', 'V'],
  ['V', 'I'],
  ['IV', 'I'],
  ['V', 'IV'],
  ['I', 'V'],
];

const VOICE_LEAD_ITEM = /^voice-lead:(I|IV|V)-(I|IV|V)@s([3-6])$/;

/**
 * `voice-lead:I-IV@s3`: from a I triad drawn on strings 3–1, tap the IV
 * nearest it on the same strings (I1, research/03: "voice-lead I–IV–V").
 * The key, the I's inversion and the neck position vary per prompt, so one
 * card holds the move in every key and inversion (research/02 rule 12).
 */
export function voiceLeadItemId(
  from: VoiceLeadChord,
  to: VoiceLeadChord,
  lowString: StringSetLow,
): string {
  if (!VOICE_LEAD_CHORDS.includes(from) || !VOICE_LEAD_CHORDS.includes(to) || from === to) {
    throw new RangeError(`Invalid voice-leading move: ${String(from)} → ${String(to)}`);
  }
  if (!STRING_SETS.includes(lowString)) {
    throw new RangeError(`No string set starts at string ${String(lowString)}`);
  }
  return `voice-lead:${from}-${to}@s${lowString}`;
}

export function parseVoiceLeadItemId(id: string): ItemRefs['voice-lead'] | null {
  const m = VOICE_LEAD_ITEM.exec(id);
  if (!m || m[1] === m[2]) return null;
  return {
    kind: 'voice-lead',
    from: m[1] as VoiceLeadChord,
    to: m[2] as VoiceLeadChord,
    lowString: Number(m[3]) as StringSetLow,
  };
}

export default {
  kinds: ['voice-lead'],
  id: (ref) => voiceLeadItemId(ref.from, ref.to, ref.lowString),
  parse: parseVoiceLeadItemId,
} satisfies ItemKind<ItemRefs['voice-lead']>;
