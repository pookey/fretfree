import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine/skills';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  readingPosition,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillFeedback } from '../types';
import {
  D23_NECK,
  D23_SCOPE,
  D23_STAFF_RANGE,
  d23CanTest,
  d23Check,
  d23CompactFrets,
  d23ConceptOf,
  d23DescribeAnswer,
  d23Explain,
  d23FeedbackPositions,
  d23Finger,
  d23InitialWindow,
  d23IsLive,
  d23MakePrompt,
  d23Miss,
  d23NeckGuideLevel,
  d23NoteStyle,
  d23PositionCaption,
  d23Region,
  d23RegularFrets,
  d23ScopeFor,
  d23Sounds,
  d23StaffMarks,
  d23Where,
  type D23Prompt,
} from './logic';

const prompt = (id: string, scopeLevel = 0, tuning: Tuning = STANDARD_TUNING) =>
  d23MakePrompt(
    { id, skillId: 'R2.pos5' },
    { tuning, accidentalPref: 'sharp', scopeLevel, rng: () => 0 },
  );

const fb = (p: D23Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d23Check(p, answer),
});

describe('D23 prompts', () => {
  it('tests R2 items only', () => {
    expect(d23CanTest({ id: 'staff→fret:G3@pos5', skillId: 'R2.pos5' })).toBe(true);
    expect(d23CanTest({ id: 'staff:G3@treble8vb', skillId: 'R1.staff' })).toBe(false);
    expect(d23CanTest({ id: 'tab@s3f5', skillId: 'TAB.string3' })).toBe(false);
    expect(D23_SCOPE).toEqual({ minLevel: 0, maxLevel: 1 });
  });

  it('builds the note, its one cell and the position’s region', () => {
    const p = prompt('staff→fret:G3@pos5');
    expect(p).toMatchObject({
      note: 'G3',
      staff: 2,
      position: { id: 'pos5', fret: 5 },
      target: { string: 4, fret: 5 },
      region: { from: 4, to: 8 },
      scope: 'position',
      activeRange: { from: 4, to: 8 },
    });
    expect(prompt('staff→fret:E2@open').target).toEqual({ string: 6, fret: 0 });
    expect(prompt('staff→fret:B3@pos5').target).toEqual({ string: 3, fret: 4 });
  });

  it('widens the live frets to the whole neck at the wider scope, keeping the region', () => {
    const p = prompt('staff→fret:G3@pos5', 1);
    expect(p.scope).toBe('neck');
    expect(p.activeRange).toEqual(D23_NECK);
    expect(p.region).toEqual({ from: 4, to: 8 });
    expect(d23ScopeFor(-1)).toBe('position');
    expect(d23ScopeFor(9)).toBe('neck');
  });

  it('draws each position’s frets: the four, plus the stretches its notes use', () => {
    const region = (fret: number) => d23Region(readingPosition(fret), STANDARD_TUNING);
    expect(region(0)).toEqual({ from: 0, to: 3 });
    expect(region(5)).toEqual({ from: 4, to: 8 });
    expect(region(7)).toEqual({ from: 7, to: 10 });
    expect(region(9)).toEqual({ from: 8, to: 13 });
    expect(region(12)).toEqual({ from: 12, to: 15 });
  });

  it('follows the tuning', () => {
    // Drop D: low E is fret 2 on the D string, still in open position.
    expect(prompt('staff→fret:E2@open', 0, DROP_D_TUNING).target).toEqual({ string: 6, fret: 2 });
  });

  it('refuses items it cannot place', () => {
    expect(() => prompt('tab@s3f5')).toThrow(/cannot test/);
    // E2 is out of reach in 12th position.
    expect(() => prompt('staff→fret:E2@pos12')).toThrow(/cannot test/);
  });

  it('keys items by staff place', () => {
    expect(d23ConceptOf({ id: 'staff→fret:G3@pos5', skillId: 'R2.pos5' })).toBe('staff@2');
    expect(d23ConceptOf({ id: 'staff→fret:E2@open', skillId: 'R2.open' })).toBe('staff@-7');
    expect(d23ConceptOf({ id: 'tab@s3f5', skillId: 'TAB.string3' })).toBeNull();
  });

  it('serves every R2 item', () => {
    for (const id of ['R2.open', 'R2.pos5', 'R2.pos7', 'R2.pos9', 'R2.pos12']) {
      for (const item of getSkill(id)!.items()) {
        const p = d23MakePrompt(item, {
          tuning: STANDARD_TUNING,
          accidentalPref: 'sharp',
          scopeLevel: 0,
          rng: () => 0,
        });
        expect(d23IsLive(p, p.target), item.id).toBe(true);
        expect(d23Check(p, p.target).correct).toBe(true);
      }
    }
  });
});

