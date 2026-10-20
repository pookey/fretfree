import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, itemId, parseItemId } from '../model';
import { VOICE_LEAD_MOVES, parseVoiceLeadItemId, voiceLeadItemId } from './voice-lead';

describe('voice-lead item IDs', () => {
  it('builds and parses a move on a string set', () => {
    expect(voiceLeadItemId('I', 'IV', 3)).toBe('voice-lead:I-IV@s3');
    expect(parseVoiceLeadItemId('voice-lead:V-I@s6')).toEqual({
      kind: 'voice-lead',
      from: 'V',
      to: 'I',
      lowString: 6,
    });
    const ref = parseItemId('voice-lead:IV-V@s4');
    expect(ref).toEqual({ kind: 'voice-lead', from: 'IV', to: 'V', lowString: 4 });
    expect(itemId(ref!)).toBe('voice-lead:IV-V@s4');
    expect(ITEM_KINDS).toContain('voice-lead');
  });

  it('lists each of the six moves once, the progression first', () => {
    expect(VOICE_LEAD_MOVES.slice(0, 3)).toEqual([
      ['I', 'IV'],
      ['IV', 'V'],
      ['V', 'I'],
    ]);
    expect(new Set(VOICE_LEAD_MOVES.map((m) => m.join('-'))).size).toBe(6);
  });

  it('rejects a chord moving to itself, other chords and other string sets', () => {
    expect(() => voiceLeadItemId('I', 'I', 3)).toThrow(RangeError);
    expect(() => voiceLeadItemId('ii' as never, 'V', 3)).toThrow(RangeError);
    expect(() => voiceLeadItemId('I', 'V', 2 as never)).toThrow(RangeError);
    for (const bad of [
      'voice-lead:I-I@s3',
      'voice-lead:I-vi@s3',
      'voice-lead:I-IV@s2',
      'voice-lead:I-IV@s7',
      'voice-lead:I-IV',
      'voice-lead:I→IV@s3',
      'voice-leads:I-IV@s3',
    ]) {
      expect(parseVoiceLeadItemId(bad), bad).toBeNull();
    }
  });
});
