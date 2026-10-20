import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine/skills';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  midiAt,
  type AccidentalPref,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillFeedback } from '../types';
import drill from './drill';
import {
  D21_LEVELS,
  D21_REGION,
  d21CanTest,
  d21Check,
  d21ConceptOf,
  d21DegreeName,
  d21DegreeStyle,
  d21DescribeAnswer,
  d21Explain,
  d21FeedbackPositions,
  d21FretLine,
  d21GradedResponseMs,
  d21LevelFor,
  d21MakePrompt,
  d21Noun,
  d21OpenShape,
  d21Placements,
  d21PositionHint,
  d21Question,
  d21RegularWindow,
  d21ShowsCount,
  d21Sounds,
  d21Span,
  d21Subject,
  d21Window,
  type D21Answer,
  type D21Prompt,
} from './logic';

const ctx = (
  over: { scopeLevel?: number; rng?: () => number; tuning?: Tuning; pref?: AccidentalPref } = {},
) => ({
  tuning: over.tuning ?? STANDARD_TUNING,
  accidentalPref: over.pref ?? 'sharp',
  scopeLevel: over.scopeLevel ?? 0,
  rng: over.rng ?? (() => 0),
});

const make = (id: string, over: Parameters<typeof ctx>[0] = {}) =>
  d21MakePrompt({ id, skillId: 'C6.major-shapes' }, ctx(over));

/** A spread of rng values, so prompts land on many positions and asks. */
const RNGS = Array.from({ length: 40 }, (_, i) => i / 40);

/** The prompt for `id` at `position` (and `ask`), found by trying rng values. */
function makeAt(
  id: string,
  position: number,
  over: Parameters<typeof ctx>[0] & { ask?: D21Prompt['ask'] } = {},
): D21Prompt {
  for (const r of RNGS) {
    // Roots alone at scope 1, so the rng picks only the placement.
    const scopeLevel = over.ask && over.ask !== 'root' ? 2 : 1;
    const p = make(id, { scopeLevel, ...over, rng: () => r });
    if (p.position === position && (!over.ask || p.ask === over.ask)) return p;
  }
  throw new Error(`no ${id} prompt at fret ${position}`);
}

const at = (string: number, fret: number): Position => ({ string, fret });
const pos = (p: Position) => ({ string: p.string, fret: p.fret });
const fb = (p: D21Prompt, answer: D21Answer): DrillFeedback<D21Answer> => ({
  answer,
  result: d21Check(p, answer),
});

const SHAPE_IDS = SKILLS.filter((s) => s.topic === 'C6').flatMap((s) =>
  s
    .items()
    .map((i) => i.id)
    .filter((id) => id.startsWith('caged:')),
);

/**
 * An independent key: each major shape as string → frets above its lowest
 * fret, and which strings hold its roots (the open chords x32010, x02220,
 * 320003, 022100 and xx0232).
 */
const MAJOR: Record<string, { frets: Record<number, number>; roots: number[] }> = {
  C: { frets: { 5: 3, 4: 2, 3: 0, 2: 1, 1: 0 }, roots: [5, 2] },
  A: { frets: { 5: 0, 4: 2, 3: 2, 2: 2, 1: 0 }, roots: [5, 3] },
  G: { frets: { 6: 3, 5: 2, 4: 0, 3: 0, 2: 0, 1: 3 }, roots: [6, 3, 1] },
  E: { frets: { 6: 0, 5: 2, 4: 2, 3: 1, 2: 0, 1: 0 }, roots: [6, 4, 1] },
  D: { frets: { 4: 0, 3: 2, 2: 3, 1: 2 }, roots: [4, 2] },
};