describe('D23 grading', () => {
  const p = prompt('staff→fret:G3@pos5');

  it('accepts only the position’s cell', () => {
    expect(d23Check(p, { string: 4, fret: 5 })).toEqual({
      correct: true,
      expected: 'G3, string 4, fret 5',
      concept: 'staff@2',
    });
    expect(d23DescribeAnswer({ string: 4, fret: 5 })).toBe('s4f5');
  });

  it('logs a misread natural against its staff place', () => {
    // A3: the space above G3's line.
    expect(d23Check(p, { string: 4, fret: 7 })).toMatchObject({
      correct: false,
      concept: 'staff@2',
      confusedWith: 'staff@3',
    });
    expect(d23Miss(p, { string: 4, fret: 7 })).toBe('misread');
  });

  it('logs no confusion for a sharp or the same note out of position', () => {
    expect(d23Check(p, { string: 4, fret: 6 }).confusedWith).toBeUndefined();
    expect(d23Miss(p, { string: 4, fret: 6 })).toBe('sharp');
    const wide = prompt('staff→fret:G3@pos5', 1);
    expect(d23Miss(wide, { string: 3, fret: 0 })).toBe('same-note');
    expect(d23Check(wide, { string: 3, fret: 0 })).toMatchObject({ correct: false });
    expect(d23Check(wide, { string: 3, fret: 0 }).confusedWith).toBeUndefined();
  });

  it('ignores taps outside the live frets for the confusion matrix', () => {
    expect(d23IsLive(p, { string: 3, fret: 2 })).toBe(false);
    expect(d23IsLive(p, { string: 7, fret: 5 })).toBe(false);
    expect(d23Check(p, { string: 3, fret: 2 }).confusedWith).toBeUndefined();
  });

  it('plays the note, and the tapped one when wrong', () => {
    expect(d23Sounds(p, fb(p, { string: 4, fret: 5 }))).toEqual({ expected: ['G3'] });
    expect(d23Sounds(p, fb(p, { string: 4, fret: 7 }))).toEqual({
      expected: ['G3'],
      given: ['A3'],
    });
    expect(d23FeedbackPositions(p, fb(p, { string: 4, fret: 7 }))).toEqual({
      expected: [{ string: 4, fret: 5 }],
      given: [{ string: 4, fret: 7 }],
    });
    expect(d23FeedbackPositions(p, fb(p, { string: 4, fret: 5 })).given).toEqual([]);
  });
});

describe('D23 feedback copy', () => {
  it('names the finger that plays a fret in the position', () => {
    const pos5 = readingPosition(5);
    expect(d23Finger(pos5, 5)).toBe('the index finger');
    expect(d23Finger(pos5, 7)).toBe('the ring finger');
    expect(d23Finger(pos5, 8)).toBe('the little finger');
    expect(d23Finger(pos5, 4)).toBe('the index finger, reaching back a fret');
    expect(d23Finger(readingPosition(9), 13)).toBe('the little finger, reaching up a fret');
    const open = readingPosition(0);
    expect(d23Finger(open, 0)).toBe('the open string');
    expect(d23Finger(open, 1)).toBe('the index finger');
    expect(d23Finger(open, 3)).toBe('the ring finger');
  });

  it('says where the note is, and which way a miss went wrong', () => {
    const p = prompt('staff→fret:G3@pos5', 1);
    expect(d23Where(p)).toBe('G3 in 5th position is string 4, fret 5, the index finger.');
    expect(d23Explain(p, fb(p, { string: 4, fret: 5 }))).toBe(d23Where(p));
    expect(d23Explain(p, fb(p, { string: 4, fret: 7 }))).toBe(
      'You tapped string 4, fret 7, which is A3, on the space just above. G3 in 5th position is string 4, fret 5, the index finger.',
    );
    expect(d23Explain(p, fb(p, { string: 4, fret: 3 }))).toBe(
      'You tapped string 4, fret 3, which is F3, on the space just below. G3 in 5th position is string 4, fret 5, the index finger.',
    );
    expect(d23Explain(p, fb(p, { string: 3, fret: 7 }))).toMatch(/which is D4, 4 steps above/);
    expect(d23Explain(p, fb(p, { string: 2, fret: 8 }))).toMatch(/which is G4, an octave above/);
    expect(d23Explain(p, fb(p, { string: 4, fret: 6 }))).toBe(
      'You tapped string 4, fret 6, which is G♯3. G3 in 5th position is string 4, fret 5, the index finger.',
    );
    expect(d23Explain(p, fb(p, { string: 3, fret: 0 }))).toBe(
      'You tapped string 3, fret 0: G3 too, but 5th position plays it on string 4, fret 5.',
    );
    const line = prompt('staff→fret:A3@pos5');
    expect(d23Explain(line, fb(line, { string: 4, fret: 5 }))).toMatch(/on the line just below/);
  });

  it('captions the position', () => {
    expect(d23PositionCaption(prompt('staff→fret:G3@pos5'))).toBe('5th position, frets 5–8');
    expect(d23PositionCaption(prompt('staff→fret:G3@open'))).toBe('Open position, frets 0–3');
    expect(d23Where(prompt('staff→fret:G3@open'))).toBe(
      'G3 in open position is string 3, fret 0, the open string.',
    );
  });
});

