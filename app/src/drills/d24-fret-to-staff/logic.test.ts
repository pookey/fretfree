import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine/skills';
import { positionNaturals } from '../../engine/skills/r2';
import {
  READING_POSITIONS,
  STANDARD_TUNING,
  midiAt,
  noteAtStaffPosition,
  readingPosition,
  type Position,
} from '../../theory';
import type { DrillContext, DrillFeedback } from '../types';
import {
  D24_HIGHEST,
  D24_LOWEST,
  D24_SCOPE,
  d24CanTest,
  d24CellName,
  d24CellsOf,
  d24Check,
  d24ConceptOf,
  d24DescribeAnswer,
  d24Explain,
  d24FeedbackPositions,
  d24GivenNote,
  d24MakePrompt,
  d24NeckGuideLevel,
  d24PositionCaption,
  d24Range,
  d24ScopeFor,
  d24Sounds,
  d24Task,
  d24Where,
  d24WorkedExample,
  type D24Answer,
  type D24Prompt,
} from './logic';

const ctx = (over: Partial<DrillContext> = {}): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel: 0,
  rng: () => 0,
  ...over,
});

const item = (id: string) => ({ id, skillId: 'R2.pos5' });
const prompt = (id: string, over: Partial<DrillContext> = {}) => d24MakePrompt(item(id), ctx(over));

const fb = (p: D24Prompt, answer: D24Answer): DrillFeedback<D24Answer> => ({
  answer,
  result: d24Check(p, answer),
});

describe('D24 items', () => {
  it('tests the natural fret → staff cards within three ledger lines', () => {
    expect(d24CanTest(item('fret→staff:G3@pos5'))).toBe(true);
    expect(d24CanTest(item('fret→staff:E2@open'))).toBe(true);
    expect(d24CanTest(item('fret→staff:F#3@pos5'))).toBe(false);
    expect(d24CanTest(item('fret→staff:G5@pos12'))).toBe(false);
    expect(d24CanTest(item('staff→fret:G3@pos5'))).toBe(false);
    expect(d24CanTest(item('staff:G3@treble8vb'))).toBe(false);
  });

  it('keys each card by its staff place, as R1 and D23 do', () => {
    expect(d24ConceptOf(item('fret→staff:G3@pos5'))).toBe('staff@2');
    expect(d24ConceptOf(item('fret→staff:E2@open'))).toBe('staff@-7');
    expect(d24ConceptOf(item('staff→fret:G3@pos5'))).toBeNull();
  });

  it('can make a prompt for every reverse card R2 teaches', () => {
    for (const id of ['R2.open', 'R2.pos5', 'R2.pos7', 'R2.pos9', 'R2.pos12']) {
      const cards = getSkill(id)!
        .items()
        .filter((i) => d24CanTest(i));
      expect(cards.length).toBeGreaterThan(10);
      for (const i of cards) {
        const p = d24MakePrompt(i, ctx());
        expect(midiAt(p.cell, STANDARD_TUNING), i.id).toBe(p.midi);
        expect(p.place).toBeGreaterThanOrEqual(p.range[0]);
        expect(p.place).toBeLessThanOrEqual(p.range[1]);
      }
    }
  });

  it('throws for an item it cannot test', () => {
    expect(() => d24MakePrompt(item('staff:G3@treble8vb'), ctx())).toThrow(/cannot test/);
  });
});

