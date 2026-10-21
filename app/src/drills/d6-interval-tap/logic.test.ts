import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  intervalFromRoot,
  inRange,
  midiAt,
  type Position,
} from '../../theory';
import type { DrillFeedback } from '../types';
import {
  D6_BOX_FRETS,
  D6_NECK,
  d6Box,
  d6CanTest,
  d6Check,
  d6ConceptOf,
  d6DegreeAt,
  d6DescribeAnswer,
  d6ExpectedText,
  d6Explain,
  d6FeedbackPositions,
  d6ForgotShift,
  d6Hint,
  d6IsLive,
  d6MakePrompt,
  d6NearestTarget,
  d6Question,
  d6RootFrets,
  d6ScopeFor,
  d6Semitones,
  d6ShapeHint,
  d6Sounds,
  d6UnshiftedTarget,
  d6WorkedExample,
  type D6Prompt,
} from './logic';

const ctx = { tuning: STANDARD_TUNING, accidentalPref: 'sharp' as const };

/** An rng that picks the root fret `fret` for a shape valid on frets 1–12. */
const atFret = (fret: number) => () => (fret - 1 + 0.5) / 12;

function prompt(id: string, scopeLevel = 0, rng: () => number = () => 0): D6Prompt {
  return d6MakePrompt({ id, skillId: 'C3.thirds' }, { ...ctx, scopeLevel, rng });
}

const fb = (p: D6Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d6Check(p, answer),
});

const C3_TAP_ITEMS = SKILLS.filter((s) => s.topic === 'C3')
  .flatMap((s) => s.items())
  .filter(d6CanTest);

describe('D6 items and scope', () => {
  it('tests interval-tap items only', () => {
    expect(d6CanTest({ id: 'interval:M3@s6→s5', skillId: 'C3.thirds' })).toBe(true);
    expect(d6CanTest({ id: 'interval-name:M3@s6→s5', skillId: 'C3.thirds' })).toBe(false);
    expect(d6CanTest({ id: 'note@s6f5', skillId: 'F2.string6-naturals' })).toBe(false);
  });

  it('serves every C3 shape, including the G–B shift items', () => {
    expect(C3_TAP_ITEMS.length).toBeGreaterThan(20);
    expect(C3_TAP_ITEMS.some((i) => prompt(i.id).gbShift)).toBe(true);
    expect(C3_TAP_ITEMS.some((i) => !prompt(i.id).gbShift)).toBe(true);
  });

  it('maps levels to scopes, clamped', () => {
    expect(d6ScopeFor(-1)).toBe('shape');
    expect(d6ScopeFor(0)).toBe('shape');
    expect(d6ScopeFor(1)).toBe('box');
    expect(d6ScopeFor(2)).toBe('neck');
    expect(d6ScopeFor(7)).toBe('neck');
  });

  it('rejects items it cannot place', () => {
    const make = (id: string) => () => prompt(id);
    expect(make('interval-name:M3@s6→s5')).toThrow(/cannot test/);
    expect(make('interval:M3@s7→s5')).toThrow(/cannot test/);
    expect(make('interval:M3@s5→s5')).toThrow(/cannot test/);
    // The upper note is two octaves up the low E string: never on frets 0–12.
    expect(make('interval:M7@s1→s6')).toThrow(/frets 0–12/);
  });
});

