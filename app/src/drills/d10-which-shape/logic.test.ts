import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine/skills';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  chromaOf,
  midiAt,
  noteAt,
  type AccidentalPref,
  type CagedShapeName,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillFeedback } from '../types';
import drill from './drill';
import {
  D10_REGION,
  d10Beside,
  d10CanTest,
  d10Check,
  d10Choices,
  d10ConceptOf,
  d10DegreeLine,
  d10DegreeStyle,
  d10DescribeAnswer,
  d10Display,
  d10Explain,
  d10FeedbackPositions,
  d10KeyToAnswer,
  d10LevelFor,
  d10MakePrompt,
  d10PickAsk,
  d10Placements,
  d10ShowsDegrees,
  d10Sounds,
  d10Subject,
  d10Window,
  type D10Answer,
  type D10Prompt,
} from './logic';

/** Returns `values` in turn, then the last one for ever. */
const seq =
  (...values: number[]) =>
  () => {
    const v = values.length > 1 ? values.shift() : values[0];
    return v ?? 0;
  };

const ctx = (
  over: { scopeLevel?: number; rng?: () => number; tuning?: Tuning; pref?: AccidentalPref } = {},
) => ({
  tuning: over.tuning ?? STANDARD_TUNING,
  accidentalPref: over.pref ?? 'sharp',
  scopeLevel: over.scopeLevel ?? 0,
  rng: over.rng ?? (() => 0),
});

const make = (id: string, over: Parameters<typeof ctx>[0] = {}) =>
  d10MakePrompt({ id, skillId: 'C6.major-shapes' }, ctx(over));

// rng → question, by the default weights (name 3, next 2, previous 1).
const NAME = 0;
const NEXT = 0.6;
const PREVIOUS = 0.9;

const at = (string: number, fret: number): Position => ({ string, fret });
const pos = (p: Position) => ({ string: p.string, fret: p.fret });
const fb = (p: D10Prompt, answer: D10Answer): DrillFeedback<D10Answer> => ({
  answer,
  result: d10Check(p, answer),
});

const SHAPE_IDS = SKILLS.filter((s) => s.topic === 'C6')
  .flatMap((s) => s.items().map((i) => i.id))
  .filter((id) => id.startsWith('caged:'));

/** The chain up the neck, independent of the theory module. */
const AFTER: Record<CagedShapeName, CagedShapeName> = { C: 'A', A: 'G', G: 'E', E: 'D', D: 'C' };

