import { describe, expect, it } from 'vitest';
import { SEED_CONFUSIONS } from '../../engine/confusions';
import { STANDARD_TUNING, staffPositions } from '../../theory';
import type { DrillContext, DrillFeedback } from '../types';
import {
  D22_SCOPE,
  d22At,
  d22CanTest,
  d22Check,
  d22ConceptOf,
  d22DescribeAnswer,
  d22Distance,
  d22Explain,
  d22FeedbackPositions,
  d22KeyToAnswer,
  d22MakePrompt,
  d22NearestPlaceOf,
  d22Range,
  d22RegionOf,
  d22Sounds,
  d22Task,
  d22WhereToPlay,
  d22Which,
  d22WorkedExample,
  type D22Answer,
  type D22Prompt,
} from './logic';

const ctx = (scopeLevel = 0): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel,
  rng: () => 0,
});

const item = (id: string) => ({ id, skillId: 'R1.staff' });
const prompt = (id: string, scope = 0) => d22MakePrompt(item(id), ctx(scope));

function fb(p: D22Prompt, answer: D22Answer): DrillFeedback<D22Answer> {
  return { answer, result: d22Check(p, answer) };
}

describe('D22 items', () => {
  it('tests natural treble 8vb notes within three ledger lines, both ways', () => {
    expect(d22CanTest(item('staff:E4@treble8vb'))).toBe(true);
    expect(d22CanTest(item('staff:E2@treble8vb:place'))).toBe(true);
    expect(d22CanTest(item('staff:F5@treble8vb'))).toBe(true);
    // Past R1's reach, an accidental, another clef, another kind.
    expect(d22CanTest(item('staff:D2@treble8vb'))).toBe(false);
    expect(d22CanTest(item('staff:G5@treble8vb'))).toBe(false);
    expect(d22CanTest(item('staff:F#3@treble8vb'))).toBe(false);
    expect(d22CanTest(item('staff:E4@treble'))).toBe(false);
    expect(d22CanTest(item('note@s1f0'))).toBe(false);
    expect(() => d22MakePrompt(item('note@s1f0'), ctx())).toThrow();
  });

  it('keys every card by its place, which the seeds pair with its neighbours', () => {
    expect(d22ConceptOf(item('staff:E4@treble8vb'))).toBe('staff@7');
    expect(d22ConceptOf(item('staff:E4@treble8vb:place'))).toBe('staff@7');
    expect(d22ConceptOf(item('meter:6/8:kind'))).toBeNull();
    expect(SEED_CONFUSIONS).toContainEqual(['staff@6', 'staff@7']);
    expect(SEED_CONFUSIONS).toContainEqual(['staff@7', 'staff@8']);
  });
});

describe('D22 prompts', () => {
  it('reads sounding pitch: E4 is the top space, E2 under three ledger lines', () => {
    const top = prompt('staff:E4@treble8vb');
    expect(top).toMatchObject({
      direction: 'read',
      note: 'E4',
      letter: 'E',
      position: 7,
      midi: 64,
      region: 'on',
      which: 'higher',
      choices: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    });
    expect(prompt('staff:E2@treble8vb:place')).toMatchObject({
      direction: 'place',
      position: -7,
      region: 'below',
      which: null,
      range: [-7, 0],
    });
  });

  it('splits the staff into below, on and above, each letter once outside it', () => {
    expect(staffPositions(3).map(d22RegionOf).join('')).toBe(
      ['below', 'below', 'below', 'below', 'below', 'below', 'below']
        .concat(Array(9).fill('on'), Array(7).fill('above'))
        .join(''),
    );
    expect(d22Which(0)).toBe('lower');
    expect(d22Which(1)).toBe('lower');
    expect(d22Which(7)).toBe('higher');
    expect(d22Which(8)).toBe('higher');
    for (const p of [-1, 2, 3, 4, 5, 6, 9]) expect(d22Which(p)).toBeNull();
  });

  it('widens the placing taps from the named part to the whole reach', () => {
    expect(d22Range(-3, 0)).toEqual([-7, 0]);
    expect(d22Range(4, 0)).toEqual([-1, 9]);
    expect(d22Range(12, 0)).toEqual([8, 15]);
    for (const p of [-3, 4, 12]) expect(d22Range(p, D22_SCOPE.maxLevel)).toEqual([-7, 15]);
  });

  it('asks in words that name the place without giving it away', () => {
    expect(d22Task(prompt('staff:E4@treble8vb'))).toBe('Name this note');
    expect(d22Task(prompt('staff:G2@treble8vb:place'))).toBe('Tap G below the staff');
    expect(d22Task(prompt('staff:B3@treble8vb:place'))).toBe('Tap B on the staff');
    expect(d22Task(prompt('staff:E4@treble8vb:place'))).toBe('Tap the higher E on the staff');
    expect(d22Task(prompt('staff:F3@treble8vb:place'))).toBe('Tap the lower F on the staff');
    expect(d22Task(prompt('staff:C5@treble8vb:place'))).toBe('Tap C above the staff');
  });

  it('works the first card through', () => {
    expect(d22WorkedExample(prompt('staff:G3@treble8vb'))).toBe(
      'This is G, on the 2nd line. Tap G to continue.',
    );
    expect(d22WorkedExample(prompt('staff:D3@treble8vb:place'))).toBe(
      'D here is in the space below the staff, marked. Tap it to continue.',
    );
  });
});