describe('d6MakePrompt', () => {
  it('puts the root on a fretted note and the shape on the upper string', () => {
    const p = prompt('interval:M3@s6→s5', 0, atFret(5));
    expect(p.root).toEqual({ string: 6, fret: 5 });
    expect(p.shapeTarget).toEqual({ string: 5, fret: 4 });
    expect(p.interval).toBe('M3');
    expect(p.gbShift).toBe(false);
    expect(p.expected).toBe('M3');
  });

  it('varies the root fret with the rng across the neck (rule 12)', () => {
    const frets = new Set(
      Array.from({ length: 12 }, (_, i) => prompt('interval:M3@s6→s5', 0, () => i / 12).root.fret),
    );
    expect(frets.size).toBe(12);
    expect(prompt('interval:P5@s6→s5', 0, () => 0.9999).root.fret).toBe(10);
  });

  it('keeps root frets where the shape stays on frets 0–12', () => {
    expect(d6RootFrets('M3', 6, 5, STANDARD_TUNING)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // P5 on the G–B pair is 3 frets up: roots stop at fret 9.
    expect(d6RootFrets('P5', 3, 2, STANDARD_TUNING).at(-1)).toBe(9);
    // m2 on the G–B pair is 3 frets back: roots start at fret 3.
    expect(d6RootFrets('m2', 3, 2, STANDARD_TUNING)[0]).toBe(3);
  });

  it('accepts only the shape cell at the shape scope', () => {
    for (const item of C3_TAP_ITEMS) {
      for (const r of [0, 0.5, 0.999]) {
        const p = prompt(item.id, 0, () => r);
        expect(p.liveStrings).toEqual([p.shapeTarget.string]);
        expect(p.targets, item.id).toEqual([p.shapeTarget]);
        expect(semitones(p, p.shapeTarget), item.id).toBe(d6Semitones(p));
        expect(inRange(p.shapeTarget.fret, D6_NECK)).toBe(true);
      }
    }
  });

  it('accepts the degree on every string of the hand position at the box scope', () => {
    const p = prompt('interval:M3@s6→s5', 1, atFret(5));
    expect(p.scope).toBe('box');
    expect(p.box).toEqual({ from: 3, to: 7 });
    expect(p.activeRange).toEqual(p.box);
    expect(p.liveStrings).toEqual([1, 2, 3, 4, 5, 6]);
    // A2 root: C# on string 5 fret 4 and string 3 fret 6.
    expect(p.targets).toEqual([
      { string: 3, fret: 6 },
      { string: 5, fret: 4 },
    ]);
    expect(d6Check(p, { string: 3, fret: 6 }).correct).toBe(true);
  });

  it('accepts the degree anywhere on frets 0–12 at the neck scope, below the root too', () => {
    const p = prompt('interval:M3@s4→s3', 2, atFret(7));
    expect(p.root).toEqual({ string: 4, fret: 7 });
    expect(p.activeRange).toEqual(D6_NECK);
    expect(p.targets.length).toBeGreaterThan(4);
    for (const t of p.targets) expect(intervalFromRoot(p.root, t)).toBe('M3');
    // C#3 on string 5 is a 6th below the A3 root, and still its 3rd.
    const below = { string: 5, fret: 4 };
    expect(midiAt(below)).toBeLessThan(midiAt(p.root));
    expect(d6Check(p, below)).toEqual({
      correct: true,
      expected: 'a major 3rd (M3)',
      concept: 'M3',
    });
  });

  it('flags G–B shift shapes, one fret above the all-fourths shape', () => {
    const p = prompt('interval:M3@s3→s2', 0, atFret(5));
    expect(p.gbShift).toBe(true);
    expect(p.expected).toBe('M3 (G–B shift)');
    expect(p.shapeTarget).toEqual({ string: 2, fret: 5 });
    expect(d6UnshiftedTarget(p)).toEqual({ string: 2, fret: 4 });
    expect(d6UnshiftedTarget(prompt('interval:M3@s4→s3'))).toBeNull();
  });

  it('keeps the unshifted shape inside the hand position, so the slip is a live tap', () => {
    for (const item of C3_TAP_ITEMS) {
      for (const r of [0, 0.5, 0.999]) {
        const p = prompt(item.id, 0, () => r);
        const unshifted = d6UnshiftedTarget(p);
        if (unshifted && unshifted.fret >= 0) {
          expect(d6IsLive(p, unshifted), item.id).toBe(true);
        }
      }
    }
  });
});

function semitones(p: D6Prompt, pos: Position): number {
  return midiAt(pos) - midiAt(p.root);
}

describe('d6Box', () => {
  it('centres a 5-fret box on the root and the shape', () => {
    expect(d6Box([5, 4])).toEqual({ from: 3, to: 7 });
    expect(d6Box([5])).toEqual({ from: 3, to: 7 });
    expect(d6Box([5, 8]).to - d6Box([5, 8]).from + 1).toBe(D6_BOX_FRETS);
  });

  it('stays within frets 0–12', () => {
    expect(d6Box([1, 0])).toEqual({ from: 0, to: 4 });
    expect(d6Box([12])).toEqual({ from: 8, to: 12 });
    expect(d6Box([-1, 3])).toEqual({ from: 0, to: 4 });
  });

  it('grows past 5 frets for a wider spread', () => {
    expect(d6Box([1, 7])).toEqual({ from: 1, to: 7 });
  });
});

describe('d6Check', () => {
  it('accepts the shape cell', () => {
    const p = prompt('interval:m7@s6→s4', 0, atFret(5));
    expect(d6Check(p, p.shapeTarget)).toEqual({
      correct: true,
      expected: 'a minor 7th (m7)',
      concept: 'm7',
    });
  });

  it('records the interval tapped as the confusion', () => {
    const p = prompt('interval:M3@s6→s5', 1, atFret(5));
    // String 5 fret 5 is D, a P4 above A.
    expect(d6Check(p, { string: 5, fret: 5 })).toEqual({
      correct: false,
      expected: 'a major 3rd (M3)',
      concept: 'M3',
      confusedWith: 'P4',
    });
  });

  it('records no confusion for the root, its octaves or dimmed cells', () => {
    const p = prompt('interval:M3@s6→s5', 1, atFret(5));
    expect(d6Check(p, p.root)).toEqual({
      correct: false,
      expected: 'a major 3rd (M3)',
      concept: 'M3',
    });
    expect(d6Check(p, { string: 4, fret: 7 })).toEqual({
      correct: false,
      expected: 'a major 3rd (M3)',
      concept: 'M3',
    });
    expect(d6Check(p, { string: 5, fret: 11 })).toEqual({
      correct: false,
      expected: 'a major 3rd (M3)',
      concept: 'M3',
    });
    expect(d6IsLive(p, { string: 5, fret: 11 })).toBe(false);
  });

  it('names the interval in full for the feedback bar', () => {
    expect(d6ExpectedText(prompt('interval:P5@s6→s5', 0, atFret(5)))).toBe('a perfect 5th (P5)');
    expect(d6ExpectedText(prompt('interval:m3@s3→s2', 0, atFret(5)))).toBe(
      'a minor 3rd (m3), with the G–B shift',
    );
  });

  it('pairs a forgotten G–B shift with the unshifted interval (rule 6)', () => {
    const p = prompt('interval:M3@s3→s2', 0, atFret(5));
    const slip = { string: 2, fret: 4 };
    expect(d6ForgotShift(p, slip)).toBe(true);
    expect(d6Check(p, slip)).toEqual({
      correct: false,
      expected: 'a major 3rd (M3), with the G–B shift',
      concept: 'M3 (G–B shift)',
      confusedWith: 'M3',
    });
    expect(d6ForgotShift(p, { string: 2, fret: 6 })).toBe(false);
  });

  it('describes the answer as a cell', () => {
    expect(d6DescribeAnswer({ string: 3, fret: 7 })).toBe('s3f7');
  });
});

describe('d6ConceptOf', () => {
  it('keys items by interval, shifted shapes apart', () => {
    const concept = (id: string) => d6ConceptOf({ id, skillId: 'C3.thirds' }, ctx);
    expect(concept('interval:M3@s6→s5')).toBe('M3');
    expect(concept('interval:M3@s3→s2')).toBe('M3 (G–B shift)');
    expect(concept('interval-name:M3@s6→s5')).toBeNull();
  });

  it('works from pitch, so other tunings move the shapes', () => {
    // Drop D: strings 6 and 5 are a 5th apart, so the M3 sits 3 frets back.
    const p = d6MakePrompt(
      { id: 'interval:M3@s6→s5', skillId: 'C3.thirds' },
      { ...ctx, tuning: DROP_D_TUNING, scopeLevel: 0, rng: () => 0.5 },
    );
    expect(p.shapeTarget.fret - p.root.fret).toBe(-3);
    expect(p.gbShift).toBe(false);
    const concept = d6ConceptOf(
      { id: 'interval:M3@s3→s2', skillId: 'C3.thirds' },
      { ...ctx, tuning: DROP_D_TUNING },
    );
    expect(concept).toBe('M3 (G–B shift)');
  });
});

describe('sounds and feedback', () => {
  it('plays the root, then the tapped interval', () => {
    const p = prompt('interval:M3@s6→s5', 0, atFret(5));
    expect(d6Sounds(p, fb(p, p.shapeTarget))).toEqual({ expected: ['A2', 'C#3'] });
  });

  it('plays the root and the nearest right note, then the wrong one', () => {
    const p = prompt('interval:M3@s6→s5', 1, atFret(5));
    expect(d6NearestTarget(p, { string: 4, fret: 6 })).toEqual({ string: 3, fret: 6 });
    expect(d6Sounds(p, fb(p, { string: 5, fret: 5 }))).toEqual({
      expected: ['A2', 'C#3'],
      given: ['D3'],
    });
  });

  it('plays just the root if nothing in range is right', () => {
    const p = { ...prompt('interval:M3@s6→s5'), targets: [] };
    expect(d6NearestTarget(p, p.root)).toBeNull();
    expect(d6Sounds(p, fb(p, { string: 5, fret: 2 }))).toEqual({ expected: ['F2'] });
  });

  it('shows every right cell, and the tapped one when wrong', () => {
    const p = prompt('interval:M3@s6→s5', 1, atFret(5));
    expect(d6FeedbackPositions(p, fb(p, p.shapeTarget))).toEqual({
      expected: p.targets,
      given: [],
    });
    expect(d6FeedbackPositions(p, fb(p, { string: 5, fret: 5 }))).toEqual({
      expected: p.targets,
      given: [{ string: 5, fret: 5 }],
    });
  });

  it('labels cells by degree from the root', () => {
    const p = prompt('interval:m7@s6→s4', 0, atFret(5));
    expect(d6DegreeAt(p, p.shapeTarget)).toBe('♭7');
    expect(d6DegreeAt(p, p.root)).toBe('R');
    expect(d6DegreeAt(p, { string: 4, fret: 7 })).toBe('R');
    expect(d6DegreeAt(p, { string: 5, fret: 7 })).toBe('5');
  });
});

describe('wording', () => {
  it('describes the shape from the root', () => {
    expect(d6ShapeHint(prompt('interval:M3@s6→s5', 0, atFret(5)))).toBe(
      'string 5, 1 fret toward the nut',
    );
    expect(d6ShapeHint(prompt('interval:m3@s6→s5', 0, atFret(5)))).toBe(
      'string 5, 2 frets toward the nut',
    );
    expect(d6ShapeHint(prompt('interval:P5@s6→s5', 0, atFret(5)))).toBe(
      'string 5, 2 frets up the neck',
    );
    expect(d6ShapeHint(prompt('interval:P4@s6→s5', 0, atFret(5)))).toBe('string 5, the same fret');
    expect(d6ShapeHint(prompt('interval:P4@s3→s2', 0, atFret(5)))).toBe(
      'string 2, 1 fret up the neck',
    );
  });

  it('teaches the G–B shift in the worked example', () => {
    expect(d6WorkedExample(prompt('interval:M3@s6→s5', 0, atFret(5)))).toBe(
      'This is the major 3rd above the root: string 5, 1 fret toward the nut.',
    );
    expect(d6WorkedExample(prompt('interval:M3@s3→s2', 0, atFret(5)))).toBe(
      'This is the major 3rd above the root: string 2, the same fret. ' +
        'Crossing the G and B strings, a shape moves up 1 fret.',
    );
  });

  it('asks for the shape, then for any position as the scope widens', () => {
    expect(d6Question(prompt('interval:M3@s6→s5', 0))).toEqual({
      before: 'Tap the ',
      after: ' above the root on string 5',
    });
    expect(d6Question(prompt('interval:M3@s6→s5', 1))).toEqual({
      before: 'Tap a ',
      after: ' from the root, on any string',
    });
    expect(d6Hint(prompt('interval:M3@s6→s5', 0))).toBe('Tap the fret on string 5.');
    expect(d6Hint(prompt('interval:M3@s6→s5', 1, atFret(5)))).toBe(
      'Any string, frets 3–7. Above or below the root both count.',
    );
    expect(d6Hint(prompt('interval:M3@s6→s5', 2))).toBe(
      'Any string, frets 0–12. Above or below the root both count.',
    );
  });

  it('explains right taps, wrong taps, root taps and a forgotten shift', () => {
    const p = prompt('interval:M3@s6→s5', 1, atFret(5));
    expect(d6Explain(p, fb(p, p.shapeTarget))).toBe(
      'The major 3rd shape: string 5, 1 fret toward the nut.',
    );
    expect(d6Explain(p, fb(p, { string: 5, fret: 5 }))).toBe(
      'You tapped the 4 (perfect 4th). The major 3rd shape: string 5, 1 fret toward the nut.',
    );
    expect(d6Explain(p, fb(p, p.root))).toMatch(/^You tapped the root\. /);
    expect(d6Explain(p, fb(p, { string: 5, fret: 3 }))).toBe(
      'You tapped the ♭3 (minor 3rd). The major 3rd shape: string 5, 1 fret toward the nut.',
    );

    const s = prompt('interval:M3@s3→s2', 0, atFret(5));
    expect(d6Explain(s, fb(s, s.shapeTarget))).toBe(
      'The major 3rd shape: string 2, the same fret. ' +
        'Crossing the G and B strings, a shape moves up 1 fret.',
    );
    expect(d6Explain(s, fb(s, { string: 2, fret: 4 }))).toBe(
      "That's the shape without the G–B shift. " +
        'Crossing the G and B strings, a shape moves up 1 fret. ' +
        'The major 3rd shape: string 2, the same fret.',
    );
  });
});