describe('D23 staff and guides', () => {
  const p = prompt('staff→fret:G3@pos5');

  it('styles the note as asked, then correct', () => {
    expect(d23NoteStyle(null)).toBe('target');
    expect(d23NoteStyle(fb(p, { string: 4, fret: 5 }))).toBe('correct');
    expect(d23NoteStyle(fb(p, { string: 4, fret: 7 }))).toBe('target');
  });

  it('marks a misread on its own staff place, and nothing else', () => {
    expect(d23StaffMarks(p, null)).toEqual([]);
    expect(d23StaffMarks(p, fb(p, { string: 4, fret: 5 }))).toEqual([]);
    expect(d23StaffMarks(p, fb(p, { string: 4, fret: 7 }))).toEqual([
      { position: 3, style: 'wrong', at: 0 },
    ]);
    // G♯3 shares G3's place.
    expect(d23StaffMarks(p, fb(p, { string: 4, fret: 6 }))).toEqual([]);
    // The neck's highest note, G5, still fits the staff's range.
    const wide = prompt('staff→fret:G3@pos5', 1);
    expect(d23StaffMarks(wide, fb(wide, { string: 1, fret: 15 }))).toEqual([
      { position: 16, style: 'wrong', at: 0 },
    ]);
  });

  it('draws one staff range for every prompt: R1’s ledger lines and a step', () => {
    expect(D23_STAFF_RANGE).toEqual([-8, 16]);
  });

  it('marks nothing on the neck until feedback, except the worked example', () => {
    expect(d23NeckGuideLevel(1, { guided: false })).toBe(1);
    expect(d23NeckGuideLevel(1, { guided: true })).toBe(3);
  });
});

describe('D23 neck windows', () => {
  it('opens a compact window on the position', () => {
    expect(d23InitialWindow(prompt('staff→fret:G3@pos5'), 5)).toEqual({ from: 4, to: 8 });
    expect(d23InitialWindow(prompt('staff→fret:G3@open'), 5)).toEqual({ from: 0, to: 4 });
    expect(d23InitialWindow(prompt('staff→fret:G3@pos12'), 5)).toEqual({ from: 11, to: 15 });
    // A window narrower than the region still holds it.
    expect(d23InitialWindow(prompt('staff→fret:G3@pos9'), 4)).toEqual({ from: 8, to: 13 });
  });

  it('slides iPad portrait’s 13 frets up for a high position', () => {
    expect(d23RegularFrets(prompt('staff→fret:G3@open'))).toEqual({ from: 0, to: 12 });
    expect(d23RegularFrets(prompt('staff→fret:G3@pos9'))).toEqual({ from: 1, to: 13 });
    expect(d23RegularFrets(prompt('staff→fret:G3@pos12'))).toEqual({ from: 3, to: 15 });
  });

  it('narrows the compact window beside the staff on a phone on its side', () => {
    expect(d23CompactFrets(undefined, 844, 390)).toBeUndefined();
    expect(d23CompactFrets(5, 390, 844)).toBe(5);
    const side = d23CompactFrets(9, 844, 390)!;
    expect(side).toBeLessThanOrEqual(9);
    expect(side).toBeGreaterThanOrEqual(4);
  });
});
