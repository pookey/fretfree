import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import { STANDARD_TUNING, midiAt, noteAtStaffPosition, staffNote } from '../../theory';
import type { DrillFeedback } from '../types';
import {
  SI_LABELS,
  siAnsweredPlace,
  siCheck,
  siDescribeAnswer,
  siExplain,
  siFeedbackPositions,
  siKeyToAnswer,
  siLabel,
  siMakePrompt,
  siPairOnNeck,
  siPhrase,
  siShape,
  siSizeOf,
  siSounds,
  siSpan,
  siTask,
  siWorkedExample,
  staffIntervalCanTest,
  staffIntervalConceptOf,
  type SIAnswer,
  type SIPrompt,
} from './logic';

/** A deterministic rng over a fixed list of values, cycling. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length] as number;
};

const make = (id: string, scopeLevel = 0, rng: () => number = () => 0) =>
  siMakePrompt(
    { id, skillId: 'R5.steps-skips' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng },
  );

const fb = (p: SIPrompt, answer: SIAnswer): DrillFeedback<SIAnswer> => ({
  answer,
  result: siCheck(p, answer),
});

describe('staff-interval meta', () => {
  it('tests treble 8vb interval cards, keyed by size', () => {
    const item = (id: string) => ({ id, skillId: 'R5.steps-skips' });
    expect(staffIntervalCanTest(item('staff-interval:+3@treble8vb'))).toBe(true);
    expect(staffIntervalCanTest(item('staff-interval:-8@treble8vb:place'))).toBe(true);
    expect(staffIntervalCanTest(item('staff-interval:+3@treble'))).toBe(false);
    expect(staffIntervalCanTest(item('staff:E4@treble8vb'))).toBe(false);
    expect(staffIntervalConceptOf(item('staff-interval:-3@treble8vb:place'))).toBe(
      'staff-interval:3',
    );
    expect(staffIntervalConceptOf(item('staff:E4@treble8vb'))).toBeNull();
  });
});

describe('siMakePrompt', () => {
  it('puts a reading pair on the staff, starting where the rng says', () => {
    const p = make('staff-interval:+3@treble8vb');
    expect(p).toMatchObject({
      direction: 'read',
      size: 3,
      up: true,
      // The lowest start whose 3rd stays in the span: the space below the staff.
      from: -1,
      to: 1,
      fromNote: 'D3',
      toNote: 'F3',
      phrase: [-1, 1],
      pairAt: 0,
      choices: SI_LABELS,
      range: [-1, 9],
    });
    const top = make('staff-interval:-8@treble8vb', 0, () => 0.999);
    expect(top).toMatchObject({ from: 9, to: 2, up: false, size: 8 });
  });

  it('varies the start note across prompts (rule 12), always inside the span', () => {
    const starts = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const p = make('staff-interval:+5@treble8vb', 0, () => i / 20);
      starts.add(p.from);
      expect(p.to - p.from).toBe(4);
      expect(p.from).toBeGreaterThanOrEqual(-1);
      expect(p.to).toBeLessThanOrEqual(9);
    }
    expect(starts.size).toBeGreaterThan(5);
  });

  it('widens to the ledger lines at the top scope level', () => {
    expect(siSpan(0)).toEqual([-1, 9]);
    expect(siSpan(1)).toEqual([-1, 9]);
    expect(siSpan(2)).toEqual([-7, 15]);
    const low = make('staff-interval:+2@treble8vb:place', 2);
    expect(low).toMatchObject({ from: -7, to: -6, fromNote: 'E2', range: [-7, 15] });
  });

  it('sets the pair in a phrase from scope level 1, for reading cards only', () => {
    const p = make('staff-interval:+3@treble8vb', 1, seq(0.5, 0.4, 0.3, 0.6, 0.2));
    expect(p.phrase).toHaveLength(ENGINE_CONFIG.staffIntervals.phraseLength);
    expect(p.phrase[p.pairAt]).toBe(p.from);
    expect(p.phrase[p.pairAt + 1]).toBe(p.to);
    // A placing card shows its start note alone.
    expect(make('staff-interval:+3@treble8vb:place', 1).phrase).toEqual([-1]);
  });

  it('refuses an item it cannot test', () => {
    expect(() => make('staff:E4@treble8vb')).toThrow(/cannot test/);
  });
});

describe('siPhrase', () => {
  it('surrounds the pair with neighbours that move, within the span and the leap', () => {
    for (let k = 0; k < 30; k++) {
      const rng = seq(k / 30, 0.13, 0.77, 0.42, 0.91, 0.05);
      const { phrase, pairAt } = siPhrase(2, 4, [-1, 9], rng);
      expect(phrase).toHaveLength(4);
      expect([phrase[pairAt], phrase[pairAt + 1]]).toEqual([2, 4]);
      for (let i = 1; i < phrase.length; i++) {
        const leap = Math.abs(phrase[i]! - phrase[i - 1]!);
        expect(leap).toBeGreaterThan(0);
        if (i !== pairAt + 1) expect(leap).toBeLessThanOrEqual(4);
      }
      for (const p of phrase) {
        expect(p).toBeGreaterThanOrEqual(-1);
        expect(p).toBeLessThanOrEqual(9);
      }
    }
  });

  it('puts the pair anywhere but past the end', () => {
    expect(siPhrase(0, 1, [-1, 9], () => 0).pairAt).toBe(0);
    expect(siPhrase(0, 1, [-1, 9], () => 0.99).pairAt).toBe(2);
  });
});

describe('siCheck', () => {
  it('grades a reading card by its label, and keys a miss by the size named', () => {
    const p = make('staff-interval:+3@treble8vb');
    expect(siCheck(p, '3rd')).toEqual({
      correct: true,
      expected: '3rd',
      concept: 'staff-interval:3',
    });
    expect(siCheck(p, '4th')).toEqual({
      correct: false,
      expected: '3rd',
      concept: 'staff-interval:3',
      confusedWith: 'staff-interval:4',
    });
    // Nothing a label doesn't name is a confusion.
    expect(siCheck(p, 'nonsense')).not.toHaveProperty('confusedWith');
    expect(siCheck(p, 3)).not.toHaveProperty('confusedWith');
  });

  it('grades a placing card by the tapped place', () => {
    const p = make('staff-interval:-2@treble8vb:place', 0, () => 0.5);
    expect(p).toMatchObject({ from: 5, to: 4 });
    expect(siCheck(p, 4)).toMatchObject({ correct: true, expected: 'B, on the 3rd line' });
    // A 3rd down, for a step down.
    expect(siCheck(p, 3)).toMatchObject({ correct: false, confusedWith: 'staff-interval:3' });
    // The right size the wrong way, the note itself, a label, and past an octave: no pair.
    expect(siCheck(p, 6)).not.toHaveProperty('confusedWith');
    expect(siCheck(p, 5)).not.toHaveProperty('confusedWith');
    expect(siCheck(p, '2nd')).not.toHaveProperty('confusedWith');
    const wide = make('staff-interval:+2@treble8vb:place', 2, () => 0);
    expect(siCheck(wide, 8)).not.toHaveProperty('confusedWith');
  });
});

describe('answers, sounds and the neck', () => {
  it('describes answers for the review log', () => {
    expect(siDescribeAnswer('3rd')).toBe('3rd');
    expect(siDescribeAnswer(7)).toBe('pos7');
  });

  it('maps labels to sizes and back', () => {
    expect(SI_LABELS.map(siSizeOf)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(siSizeOf('9th')).toBeNull();
    expect(siLabel(8)).toBe('Octave');
    expect(() => siLabel(9)).toThrow(RangeError);
  });

  it('finds the place an answer names', () => {
    const p = make('staff-interval:-3@treble8vb', 0, () => 0.5);
    expect(siAnsweredPlace(p, '4th')).toBe(p.from - 3);
    expect(siAnsweredPlace(p, 'nope')).toBeNull();
    expect(siAnsweredPlace(p, 2)).toBe(2);
    expect(siAnsweredPlace(p, 2.5)).toBeNull();
  });

  it('plays the pair, and after a miss the start and the place named', () => {
    const p = make('staff-interval:+3@treble8vb');
    expect(siSounds(p, fb(p, '3rd'))).toEqual({ expected: ['D3', 'F3'] });
    expect(siSounds(p, fb(p, '5th'))).toEqual({ expected: ['D3', 'F3'], given: ['D3', 'A3'] });
    // A miss that names nothing plays the pair alone.
    expect(siSounds(p, fb(p, 'nope'))).toEqual({ expected: ['D3', 'F3'] });
    // Nothing below open low E is played.
    const low = make('staff-interval:-2@treble8vb:place', 2);
    expect(low.to).toBe(-7);
    expect(siSounds(low, fb(low, -8))).toEqual({ expected: [low.fromNote, 'E2'] });
  });

  it('shows the pair in one reading position on the neck', () => {
    const pair = siPairOnNeck('G3', 'B3', STANDARD_TUNING)!;
    expect(pair).toEqual([
      { string: 3, fret: 0 },
      { string: 2, fret: 0 },
    ]);
    // Notes too far apart for one hand position aren't paired.
    expect(siPairOnNeck('E2', 'F5', STANDARD_TUNING)).toBeNull();
    const p = make('staff-interval:+3@treble8vb');
    const right = siFeedbackPositions(p, fb(p, '3rd'));
    expect(right.given).toEqual([]);
    expect(right.expected.map((c) => midiAt(c, STANDARD_TUNING))).toEqual([
      staffNote('D3').midi,
      staffNote('F3').midi,
    ]);
    const wrong = siFeedbackPositions(p, fb(p, '4th'));
    expect(wrong.given.map((c) => midiAt(c, STANDARD_TUNING))).toEqual([staffNote('G3').midi]);
    // The note itself, or a place below the guitar, isn't marked.
    const place = make('staff-interval:-2@treble8vb:place', 2);
    expect(siFeedbackPositions(place, fb(place, place.from)).given).toEqual([]);
    expect(siFeedbackPositions(place, fb(place, -9)).given).toEqual([]);
  });

  it('falls back to the lowest frets when no position holds the pair', () => {
    const p: SIPrompt = { ...make('staff-interval:+8@treble8vb'), fromNote: 'E2', toNote: 'F5' };
    const cells = siFeedbackPositions(p, fb(p, 'Octave'));
    expect(cells.expected).toEqual([
      { string: 6, fret: 0 },
      { string: 1, fret: 13 },
    ]);
  });

  it('marks a miss in the position of the pair, or its lowest fret', () => {
    const p = make('staff-interval:+2@treble8vb', 0, () => 0);
    // D3 → E3; a 7th up is C4.
    const cells = siFeedbackPositions(p, fb(p, '7th'));
    expect(cells.given.map((c) => midiAt(c, STANDARD_TUNING))).toEqual([staffNote('C4').midi]);
  });
});

describe('words', () => {
  it('asks the question', () => {
    expect(siTask(make('staff-interval:+3@treble8vb'))).toBe('Name the interval');
    expect(siTask(make('staff-interval:+3@treble8vb', 1))).toBe(
      'Name the interval between the marked notes',
    );
    expect(siTask(make('staff-interval:-2@treble8vb:place'))).toBe('Tap the note a 2nd below');
    expect(siTask(make('staff-interval:+8@treble8vb:place'))).toBe('Tap the note an octave above');
  });

  it('works the first card through by counting', () => {
    expect(siWorkedExample(make('staff-interval:+2@treble8vb'))).toBe(
      'Space to line: count both notes, 1, 2. A 2nd up, a step. Tap 2nd to continue.',
    );
    expect(siWorkedExample(make('staff-interval:-3@treble8vb:place', 0, () => 0.5))).toBe(
      'A 3rd below: count 1, 2, 3 from this note, space to space. Tap the marked place to continue.',
    );
  });

  it('names shapes by line and space', () => {
    expect(siShape(0, 2)).toBe('line to line');
    expect(siShape(-1, 0)).toBe('space to line');
    expect(siShape(1, 8)).toBe('space to line');
  });

  it('explains a right answer with letters, shape and name', () => {
    const p = make('staff-interval:+3@treble8vb');
    expect(siExplain(p, fb(p, '3rd'))).toBe('D to F, space to space: a 3rd up, a skip.');
    const oct = make('staff-interval:-8@treble8vb', 0, () => 0.999);
    expect(siExplain(oct, fb(oct, 'Octave'))).toBe('G to G, space to line: an octave down.');
  });

  it('explains a reading miss by how far the answer reaches', () => {
    const p = make('staff-interval:+3@treble8vb');
    expect(siExplain(p, fb(p, '4th'))).toBe(
      'A 4th would be space to line, one place further. D to F, space to space: a 3rd up, a skip.',
    );
    expect(siExplain(p, fb(p, '2nd'))).toBe(
      'A 2nd would be space to line, one place nearer. D to F, space to space: a 3rd up, a skip.',
    );
    expect(siExplain(p, fb(p, 'Octave'))).toMatch(/^An octave would be space to line, 5 places/);
    expect(siExplain(p, fb(p, 'nope'))).toBe('D to F, space to space: a 3rd up, a skip.');
  });

  it('explains a placing miss by where the tap was', () => {
    const p = make('staff-interval:+2@treble8vb:place', 0, () => 0.5);
    expect(p).toMatchObject({ from: 4, to: 5 });
    expect(siExplain(p, fb(p, 6))).toBe(
      'You tapped a 3rd above, on the 4th line. B to C, line to space: a 2nd up, a step.',
    );
    expect(siExplain(p, fb(p, 3))).toMatch(/^You tapped a 2nd below, in the 2nd space\./);
    expect(siExplain(p, fb(p, 4))).toMatch(/^You tapped the note itself\./);
    const wide = make('staff-interval:+2@treble8vb:place', 2, () => 0);
    expect(siExplain(wide, fb(wide, 8))).toMatch(/^You tapped further than an octave above/);
    expect(siExplain(p, fb(p, '2nd'))).toBe('B to C, line to space: a 2nd up, a step.');
  });

  it('names notes only as sounding pitches', () => {
    expect(noteAtStaffPosition(make('staff-interval:+3@treble8vb').from)).toBe('D3');
  });
});

describe('keyboard', () => {
  it('takes 2–8 and O for the octave', () => {
    expect(siKeyToAnswer('2', SI_LABELS)).toBe('2nd');
    expect(siKeyToAnswer('8', SI_LABELS)).toBe('Octave');
    expect(siKeyToAnswer('o', SI_LABELS)).toBe('Octave');
    expect(siKeyToAnswer('O', SI_LABELS)).toBe('Octave');
    expect(siKeyToAnswer('1', SI_LABELS)).toBeNull();
    expect(siKeyToAnswer('9', SI_LABELS)).toBeNull();
    expect(siKeyToAnswer('a', SI_LABELS)).toBeNull();
    expect(siKeyToAnswer('3', ['2nd'])).toBeNull();
  });
});
