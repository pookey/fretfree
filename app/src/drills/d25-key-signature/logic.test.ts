import { describe, expect, it } from 'vitest';
import { keyApplyItemId } from '../../engine/items/key-apply';
import { SKILLS } from '../../engine/skills';
import { r3Letters } from '../../engine/skills/r3';
import {
  DROP_D_TUNING,
  READING_POSITIONS,
  STANDARD_TUNING,
  midiAt,
  noteAtStaffPosition,
  staffPosition,
  type Tuning,
} from '../../theory';
import { getDrill } from '../registry';
import type { DrillCheck } from '../types';
import {
  D25_ID,
  d25CanTest,
  d25Check,
  d25ConceptOf,
  d25DescribeAnswer,
  d25FeedbackPositions,
  d25KeyToAnswer,
  d25KeysFor,
  d25MakePrompt,
  d25NeckPositions,
  d25Places,
  d25Positions,
  d25Sounds,
  givenNote,
  nearestSignature,
  placePosition,
  positionFor,
  pretty,
  type D25Prompt,
} from './logic';

const item = (letter: string, alteration: number) => ({
  id: keyApplyItemId(letter, alteration),
  skillId: 'R3.sharps-few',
});

const ctx = (scopeLevel = 0, r = 0, tuning: Tuning = STANDARD_TUNING) => ({
  tuning,
  accidentalPref: 'sharp' as const,
  scopeLevel,
  rng: () => r,
});

const prompt = (letter: string, alteration: number, scopeLevel = 0, r = 0): D25Prompt =>
  d25MakePrompt(item(letter, alteration), ctx(scopeLevel, r));

const fb = (p: D25Prompt, answer: string) => ({ answer, result: d25Check(p, answer) });