/** A seeded stream (an LCG), so prompts land on many questions, roots and positions. */
const lcg = (seed: number) => {
  let s = (seed * 2654435761) % 2 ** 32;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
};
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('D10 items and scope', () => {
  it('names the whole shapes, and leaves triad cores to D9', () => {
    expect(SHAPE_IDS).toHaveLength(15);
    for (const id of SHAPE_IDS) expect(d10CanTest({ id, skillId: 'x' }), id).toBe(true);
    expect(d10CanTest({ id: 'caged-core:A-shape@major', skillId: 'x' })).toBe(false);
    expect(d10CanTest({ id: 'note@s6f5', skillId: 'x' })).toBe(false);
    expect(drill.skills).toEqual(['C6.major-shapes', 'C6.minor-shapes', 'C6.dominant7-shapes']);
    expect(drill.inputModes).toEqual(['choice']);
  });

  it('widens from three choices on natural roots to five on all twelve', () => {
    expect(d10LevelFor(-1)).toEqual({ roots: 'naturals', choices: 3 });
    expect(d10LevelFor(1)).toEqual({ roots: 'naturals', choices: 5 });
    expect(d10LevelFor(2)).toEqual({ roots: 'all', choices: 5 });
    expect(d10LevelFor(9)).toEqual({ roots: 'all', choices: 5 });
  });

  it('keys every card by its shape, so C and A pair (rule 6)', () => {
    expect(d10ConceptOf({ id: 'caged:A-shape@major', skillId: 'x' })).toBe('caged:A');
    expect(d10ConceptOf({ id: 'caged:C-shape@minor', skillId: 'x' })).toBe('caged:C');
    expect(d10ConceptOf({ id: 'caged-core:C-shape@minor', skillId: 'x' })).toBeNull();
  });

  it('refuses items it cannot test, and tunings without six strings', () => {
    expect(() => make('caged-core:A-shape@major')).toThrow(/cannot test/);
    const bass: Tuning = { id: 'bass', name: 'Bass', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(() => make('caged:A-shape@major', { tuning: bass })).toThrow(/cannot test/);
  });

  it('draws questions by the configured weights', () => {
    const asks = ['name', 'next', 'previous'] as const;
    expect(d10PickAsk(asks, () => 0)).toBe('name');
    expect(d10PickAsk(asks, () => 0.49)).toBe('name');
    expect(d10PickAsk(asks, () => 0.5)).toBe('next');
    expect(d10PickAsk(asks, () => 0.83)).toBe('next');
    expect(d10PickAsk(asks, () => 0.99)).toBe('previous');
    expect(d10PickAsk(['previous'], () => 0)).toBe('previous');
    expect(d10PickAsk([], () => 0)).toBeUndefined();
  });
});

describe('d10MakePrompt', () => {
  it('shows the C shape of C as the open chord and asks which shape it is', () => {
    const p = make('caged:C-shape@major', { rng: () => NAME });
    expect(p).toMatchObject({ ask: 'name', shape: 'C', root: 'C', chord: 'C', level: 0 });
    expect(p.shown).toBe(p.answer);
    expect(p.shown.notes.map(pos)).toEqual([at(5, 3), at(4, 2), at(3, 0), at(2, 1), at(1, 0)]);
    expect(p.shown.rootString).toBe(5);
    // Three choices, always with the A shape, which shares the root string.
    expect(p.choices).toEqual(['C', 'A', 'G']);
  });

  it('shows the A shape and asks for the next: the G shape, up the neck', () => {
    const p = make('caged:G-shape@major', { rng: seq(NEXT, 0, 0, 0) });
    expect(p).toMatchObject({ ask: 'next', shape: 'G', root: 'C' });
    expect(p.shown.shape).toBe('A');
    expect(p.shown.span).toEqual({ from: 3, to: 5 });
    expect(p.answer.span).toEqual({ from: 5, to: 8 });
    // The shown A shape is no answer; the C shape is the one the other way.
    expect(p.choices).toEqual(['C', 'G', 'E']);
  });

  it('shows the G shape and asks for the one before: the A shape, down the neck', () => {
    const p = make('caged:A-shape@major', { rng: seq(PREVIOUS, 0, 0, 0) });
    expect(p).toMatchObject({ ask: 'previous', shape: 'A', root: 'C' });
    expect(p.shown.shape).toBe('G');
    expect(p.answer.span).toEqual({ from: 3, to: 5 });
    expect(p.choices).toEqual(['C', 'A', 'E']);
  });

  it('spells minor and dominant-7 chords, and flats on request', () => {
    expect(make('caged:E-shape@minor').chord).toBe('Cm');
    expect(make('caged:E-shape@dominant7').chord).toBe('C7');
    const flat = make('caged:E-shape@major', { scopeLevel: 2, rng: seq(NAME, 0.1), pref: 'flat' });
    expect(flat.root).toBe('Db');
  });

  it('offers all five shapes once the scope widens', () => {
    expect(make('caged:D-shape@major', { scopeLevel: 1 }).choices).toEqual([
      'C',
      'A',
      'G',
      'E',
      'D',
    ]);
  });

  it('varies question, root and position for every card, with true shapes', () => {
    for (const id of SHAPE_IDS) {
      for (const scopeLevel of [0, 2]) {
        const asks = new Set<string>();
        const roots = new Set<string>();
        const places = new Set<number>();
        for (const seed of SEEDS) {
          const p = make(id, { scopeLevel, rng: lcg(seed) });
          asks.add(p.ask);
          roots.add(p.root);
          places.add(p.answer.span.from);
          expect(p.choices).toContain(p.shape);
          expect(p.choices).toHaveLength(scopeLevel === 0 ? 3 : 5);
          for (const n of [...p.shown.notes, ...p.answer.notes]) {
            expect(n.fret).toBeGreaterThanOrEqual(D10_REGION.from);
            expect(n.fret).toBeLessThanOrEqual(D10_REGION.to);
          }
          // Every root square holds the root.
          for (const n of p.answer.notes.filter((x) => x.degree === 'R')) {
            expect(noteAt(n).chroma).toBe(chromaOf(p.root));
          }
          if (p.ask === 'name') {
            expect(p.shown).toBe(p.answer);
          } else {
            const [lower, upper] = p.ask === 'next' ? [p.shown, p.answer] : [p.answer, p.shown];
            expect(AFTER[lower.shape]).toBe(upper.shape);
            const gap = upper.span.from - lower.span.from;
            expect(gap, id).toBeGreaterThanOrEqual(2);
            expect(gap, id).toBeLessThanOrEqual(3);
            if (scopeLevel === 0) expect(p.choices).not.toContain(p.shown.shape);
          }
        }
        expect(asks.size, id).toBe(3);
        expect(roots.size, id).toBeGreaterThanOrEqual(scopeLevel === 0 ? 5 : 8);
        expect(places.size, id).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('keeps each note at its pitch in drop D', () => {
    const std = make('caged:E-shape@major', { rng: () => NAME });
    const dropD = make('caged:E-shape@major', { rng: () => NAME, tuning: DROP_D_TUNING });
    const pitches = (p: D10Prompt) => p.answer.notes.map((n) => midiAt(n, p.tuning));
    expect(pitches(dropD)).toEqual(pitches(std));
    const low = (p: D10Prompt) => p.answer.notes.find((n) => n.string === 6)?.fret;
    expect(low(dropD)).toBe((low(std) ?? 0) + 2);
  });
});

describe('placements and the chain', () => {
  it('places a shape at every position that fits the neck', () => {
    const spans = d10Placements('E', 'major', 'C', STANDARD_TUNING).map((p) => p.span);
    expect(spans).toEqual([{ from: 8, to: 10 }]);
    expect(d10Placements('E', 'major', 'E', STANDARD_TUNING).map((p) => p.span)).toEqual([
      { from: 0, to: 2 },
      { from: 12, to: 14 },
    ]);
    expect(d10Placements('D', 'major', 'C', STANDARD_TUNING, { from: 0, to: 12 })).toEqual([]);
  });

  it('finds the neighbour just up or down the neck', () => {
    const a = d10Placements('A', 'major', 'C', STANDARD_TUNING);
    const c = d10Placements('C', 'major', 'C', STANDARD_TUNING);
    const d = d10Placements('D', 'major', 'C', STANDARD_TUNING);
    expect(d10Beside(c[0]!, a, 1)?.span.from).toBe(3);
    expect(d10Beside(a[0]!, c, -1)?.span.from).toBe(0);
    // D wraps round to C: the C shape twelve frets up.
    expect(d10Beside(d[0]!, c, 1)?.span.from).toBe(12);
    expect(d10Beside(c[0]!, a, -1)).toBeUndefined();
  });

  it('puts the likeliest mix-up among three choices', () => {
    const r = () => 0.99;
    expect(d10Choices('name', 'A', 'A', 3, r)).toEqual(['C', 'A', 'D']);
    expect(d10Choices('name', 'E', 'E', 3, r)).toEqual(['G', 'E', 'D']);
    // The D shape has no partner on its root string: any two others.
    expect(d10Choices('name', 'D', 'D', 3, () => 0)).toEqual(['C', 'A', 'D']);
    // After the E shape comes D; the G shape is the other way.
    expect(d10Choices('next', 'D', 'E', 3, r)).toEqual(['A', 'G', 'D']);
    // Before the C shape comes D (round the chain); the A shape is the other way.
    expect(d10Choices('previous', 'D', 'C', 3, () => 0)).toEqual(['A', 'G', 'D']);
    expect(d10Choices('next', 'G', 'A', 5, r)).toEqual(['C', 'A', 'G', 'E', 'D']);
  });
});

describe('d10Check', () => {
  it('logs a wrong name as that shape mix-up (rule 6)', () => {
    const p = make('caged:A-shape@major', { rng: () => NAME });
    expect(d10Check(p, 'A')).toEqual({ correct: true, expected: 'the A shape of C' });
    expect(d10Check(p, 'C')).toEqual({
      correct: false,
      expected: 'the A shape of C',
      confusedWith: 'caged:C',
      concept: 'caged:A',
    });
  });

  it('does not log a slip along the chain as a shape confusion', () => {
    const p = make('caged:G-shape@major', { rng: seq(NEXT, 0, 0, 0) });
    expect(d10Check(p, 'C')).toEqual({
      correct: false,
      expected: 'the G shape, after the A shape',
    });
    const q = make('caged:A-shape@major', { rng: seq(PREVIOUS, 0, 0, 0) });
    expect(d10Subject(q)).toBe('the A shape, before the G shape');
    expect(d10Check(q, 'A').correct).toBe(true);
  });

  it('describes, sounds and places the answer shape', () => {
    const p = make('caged:G-shape@major', { rng: seq(NEXT, 0, 0, 0) });
    expect(d10DescribeAnswer('E')).toBe('E');
    // The G shape of C at frets 5–8, low to high.
    expect(d10Sounds(p, fb(p, 'E'))).toEqual({ expected: ['C3', 'E3', 'G3', 'C4', 'E4', 'C5'] });
    expect(d10FeedbackPositions(p, fb(p, 'G')).expected).toEqual(p.answer.notes.map(pos));
    expect(d10FeedbackPositions(p, fb(p, 'G')).given).toEqual([]);
  });
});

describe('feedback text', () => {
  it('names the shape and its degrees', () => {
    const p = make('caged:A-shape@major', { rng: () => NAME });
    expect(d10Explain(p, fb(p, 'A'))).toBe("That's the A shape of C: R 5 R 3 5 on strings 5–1.");
  });

  it('says why the C and A shapes differ, sharing a root string', () => {
    const p = make('caged:A-shape@major', { rng: () => NAME });
    expect(d10Explain(p, fb(p, 'C'))).toBe(
      'You picked the C shape. Both root on string 5: the A shape reaches up from the root, ' +
        'the C shape back toward the nut. This is the A shape of C: R 5 R 3 5 on strings 5–1.',
    );
  });

  it('points to the root string for any other wrong name', () => {
    const p = make('caged:A-shape@major', { rng: () => NAME });
    expect(d10Explain(p, fb(p, 'G'))).toMatch(
      /^You picked the G shape\. The G shape roots on string 6; this one roots on string 5\./,
    );
  });

  it('walks the chain for next and previous', () => {
    const next = make('caged:G-shape@major', { rng: seq(NEXT, 0, 0, 0) });
    expect(d10Explain(next, fb(next, 'G'))).toBe(
      'Up the neck the chain runs C A G E D, then round again: ' +
        'after the A shape comes the G shape, at frets 5–8.',
    );
    const prev = make('caged:A-shape@major', { rng: seq(PREVIOUS, 0, 0, 0) });
    expect(d10Explain(prev, fb(prev, 'C'))).toBe(
      'You picked the C shape. Down the neck the chain runs D E G A C, then round again: ' +
        'before the G shape comes the A shape, at frets 3–5.',
    );
  });

  it('formats degrees, accidentals and guides', () => {
    expect(d10Display('F#')).toBe('F♯');
    expect(d10Display('Bb')).toBe('B♭');
    expect(d10Display('b3')).toBe('♭3');
    expect(d10DegreeStyle('R')).toBe('root');
    expect(d10DegreeStyle('b3')).toBe('third');
    expect(d10DegreeStyle('5')).toBe('fifth');
    expect(d10DegreeStyle('b7')).toBe('seventh');
    expect(
      d10DegreeLine([
        { string: 1, fret: 0, degree: '3' },
        { string: 2, fret: 1, degree: 'R' },
      ]),
    ).toBe('R 3');
    expect(d10ShowsDegrees(1, false)).toBe(false);
    expect(d10ShowsDegrees(2, false)).toBe(true);
    expect(d10ShowsDegrees(0, true)).toBe(true);
  });

  it('answers from the keyboard by letter', () => {
    expect(d10KeyToAnswer('a', ['C', 'A', 'G'])).toBe('A');
    expect(d10KeyToAnswer('E', ['C', 'A', 'G'])).toBeNull();
    expect(d10KeyToAnswer('1', ['C', 'A', 'G'])).toBeNull();
  });
});

describe('d10Window', () => {
  const p = make('caged:G-shape@major', { rng: seq(NEXT, 0, 0, 0) });

  it('shows the whole neck on iPad landscape', () => {
    expect(d10Window(p, 'regular-wide', 5)).toEqual({ from: 0, to: 15 });
  });

  it('centres 12 frets, or the compact window, on the shape and its neighbour', () => {
    // The A shape at frets 3–5 and the G shape at 5–8.
    expect(d10Window(p, 'regular', 5)).toEqual({ from: 0, to: 12 });
    expect(d10Window(p, 'compact', 5)).toEqual({ from: 3, to: 9 });
    expect(d10Window(p, 'compact', 9)).toEqual({ from: 2, to: 10 });
    const high = make('caged:C-shape@major', { rng: seq(NEXT, 0, 0, 0) });
    // After the D shape of C (frets 10–13) comes the C shape at 12–15.
    expect(high.answer.span).toEqual({ from: 12, to: 15 });
    expect(d10Window(high, 'regular', 5)).toEqual({ from: 3, to: 15 });
    expect(d10Window(high, 'compact', 5)).toEqual({ from: 9, to: 15 });
  });
});