describe('D24 prompts', () => {
  it('lights the position’s own fret for the note', () => {
    const p = prompt('fret→staff:G3@pos5');
    expect(p).toMatchObject({
      note: 'G3',
      place: 2,
      cell: { string: 4, fret: 5 },
      cells: [{ string: 4, fret: 5 }],
      region: { from: 4, to: 8 },
      scope: 'position',
    });
    expect(p.position.id).toBe('pos5');
  });

  it('lights either of 9th position’s cells for F3, G4 and C5: one card per pitch', () => {
    const twice: Record<string, [Position, Position]> = {
      F3: [
        { string: 5, fret: 8 },
        { string: 6, fret: 13 },
      ],
      G4: [
        { string: 3, fret: 12 },
        { string: 2, fret: 8 },
      ],
      C5: [
        { string: 1, fret: 8 },
        { string: 2, fret: 13 },
      ],
    };
    for (const [note, [own, other]] of Object.entries(twice)) {
      const id = `fret→staff:${note}@pos9`;
      const low = prompt(id, { rng: () => 0 });
      const high = prompt(id, { rng: () => 0.99 });
      expect(low.cell, note).toEqual(own);
      expect(high.cell, note).toEqual(other);
      expect(low.cells).toEqual([own, other]);
      expect(high.cells).toEqual([other, own]);
      // Either cell, the same place and the same answer.
      expect(low.place).toBe(high.place);
      expect(d24Check(high, low.place).correct).toBe(true);
    }
    // Every other 9th-position note has the one cell.
    const others = positionNaturals(readingPosition(9)).filter(
      (n) => !['F3', 'G4', 'C5'].includes(n.note),
    );
    for (const n of others) expect(prompt(`fret→staff:${n.note}@pos9`).cells).toHaveLength(1);
  });

  it('takes taps over the position’s notes, or R1’s whole reach at the wider scope', () => {
    const range = (fret: number, level = 0) =>
      d24Range(readingPosition(fret), d24ScopeFor(level), STANDARD_TUNING);
    expect(range(0)).toEqual([-7, 10]);
    expect(range(5)).toEqual([-5, 13]);
    expect(range(12)).toEqual([-1, 15]);
    expect(range(5, 1)).toEqual([D24_LOWEST, D24_HIGHEST]);
    expect([D24_LOWEST, D24_HIGHEST]).toEqual([-7, 15]);
    for (const position of READING_POSITIONS) {
      const [lo, hi] = d24Range(position, 'position', STANDARD_TUNING);
      for (const n of positionNaturals(position)) {
        expect(n.staff).toBeGreaterThan(lo - (lo === D24_LOWEST ? 1 : 0));
        expect(n.staff).toBeLessThan(hi + (hi === D24_HIGHEST ? 1 : 0));
      }
    }
    expect(d24ScopeFor(-1)).toBe('position');
    expect(d24ScopeFor(D24_SCOPE.maxLevel + 3)).toBe('reading');
    expect(prompt('fret→staff:G3@pos5', { scopeLevel: 1 }).range).toEqual([-7, 15]);
  });

  it('finds every cell within some frets that plays a pitch', () => {
    expect(d24CellsOf(55, { from: 0, to: 5 }, STANDARD_TUNING)).toEqual([
      { string: 3, fret: 0 },
      { string: 4, fret: 5 },
    ]);
  });
});