describe('D25 read the key signature', () => {
  it('is registered for every R3 skill and tests only key-apply cards', () => {
    const drill = getDrill(D25_ID)!;
    expect(drill.skills).toEqual(SKILLS.filter((s) => s.topic === 'R3').map((s) => s.id));
    expect(d25CanTest(item('F', 2))).toBe(true);
    expect(d25CanTest({ id: 'key-signature:D', skillId: 'I3.sharp-signatures' })).toBe(false);
    expect(d25ConceptOf(item('F', -7))).toBe('key-apply:F@7b');
    expect(d25ConceptOf({ id: 'signature-key:2#', skillId: 'x' })).toBeNull();
    expect(() => d25MakePrompt({ id: 'signature-key:2#', skillId: 'x' }, ctx())).toThrow();
  });

  it('writes the note with no accidental and asks its three spellings', () => {
    const p = prompt('F', 2);
    expect(p).toMatchObject({
      itemId: 'key-apply:F@2#',
      letter: 'F',
      alteration: 2,
      tonic: 'D',
      answer: 'F#',
      choices: ['Fb', 'F', 'F#'],
    });
    // Scope 0, first place: the bottom space, F4 written (F3 sounding).
    expect(p.note).toBe('F#3');
    expect(prompt('G', 2).answer).toBe('G');
    expect(prompt('B', -1)).toMatchObject({ tonic: 'F', answer: 'Bb' });
    expect(prompt('F', -7)).toMatchObject({ tonic: 'Cb', answer: 'Fb' });
    expect(prompt('B', 7)).toMatchObject({ tonic: 'C#', answer: 'B#' });
    expect(prompt('C', 0)).toMatchObject({ tonic: 'C', answer: 'C' });
  });

  it('answers every R3 card with its signature applied', () => {
    for (const s of SKILLS.filter((x) => x.topic === 'R3')) {
      for (const i of s.items()) {
        const p = d25MakePrompt(i, ctx(2, 0.5));
        expect(p.choices).toContain(p.answer);
        expect(p.answer.charAt(0)).toBe(p.letter);
        const at = r3Letters(p.alteration).indexOf(p.letter);
        const altered = at >= 0 && at < Math.abs(p.alteration);
        expect(p.answer.length > 1, i.id).toBe(altered);
      }
    }
  });

  it('moves the note between octaves, wider with scope', () => {
    expect(d25Positions('F', 0)).toEqual([1, 8]);
    expect(d25Positions('C', 0)).toEqual([5]);
    expect(d25Positions('E', 1)).toEqual([0, 7]);
    expect(d25Positions('E', 2)).toEqual([-7, 0, 7, 14]);
    // Out-of-range levels clamp.
    expect(d25Positions('E', 9)).toEqual(d25Positions('E', 2));
    expect(d25Positions('E', -1)).toEqual(d25Positions('E', 0));
    for (let level = 0; level <= 2; level++) {
      for (const letter of 'ABCDEFG') expect(d25Positions(letter, level).length).toBeGreaterThan(0);
    }
    const low = prompt('E', 4, 2, 0);
    const high = prompt('E', 4, 2, 0.999);
    // Low E (three ledger lines down) is left out: its E♭ is below the low string.
    expect(low.note).toBe('E3');
    expect(staffPosition(high.note)).toBe(14);
    expect(high.note).toBe('E5');
    expect(noteAtStaffPosition(staffPosition(prompt('A', 3, 1, 0.5).note))).toMatch(/^A/);
  });

  it('places the note in the lowest reading position that plays every spelling', () => {
    expect(prompt('E', 4, 2, 0).position?.id).toBe('open');
    // E♭5, E5 and F5 are frets 11–13 on string 1: 9th position, with a stretch.
    expect(prompt('E', 4, 2, 0.999).position?.id).toBe('pos9');
    // A4: A♭ is in open position, but A and A♯ need the 5th.
    expect(placePosition(10)?.id).toBe('pos5');
    // F5: F♯5 (fret 14) needs the 12th, so F♮ is shown there too.
    expect(placePosition(15)?.id).toBe('pos12');
    // Off the neck either way: no position.
    expect(placePosition(-20)).toBeNull();
    expect(positionFor(midiAt({ string: 1, fret: 7 }))?.id).toBe('pos5');
    // Nothing plays below low E in standard tuning, or far above the neck.
    expect(positionFor(30)).toBeNull();
    expect(positionFor(100)).toBeNull();
  });

  it('shows the same staff spots and positions whatever the signature (no clue before the answer)', () => {
    for (const letter of 'ABCDEFG') {
      for (let level = 0; level <= 2; level++) {
        const spots = d25Places(letter, level);
        spots.forEach((spot, i) => {
          const r = (i + 0.5) / spots.length;
          const shown = new Set<string>();
          for (let a = -7; a <= 7; a++) {
            const p = d25MakePrompt(item(letter, a), ctx(level, r));
            expect(staffPosition(p.note), `${letter}@${a}`).toBe(spot);
            shown.add(p.position?.id ?? 'none');
          }
          expect([...shown], `${letter} at ${spot}`).toHaveLength(1);
          expect(shown.has('none'), `${letter} at ${spot}`).toBe(false);
        });
      }
    }
    // Low E is left out for every signature, not only where it would be E♭.
    expect(d25Places('E', 2)).toEqual([0, 7, 14]);
    expect(d25Places('E', 2, DROP_D_TUNING)).toEqual([-7, 0, 7, 14]);
  });

  it('grades the spelling and keys a wrong one by the signature that would make it right', () => {
    const p = prompt('F', 1);
    expect(d25Check(p, 'F#')).toEqual<DrillCheck>({
      correct: true,
      expected: 'F♯',
      concept: 'key-apply:F@1#',
    });
    expect(d25Check(p, 'F')).toEqual<DrillCheck>({
      correct: false,
      expected: 'F♯',
      concept: 'key-apply:F@1#',
      confusedWith: 'key-apply:F@0',
    });
    expect(d25Check(p, 'Fb').confusedWith).toBe('key-apply:F@7b');
    expect(d25Check(prompt('G', 2), 'G#').confusedWith).toBe('key-apply:G@3#');
    expect(d25Check(prompt('E', -1), 'Eb').confusedWith).toBe('key-apply:E@2b');
    expect(d25Check(p, 'nonsense')).toEqual({
      correct: false,
      expected: 'F♯',
      concept: 'key-apply:F@1#',
    });
    expect(d25DescribeAnswer('F#')).toBe('F#');
  });

  it('finds the nearest signature for any spelling, and its card exists', () => {
    expect(nearestSignature('F', 0, 1)).toBe(0);
    expect(nearestSignature('B', 1, -2)).toBe(7);
    expect(nearestSignature('F', 2, 0)).toBeNull();
    const cards = new Set(SKILLS.filter((s) => s.topic === 'R3').flatMap((s) => s.items()));
    const ids = new Set([...cards].map((i) => i.id));
    for (const i of cards) {
      const p = d25MakePrompt(i, ctx());
      for (const c of p.choices.filter((x) => x !== p.answer)) {
        const other = d25Check(p, c).confusedWith;
        expect(other, `${i.id} → ${c}`).toBeDefined();
        expect(ids.has(other!), `${i.id} → ${c}: ${other}`).toBe(true);
      }
    }
  });

  it('plays the note, and the chosen spelling when wrong', () => {
    const p = prompt('F', 1);
    expect(d25Sounds(p, fb(p, 'F#'))).toEqual({ expected: ['F#3'] });
    expect(d25Sounds(p, fb(p, 'F'))).toEqual({ expected: ['F#3'], given: ['F3'] });
    // Flats play as their sharp twins: F♭3 is E3.
    expect(d25Sounds(p, fb(p, 'Fb'))).toEqual({ expected: ['F#3'], given: ['E3'] });
    const cb = prompt('C', -7);
    expect(cb.note).toBe('Cb4');
    expect(d25Sounds(cb, fb(cb, 'Cb'))).toEqual({ expected: ['B3'] });
    expect(givenNote(cb, 'C#')).toBe('C#4');
    expect(d25Sounds(p, { answer: 'X', result: { correct: false, expected: 'F♯' } })).toEqual({
      expected: ['F#3'],
    });
  });

  it('shows the note’s fret, and the chosen one’s in the same position', () => {
    const p = prompt('F', 1);
    expect(p.position?.id).toBe('open');
    expect(d25FeedbackPositions(p, fb(p, 'F#'), STANDARD_TUNING)).toEqual({
      expected: [{ string: 4, fret: 4 }],
      given: [],
    });
    expect(d25FeedbackPositions(p, fb(p, 'F'), STANDARD_TUNING)).toEqual({
      expected: [{ string: 4, fret: 4 }],
      given: [{ string: 4, fret: 3 }],
    });
    // The worked example shows the note alone.
    expect(d25NeckPositions(p, null, STANDARD_TUNING).given).toEqual([]);
    expect(d25NeckPositions(p, 'F#', STANDARD_TUNING).given).toEqual([]);
  });

  it('keeps the note on the neck: nothing under low E', () => {
    // E♭ under 2 flats: E♭2 is below the low string, so the lowest is E♭3.
    expect(prompt('E', -2, 2, 0).note).toBe('Eb3');
    // The top of the range, the space above three ledger lines: F5, fret 13.
    expect(prompt('F', 0, 2, 0.999).note).toBe('F5');
    expect(prompt('F', 1, 2, 0.999).position?.id).toBe('pos12');
    expect(prompt('F', 0, 2, 0.999).position?.id).toBe('pos12');
    // Drop D reaches E♭2.
    const drop = d25MakePrompt(item('E', -2), ctx(2, 0, DROP_D_TUNING));
    expect(drop.note).toBe('Eb2');
    expect(drop.position?.id).toBe('open');
    expect(d25NeckPositions(drop, null, DROP_D_TUNING).expected).toEqual([{ string: 6, fret: 1 }]);
  });

  it('finds the chosen spelling in another position when the prompt’s lacks it', () => {
    const p = { ...prompt('E', -2, 2, 0), note: 'Eb2', position: null };
    expect(d25NeckPositions(p, 'E', STANDARD_TUNING)).toEqual({
      expected: [],
      given: [{ string: 6, fret: 0 }],
    });
    // Out of the prompt's position, the chosen spelling's own is found.
    const low = { ...prompt('E', 4), note: 'E2', position: READING_POSITIONS[1]! };
    expect(d25NeckPositions(low, 'E#', STANDARD_TUNING)).toEqual({
      expected: [{ string: 6, fret: 0 }],
      given: [{ string: 6, fret: 1 }],
    });
  });

  it('answers from a hardware keyboard by position or by sign', () => {
    const choices = ['Fb', 'F', 'F#'];
    expect(d25KeyToAnswer('1', choices)).toBe('Fb');
    expect(d25KeyToAnswer('3', choices)).toBe('F#');
    expect(d25KeyToAnswer('b', choices)).toBe('Fb');
    expect(d25KeyToAnswer('N', choices)).toBe('F');
    expect(d25KeyToAnswer('#', choices)).toBe('F#');
    expect(d25KeyToAnswer('4', choices)).toBeNull();
    expect(d25KeyToAnswer('x', choices)).toBeNull();
    expect(d25KeysFor(0)).toBe('1 b');
    expect(d25KeysFor(2)).toBe('3 #');
    expect(d25KeysFor(3)).toBeUndefined();
  });

  it('prints sharps and flats as signs', () => {
    expect(pretty('F#')).toBe('F♯');
    expect(pretty('Bb')).toBe('B♭');
    expect(pretty('B')).toBe('B');
  });
});