describe('D21 items and scope', () => {
  it('tests the whole-shape C6 cards, not the triad cores', () => {
    expect(SHAPE_IDS).toHaveLength(15);
    for (const id of SHAPE_IDS) expect(d21CanTest({ id, skillId: 'x' }), id).toBe(true);
    expect(d21CanTest({ id: 'caged-core:A-shape@major', skillId: 'x' })).toBe(false);
    expect(d21CanTest({ id: 'note@s6f5', skillId: 'x' })).toBe(false);
    expect(drill.skills).toEqual(['C6.major-shapes', 'C6.minor-shapes', 'C6.dominant7-shapes']);
  });

  it('keys every card by its shape, so C and A pair (rule 6)', () => {
    expect(d21ConceptOf({ id: 'caged:A-shape@major', skillId: 'x' })).toBe('caged:A');
    expect(d21ConceptOf({ id: 'caged-core:A-shape@major', skillId: 'x' })).toBeNull();
    expect(d21ConceptOf({ id: 'octaves:G', skillId: 'x' })).toBeNull();
  });

  it('widens from low positions and roots to the whole neck and other notes', () => {
    expect(d21LevelFor(-1)).toBe(D21_LEVELS[0]);
    expect(d21LevelFor(1)).toEqual({ maxPosition: 12, asks: ['root'] });
    expect(d21LevelFor(9)).toBe(D21_LEVELS[2]);
  });

  it('refuses items it cannot test, and tunings without six strings', () => {
    expect(() => make('note@s6f5')).toThrow(/cannot test/);
    expect(() => make('caged-core:A-shape@major')).toThrow(/cannot test/);
    const bass: Tuning = { id: 'bass', name: 'Bass', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(() => make('caged:A-shape@major', { tuning: bass })).toThrow(/cannot test/);
  });
});

describe('D21 prompts', () => {
  it('places every shape by its lowest fret and asks for its roots, per the key', () => {
    for (const [shape, key] of Object.entries(MAJOR)) {
      for (const r of RNGS) {
        const p = make(`caged:${shape}-shape@major`, { scopeLevel: 1, rng: () => r });
        expect(p.ask).toBe('root');
        expect(p.position).toBeLessThanOrEqual(12);
        const drawn = p.shapeNotes.map(pos).sort((a, b) => a.string - b.string);
        const expected = Object.entries(key.frets)
          .map(([s, f]) => at(Number(s), p.position + f))
          .sort((a, b) => a.string - b.string);
        expect(drawn, `${shape} at ${p.position}`).toEqual(expected);
        expect(p.targets.map((t) => t.string).sort()).toEqual([...key.roots].sort());
        for (const n of p.shapeNotes) expect(n.fret).toBeLessThanOrEqual(D21_REGION.to);
      }
    }
  });

  it('keeps to the low positions at the narrowest scope, and varies them (rule 12)', () => {
    const positions = new Set<number>();
    for (const r of RNGS) {
      const p = make('caged:E-shape@major', { rng: () => r });
      expect(p.position).toBeLessThanOrEqual(5);
      expect(p.ask).toBe('root');
      positions.add(p.position);
    }
    expect(positions.size).toBe(6);
    const wide = new Set(
      RNGS.map((r) => make('caged:E-shape@major', { scopeLevel: 1, rng: () => r }).position),
    );
    expect(Math.max(...wide)).toBe(12);
  });

  it('names the chord from where the shape sits: the A shape at fret 5 is D', () => {
    const p = makeAt('caged:A-shape@major', 5, { ask: 'root' });
    expect(p.root).toBe('D');
    expect(p.chord).toBe('D');
    expect(p.targets.map(pos)).toEqual([at(5, 5), at(3, 7)]);
    expect(d21Subject(p)).toBe('the A shape of D at fret 5');
    expect(d21Question(p)).toBe('Picture the A shape at fret 5, then tap every root.');
    expect(d21PositionHint(p)).toMatch(/Fret 5 is its lowest fret/);
  });

  it('says "open position" at the nut', () => {
    const p = makeAt('caged:A-shape@minor', 0, { ask: 'root' });
    expect(d21Subject(p)).toBe('the A shape of Am in open position');
    expect(d21Question(p)).toBe('Picture the A shape in open position, then tap every root.');
    expect(d21PositionHint(p)).toMatch(/Open position/);
  });

  it('asks for 3rds, ♭3s and ♭7s at the widest scope', () => {
    const third = makeAt('caged:E-shape@major', 7, { ask: 'third' });
    expect(d21Noun(third)).toBe('3rd');
    expect(third.targets.map(pos)).toEqual([at(3, 8)]);
    const flat3 = makeAt('caged:E-shape@minor', 7, { ask: 'third' });
    expect(d21Noun(flat3)).toBe('♭3');
    expect(flat3.targets.map(pos)).toEqual([at(3, 7)]);
    const seventh = makeAt('caged:E-shape@dominant7', 7, { ask: 'seventh' });
    expect(d21Noun(seventh)).toBe('♭7');
    expect(seventh.targets.map(pos)).toEqual([at(4, 7)]);
    // Only a 7 shape has a ♭7 to ask for.
    for (const r of RNGS) {
      expect(make('caged:E-shape@major', { scopeLevel: 2, rng: () => r }).ask).not.toBe('seventh');
    }
  });

  it('spells the root per the accidental preference', () => {
    const sharp = makeAt('caged:A-shape@major', 1);
    const flat = makeAt('caged:A-shape@major', 1, { pref: 'flat' });
    expect([sharp.root, flat.root]).toEqual(['A#', 'Bb']);
    expect(d21Subject(flat)).toBe('the A shape of B♭ at fret 1');
  });

  it('keeps every pitch in drop D, and the position is still the lowest fret', () => {
    const std = makeAt('caged:E-shape@major', 3, { scopeLevel: 1 });
    const drop = makeAt('caged:E-shape@major', 3, { scopeLevel: 1, tuning: DROP_D_TUNING });
    expect(drop.root).toBe(std.root);
    expect(drop.shapeNotes.map((n) => midiAt(n, DROP_D_TUNING))).toEqual(
      std.shapeNotes.map((n) => midiAt(n, STANDARD_TUNING)),
    );
    expect(drop.targets.find((t) => t.string === 6)?.fret).toBe(5);
    expect(d21Span(DROP_D_TUNING)).toBeGreaterThan(d21Span(STANDARD_TUNING));
  });

  it('places the partner shape at the same position (C ↔ A, G ↔ E; none for D)', () => {
    const a = makeAt('caged:A-shape@major', 5, { ask: 'root' });
    // The C shape at fret 5 is F: roots at string 5 fret 8 and string 2 fret 6.
    expect(a.partner).toEqual({ shape: 'C', targets: [at(5, 8), at(2, 6)] });
    const d = makeAt('caged:D-shape@major', 5);
    expect(d.partner).toBeNull();
    // The G shape at fret 12 is G: roots at frets 15, 12 and 15.
    expect(makeAt('caged:E-shape@major', 12).partner).toEqual({
      shape: 'G',
      targets: [at(6, 15), at(3, 12), at(1, 15)],
    });
  });

  it('lists every placement on the neck', () => {
    const all = d21Placements('E', 'major', STANDARD_TUNING, 'sharp');
    expect(all.map((p) => p.position).sort((x, y) => x - y)).toEqual([...Array(14).keys()]);
    expect(d21Span(STANDARD_TUNING)).toBe(3);
  });
});

describe('D21 grading', () => {
  const a = () => makeAt('caged:A-shape@major', 5, { ask: 'root' });

  it('is correct once every target is tapped, in any order', () => {
    const p = a();
    expect(d21Check(p, [at(3, 7), at(5, 5)])).toEqual({
      correct: true,
      expected: 'the A shape of D at fret 5',
    });
    expect(d21Check(p, [at(5, 5)]).correct).toBe(false);
    expect(d21Check(p, [at(5, 5)]).confusedWith).toBeUndefined();
  });

  it('logs a root of the C shape at the same fret as that confusion', () => {
    const r = d21Check(a(), [at(5, 5), at(2, 6)]);
    expect(r).toMatchObject({ correct: false, confusedWith: 'caged:C', concept: 'caged:A' });
    expect(d21Explain(a(), fb(a(), [at(5, 5), at(2, 6)]))).toBe(
      "You tapped string 2, fret 6. That's a root of the C shape at fret 5. " +
        "It's the A shape of D at fret 5: R 5 R 3 5 from strings 5–1.",
    );
  });

  it('marks another note of the shape, or one off it, wrong without a confusion', () => {
    const p = a();
    expect(d21Check(p, [at(4, 7)])).toEqual({ correct: false, expected: d21Subject(p) });
    expect(d21Explain(p, fb(p, [at(4, 7)]))).toMatch(
      /^You tapped string 4, fret 7\. That's the shape's 5th, not a root\./,
    );
    expect(d21Explain(p, fb(p, [at(6, 1)]))).toMatch(/^You tapped string 6, fret 1\. It's the A/);
  });

  it('explains a right answer and a short one', () => {
    const p = a();
    expect(d21Explain(p, fb(p, [at(5, 5), at(3, 7)]))).toBe(
      "That's the A shape of D at fret 5: R 5 R 3 5 from strings 5–1.",
    );
    expect(d21Explain(p, fb(p, [at(5, 5)]))).toMatch(/1 still to find, ringed on the neck\.$/);
  });

  it('logs taps, grades time per target, and plays the chord', () => {
    const p = a();
    expect(d21DescribeAnswer([at(5, 5), at(3, 7)])).toBe('s5f5 s3f7');
    expect(d21DescribeAnswer([])).toBe('none');
    expect(d21GradedResponseMs(p, [], 6000)).toBe(3000);
    expect(d21Sounds(p, fb(p, [at(5, 5), at(3, 7)]))).toEqual({
      expected: ['D3', 'A3', 'D4', 'F#4', 'A4'],
    });
    expect(d21Sounds(p, fb(p, [at(2, 6)]))).toEqual({
      expected: ['D3', 'A3', 'D4', 'F#4', 'A4'],
      given: ['F4'],
    });
    expect(d21FeedbackPositions(p, fb(p, [at(2, 6)]))).toEqual({
      expected: p.targets,
      given: [at(2, 6)],
    });
  });

  it('names degrees and draws them by shape', () => {
    expect(['R', '3', 'b3', '5', 'b7'].map((d) => d21DegreeName(d as never))).toEqual([
      'root',
      '3rd',
      '♭3',
      '5th',
      '♭7',
    ]);
    expect(['R', '3', 'b3', '5', 'b7'].map((d) => d21DegreeStyle(d as never))).toEqual([
      'root',
      'third',
      'third',
      'fifth',
      'seventh',
    ]);
  });

  it('shows the total only while guides are up (rule 9)', () => {
    expect(d21ShowsCount(0, false)).toBe(false);
    expect(d21ShowsCount(1, false)).toBe(false);
    expect(d21ShowsCount(2, false)).toBe(true);
    expect(d21ShowsCount(0, true)).toBe(true);
  });
});

describe('D21 windows and panel helpers', () => {
  it('opens a compact window from a fret below the position, whatever the shape', () => {
    const p = makeAt('caged:A-shape@major', 5);
    expect(d21Window(p, 5)).toEqual({ from: 4, to: 10 });
    expect(d21Window(p, 9)).toEqual({ from: 4, to: 12 });
    const c = makeAt('caged:C-shape@major', 5);
    expect(d21Window(c, 5)).toEqual(d21Window(p, 5));
    expect(d21Window(makeAt('caged:A-shape@major', 0), 5)).toEqual({ from: 0, to: 6 });
    expect(d21Window(makeAt('caged:E-shape@major', 12, { scopeLevel: 1 }), 5)).toEqual({
      from: 9,
      to: 15,
    });
  });

  it("slides iPad portrait's 12-fret neck up only when the shape needs it", () => {
    expect(d21RegularWindow(makeAt('caged:A-shape@major', 5))).toEqual({ from: 0, to: 12 });
    expect(d21RegularWindow(makeAt('caged:E-shape@major', 11, { scopeLevel: 1 }))).toEqual({
      from: 2,
      to: 14,
    });
  });

  it('draws the open shape to slide, and lists frets from string 6', () => {
    expect(d21FretLine(d21OpenShape({ shape: 'A', quality: 'major' }))).toBe('x-0-2-2-2-0');
    expect(d21FretLine(d21OpenShape({ shape: 'C', quality: 'major' }))).toBe('x-3-2-0-1-0');
    expect(d21FretLine(d21OpenShape({ shape: 'C', quality: 'dominant7' }))).toBe('x-3-2-3-1-0');
  });
});