describe('D22 grading', () => {
  it('grades a reading card on the letter', () => {
    const p = prompt('staff:E4@treble8vb');
    expect(d22Check(p, 'E')).toEqual({ correct: true, expected: 'E', concept: 'staff@7' });
    // F is the top line, one step up: the neighbour confusion.
    expect(d22Check(p, 'F')).toEqual({
      correct: false,
      expected: 'E',
      concept: 'staff@7',
      confusedWith: 'staff@8',
    });
    expect(d22Check(p, 'D').confusedWith).toBe('staff@6');
    // A letter three steps off still names a place; nothing else does.
    expect(d22Check(p, 'B').confusedWith).toBe('staff@4');
    expect(d22Check(p, 'H')).toEqual({ correct: false, expected: 'E', concept: 'staff@7' });
  });

  it('grades a placing card on the tapped place', () => {
    const p = prompt('staff:E2@treble8vb:place');
    expect(d22Check(p, -7)).toEqual({
      correct: true,
      expected: 'E, in the space below the 3rd ledger line',
      concept: 'staff@-7',
    });
    expect(d22Check(p, -6)).toMatchObject({ correct: false, confusedWith: 'staff@-6' });
    // A place past R1's reach isn't a confusion it tracks.
    expect(d22Check(p, -8).confusedWith).toBeUndefined();
    expect(d22Check(p, 1.5).confusedWith).toBeUndefined();
  });

  it('finds the nearest place a letter names, either way', () => {
    expect(d22NearestPlaceOf('F', 7)).toBe(8);
    expect(d22NearestPlaceOf('D', 7)).toBe(6);
    expect(d22NearestPlaceOf('A', 7)).toBe(10);
    expect(d22NearestPlaceOf('B', 7)).toBe(4);
    expect(d22NearestPlaceOf('C', 7)).toBe(5);
    expect(d22NearestPlaceOf('G', 7)).toBe(9);
    expect(d22NearestPlaceOf('E', -7)).toBe(-7);
    expect(d22NearestPlaceOf('x', 0)).toBeNull();
  });

  it('logs the answer as a letter or a place', () => {
    expect(d22DescribeAnswer('E')).toBe('E');
    expect(d22DescribeAnswer(-7)).toBe('pos-7');
  });
});

describe('D22 feedback', () => {
  it('plays the note, and the one the answer named when wrong', () => {
    const p = prompt('staff:E4@treble8vb');
    expect(d22Sounds(p, fb(p, 'E'))).toEqual({ expected: ['E4'] });
    expect(d22Sounds(p, fb(p, 'F'))).toEqual({ expected: ['E4'], given: ['F4'] });
    expect(d22Sounds(p, fb(p, 'H'))).toEqual({ expected: ['E4'] });
    const q = prompt('staff:E2@treble8vb:place');
    expect(d22Sounds(q, fb(q, -6))).toEqual({ expected: ['E2'], given: ['F2'] });
  });

  it('shows every cell playing each note on the neck', () => {
    const p = prompt('staff:E4@treble8vb');
    const right = d22FeedbackPositions(p, fb(p, 'E'));
    expect(right.expected).toEqual(
      expect.arrayContaining([
        { string: 1, fret: 0 },
        { string: 2, fret: 5 },
        { string: 3, fret: 9 },
        { string: 4, fret: 14 },
      ]),
    );
    expect(right.given).toEqual([]);
    const wrong = d22FeedbackPositions(p, fb(p, 'F'));
    expect(wrong.given).toContainEqual({ string: 1, fret: 1 });
    expect(d22FeedbackPositions(p, fb(p, 'H')).given).toEqual([]);
  });

  it('names the place and the fret, and how far off a miss was', () => {
    const p = prompt('staff:E4@treble8vb');
    expect(d22Explain(p, fb(p, 'E'))).toBe(
      'E is in the 4th space. Play it on the open 1st string.',
    );
    expect(d22Explain(p, fb(p, 'f'))).toBe(
      'F is one step above, on the 5th line. E is in the 4th space. Play it on the open 1st string.',
    );
    expect(d22Explain(p, fb(p, 'H'))).toBe(
      'E is in the 4th space. Play it on the open 1st string.',
    );
    const q = prompt('staff:C3@treble8vb:place');
    expect(d22Explain(q, fb(q, -1))).toBe(
      "You tapped the space below the staff: that's D. C is on the 1st ledger line below. Play it on string 5, fret 3.",
    );
    const r = prompt('staff:E4@treble8vb:place', 1);
    expect(d22Explain(r, fb(r, 0))).toBe(
      "You tapped the 1st line: that's an E too, an octave below. E is in the 4th space. Play it on the open 1st string.",
    );
  });

  it('says where a note is played, or nothing past the neck', () => {
    expect(d22WhereToPlay('G2', STANDARD_TUNING)).toBe('string 6, fret 3');
    expect(d22WhereToPlay('B3', STANDARD_TUNING)).toBe('the open 2nd string');
    expect(d22WhereToPlay('C1', STANDARD_TUNING)).toBeNull();
  });

  it('measures the distance in steps', () => {
    expect(d22Distance(7, 8)).toBe('one step above');
    expect(d22Distance(7, 4)).toBe('3 steps below');
    expect(d22Distance(0, 7)).toBe('an octave above');
    expect(d22At(2)).toBe('on the 2nd line');
    expect(d22At(-1)).toBe('in the space below the staff');
  });
});

describe('D22 keyboard', () => {
  it('answers A–G in either case, and nothing else', () => {
    const choices = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    expect(d22KeyToAnswer('e', choices)).toBe('E');
    expect(d22KeyToAnswer('G', choices)).toBe('G');
    expect(d22KeyToAnswer('h', choices)).toBeNull();
    expect(d22KeyToAnswer('1', choices)).toBeNull();
    expect(d22KeyToAnswer('Enter', choices)).toBeNull();
    expect(d22KeyToAnswer('a', ['C', 'D'])).toBeNull();
  });
});