describe('D24 grading', () => {
  const p = prompt('fret→staff:G3@pos5');

  it('is right on the note’s place, whichever cell was lit', () => {
    expect(d24Check(p, 2)).toEqual({
      correct: true,
      expected: 'G3, on the 2nd line',
      concept: 'staff@2',
    });
  });

  it('logs a tap on another place as that place confused with this one', () => {
    expect(d24Check(p, 3)).toEqual({
      correct: false,
      expected: 'G3, on the 2nd line',
      concept: 'staff@2',
      confusedWith: 'staff@3',
    });
    // Off the staff's range (never tappable): wrong, with nothing to pair.
    expect(d24Check(p, 40)).toEqual({
      correct: false,
      expected: 'G3, on the 2nd line',
      concept: 'staff@2',
    });
    expect(d24Check(p, 2.5).confusedWith).toBeUndefined();
  });

  it('logs the tapped place', () => {
    expect(d24DescribeAnswer(3)).toBe('pos3');
    expect(d24DescribeAnswer(-7)).toBe('pos-7');
  });

  it('plays the note, and the tapped place’s note on a miss', () => {
    expect(d24Sounds(p, fb(p, 2))).toEqual({ expected: ['G3'] });
    expect(d24Sounds(p, fb(p, 3))).toEqual({ expected: ['G3'], given: ['A3'] });
    expect(d24Sounds(p, fb(p, 40))).toEqual({ expected: ['G3'] });
    expect(d24GivenNote(p, fb(p, 9))).toBe(noteAtStaffPosition(9));
  });

  it('shows the lit cell, and where the position plays the tapped note', () => {
    expect(d24FeedbackPositions(p, fb(p, 2))).toEqual({
      expected: [{ string: 4, fret: 5 }],
      given: [],
    });
    expect(d24FeedbackPositions(p, fb(p, 3))).toEqual({
      expected: [{ string: 4, fret: 5 }],
      given: [{ string: 4, fret: 7 }],
    });
    // 9th position: both of the note's cells, the lit one first.
    const f3 = prompt('fret→staff:F3@pos9', { rng: () => 0.99 });
    expect(d24FeedbackPositions(f3, fb(f3, 1)).expected).toEqual([
      { string: 6, fret: 13 },
      { string: 5, fret: 8 },
    ]);
  });
});

describe('D24 words', () => {
  const p = prompt('fret→staff:G3@pos5');

  it('asks for the lit cell, naming the position', () => {
    expect(d24PositionCaption(p)).toBe('5th position, frets 5–8');
    expect(d24PositionCaption(prompt('fret→staff:E2@open'))).toBe('Open position, frets 0–3');
    expect(d24Task(p)).toBe('Place string 4, fret 5 on the staff');
    expect(d24Task(prompt('fret→staff:E2@open'))).toBe('Place the open 6th string on the staff');
    expect(d24CellName({ string: 3, fret: 0 })).toBe('the open 3rd string');
  });

  it('works the example: the note, its place, and what to tap', () => {
    expect(d24WorkedExample(p)).toBe(
      'String 4, fret 5 is G3, on the 2nd line, marked. Tap it to continue.',
    );
    expect(d24WorkedExample(prompt('fret→staff:E2@open'))).toBe(
      'The open 6th string is E2, in the space below the 3rd ledger line, marked. Tap it to continue.',
    );
  });

  it('explains a right answer with the note and its place', () => {
    expect(d24Where(p)).toBe('String 4, fret 5 is G3, on the 2nd line.');
    expect(d24Explain(p, fb(p, 2))).toBe('String 4, fret 5 is G3, on the 2nd line.');
  });

  it('explains a miss: the tapped place’s note, how far off, and where it is played', () => {
    expect(d24Explain(p, fb(p, 3))).toBe(
      "You tapped the 2nd space: that's A3, one step above, played on string 4, fret 7. String 4, fret 5 is G3, on the 2nd line.",
    );
    expect(d24Explain(p, fb(p, 9))).toBe(
      "You tapped the space above the staff: that's G4, an octave above, played on string 2, fret 8. String 4, fret 5 is G3, on the 2nd line.",
    );
    // A place the position doesn't reach has no fret to name.
    const wide = prompt('fret→staff:G3@pos5', { scopeLevel: 1 });
    expect(d24Explain(wide, fb(wide, -7))).toBe(
      "You tapped the space below the 3rd ledger line: that's E2, 9 steps below. String 4, fret 5 is G3, on the 2nd line.",
    );
    expect(d24Explain(p, fb(p, 40))).toBe('String 4, fret 5 is G3, on the 2nd line.');
  });

  it('keeps the neck’s fret numbers at every guide level, and labels the worked example', () => {
    expect(d24NeckGuideLevel(0, { guided: false })).toBe(2);
    expect(d24NeckGuideLevel(1, { guided: false })).toBe(2);
    expect(d24NeckGuideLevel(3, { guided: false })).toBe(3);
    expect(d24NeckGuideLevel(0, { guided: true })).toBe(3);
  });
});
