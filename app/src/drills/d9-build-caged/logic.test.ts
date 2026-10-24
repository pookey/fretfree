import { Note } from 'tonal';
import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine/skills';
import { cagedContent } from '../../screens/explore/views/caged';
import {
  CAGED_ORDER,
  CAGED_QUALITIES,
  DROP_D_TUNING,
  STANDARD_TUNING,
  chromaOf,
  chromaToPc,
  midiAt,
  noteAt,
  type AccidentalPref,
  type Degree,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillFeedback } from '../types';
import drill from './drill';
import {
  D9_REGION,
  d9CanTest,
  d9Check,
  d9ConceptOf,
  d9DegreeLine,
  d9DegreeStyle,
  d9DescribeAnswer,
  d9Display,
  d9Explain,
  d9FeedbackPositions,
  d9GradedResponseMs,
  d9MakePrompt,
  d9NoteName,
  d9Placements,
  d9Reach,
  d9RegularWindow,
  d9ScopeFor,
  d9ShowsCount,
  d9Sounds,
  d9StringSpan,
  d9Subject,
  d9Window,
  type D9Answer,
  type D9Prompt,
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
  d9MakePrompt({ id, skillId: 'C6.triad-cores' }, ctx(over));

const at = (string: number, fret: number): Position => ({ string, fret });
const pos = (p: Position) => ({ string: p.string, fret: p.fret });
const fb = (p: D9Prompt, answer: D9Answer): DrillFeedback<D9Answer> => ({
  answer,
  result: d9Check(p, answer),
});

/** Semitones above the root for each degree, independent of the theory module. */
const SEMITONES: Record<string, number> = { R: 0, b3: 3, '3': 4, '5': 7, b7: 10 };

const C6_IDS = SKILLS.filter((s) => s.topic === 'C6').flatMap((s) => s.items().map((i) => i.id));

/** A spread of rng values, so prompts land on many roots and positions. */
const RNGS = Array.from({ length: 16 }, (_, i) => i / 16);

describe('D9 items and scope', () => {
  it('tests every C6 card and nothing else', () => {
    expect(C6_IDS).toHaveLength(25);
    for (const id of C6_IDS) expect(d9CanTest({ id, skillId: 'x' }), id).toBe(true);
    expect(d9CanTest({ id: 'note@s6f5', skillId: 'x' })).toBe(false);
    expect(drill.skills).toEqual(SKILLS.filter((s) => s.topic === 'C6').map((s) => s.id));
  });

  it('widens from natural roots to all twelve', () => {
    expect(d9ScopeFor(-1)).toBe('naturals');
    expect(d9ScopeFor(0)).toBe('naturals');
    expect(d9ScopeFor(1)).toBe('all');
    expect(d9ScopeFor(7)).toBe('all');
  });

  it('keys every card by its shape, so C and A pair (rule 6)', () => {
    expect(d9ConceptOf({ id: 'caged-core:A-shape@major', skillId: 'x' })).toBe('caged:A');
    expect(d9ConceptOf({ id: 'caged:C-shape@minor', skillId: 'x' })).toBe('caged:C');
    expect(d9ConceptOf({ id: 'octaves:G', skillId: 'x' })).toBeNull();
  });

  it('refuses items it cannot test, and tunings without six strings', () => {
    expect(() => make('note@s6f5')).toThrow(/cannot test/);
    const bass: Tuning = { id: 'bass', name: 'Bass', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(() => make('caged:A-shape@major', { tuning: bass })).toThrow(/cannot test/);
  });
});

describe('d9MakePrompt', () => {
  it('builds the A-shape triad of C on strings 3–1 from the root at string 5, fret 3', () => {
    const p = make('caged-core:A-shape@major');
    expect(p.part).toBe('core');
    expect(p.root).toBe('C');
    expect(p.chord).toBe('C');
    expect(pos(p.anchor)).toEqual(at(5, 3));
    expect(p.targets.map(pos)).toEqual([at(3, 5), at(2, 5), at(1, 3)]);
    expect(p.targets.map((t) => t.degree)).toEqual(['R', '3', '5']);
    expect(p.strings).toEqual([3, 2, 1]);
    expect(p.partner?.shape).toBe('C');
  });

  it('builds the whole C shape of C as the open chord, minus the given root', () => {
    const p = make('caged:C-shape@major');
    expect(p.part).toBe('shape');
    expect(pos(p.anchor)).toEqual(at(5, 3));
    expect(p.targets.map(pos)).toEqual([at(4, 2), at(3, 0), at(2, 1), at(1, 0)]);
    expect(p.shapeNotes).toHaveLength(5);
    expect(p.partner?.shape).toBe('A');
    expect(p.partner?.notes.map(pos)).toContainEqual(at(2, 5));
  });

  it('puts the G-shape core on strings 4–2, and the D shape has no partner', () => {
    expect(make('caged-core:G-shape@major').strings).toEqual([4, 3, 2]);
    const d = make('caged:D-shape@major');
    expect(d.anchor.string).toBe(4);
    expect(d.partner).toBeNull();
  });

  it('spells minor and dominant-7 chords', () => {
    expect(make('caged:E-shape@minor').chord).toBe('Cm');
    expect(make('caged:E-shape@dominant7').chord).toBe('C7');
  });

  it('places every card at many roots, inside frets 0–12, with true degrees', () => {
    for (const id of C6_IDS) {
      for (const scopeLevel of [0, 1]) {
        const roots = new Set<string>();
        for (const r of RNGS) {
          const p = make(id, { scopeLevel, rng: () => r });
          roots.add(p.root);
          const rootMidi = midiAt(p.anchor);
          expect(p.anchor.degree).toBe('R');
          expect(noteAt(p.anchor).chroma).toBe(chromaOf(p.root));
          for (const n of [...p.targets, ...p.shapeNotes]) {
            expect(n.fret, id).toBeGreaterThanOrEqual(D9_REGION.from);
            expect(n.fret, id).toBeLessThanOrEqual(D9_REGION.to);
            const interval = (((midiAt(n) - rootMidi) % 12) + 12) % 12;
            expect(interval, `${id} ${n.degree}`).toBe(SEMITONES[n.degree]);
          }
          expect(
            p.targets.some((t) => t.string === p.anchor.string && t.fret === p.anchor.fret),
          ).toBe(false);
          if (p.part === 'core') {
            expect(p.targets).toHaveLength(3);
            const [a, b, c] = p.strings as [number, number, number];
            expect([a - b, b - c]).toEqual([1, 1]);
          } else {
            expect(p.targets).toHaveLength(p.shapeNotes.length - 1);
          }
        }
        // Rule 12: the same card meets many keys.
        expect(roots.size, id).toBeGreaterThanOrEqual(5);
        if (scopeLevel === 0) for (const r of roots) expect(r).toMatch(/^[A-G]$/);
      }
    }
  });

  it("spells roots from the chord's key once the scope widens, the preference breaking ties", () => {
    const roots = (pref: AccidentalPref) =>
      RNGS.map((r) => make('caged:E-shape@major', { scopeLevel: 1, rng: () => r, pref }).root);
    // F♯/G♭ follows the preference; every other key has its own spelling.
    expect(roots('sharp')).toContain('F#');
    expect(roots('sharp')).not.toContain('Gb');
    expect(roots('flat')).toContain('Gb');
    expect(roots('flat')).not.toContain('F#');
    for (const pref of ['sharp', 'flat'] as const) {
      expect(roots(pref)).toContain('Bb');
      expect(roots(pref)).not.toContain('A#');
    }
  });

  it('names a flat-key chord with flats for a learner who prefers sharps', () => {
    const prompts = RNGS.map((r) =>
      make('caged:A-shape@major', { scopeLevel: 1, rng: () => r, pref: 'sharp' }),
    );
    const bb = prompts.find((p) => chromaOf(p.root) === 10);
    expect(bb?.root).toBe('Bb');
    expect(bb?.chord).toBe('Bb');
    expect(bb?.accidentalPref).toBe('flat');
    expect(d9Subject(bb!)).toBe('the A shape of B♭');
    // Its tones too: B♭, D, F, never A♯.
    const names = d9Sounds(bb!, fb(bb!, [])).expected.map((n) => n.replace(/\d+$/, ''));
    expect(new Set(names)).toEqual(new Set(['Bb', 'D', 'F']));
    // A sharp key keeps sharps: the A shape of E has G♯.
    const e = prompts.find((p) => p.root === 'E');
    expect(e?.accidentalPref).toBe('sharp');
  });

  it('spells a minor chord from its relative major: Dm has F, C♯m has G♯', () => {
    const prompts = (pref: AccidentalPref) =>
      RNGS.map((r) => make('caged:E-shape@minor', { scopeLevel: 1, rng: () => r, pref }));
    expect(prompts('flat').map((p) => p.root)).toContain('C#');
    expect(prompts('sharp').map((p) => p.root)).not.toContain('Db');
    expect(prompts('sharp').find((p) => p.root === 'G')?.accidentalPref).toBe('flat');
  });

  it('keeps every pitch in drop D, moving string-6 notes up two frets', () => {
    const std = make('caged:E-shape@major', { rng: () => 0.58 });
    const drop = make('caged:E-shape@major', { rng: () => 0.58, tuning: DROP_D_TUNING });
    expect(drop.root).toBe(std.root);
    expect(drop.anchor.fret).toBe(std.anchor.fret + 2);
    expect(drop.shapeNotes.map((n) => midiAt(n, DROP_D_TUNING))).toEqual(
      std.shapeNotes.map((n) => midiAt(n)),
    );
  });

  it('offers each position that fits the region', () => {
    // E shape of E: open, and again at the 12th fret (frets 12–14).
    expect(d9Placements('E', 'major', 'E', STANDARD_TUNING).map((p) => p.shape.rootFret)).toEqual([
      0, 12,
    ]);
    expect(
      d9Placements('E', 'major', 'E', STANDARD_TUNING, { from: 0, to: 12 }).map(
        (p) => p.shape.rootFret,
      ),
    ).toEqual([0]);
    // The C shape of B needs frets 11–14, past a 0–12 neck but inside the whole neck.
    expect(d9Placements('C', 'major', 'B', STANDARD_TUNING, { from: 0, to: 12 })).toEqual([]);
    expect(d9Placements('C', 'major', 'B', STANDARD_TUNING).map((p) => p.shape.rootFret)).toEqual([
      14,
    ]);
  });

  /** Every (shape, quality, root) with no placement on the whole neck. */
  const unreachable = (tuning: Tuning) =>
    (['C', 'A', 'G', 'E', 'D'] as const).flatMap((shape) =>
      (['major', 'minor', 'dominant7'] as const).flatMap((quality) =>
        [...Array(12).keys()]
          .map((chroma) => chromaToPc(chroma))
          .filter((root) => d9Placements(shape, quality, root, tuning).length === 0)
          .map((root) => `${shape} shape of ${root} ${quality}`),
      ),
    );

  it('reaches every shape at every root on frets 0–15 (rule 12)', () => {
    // Including the D shape of C (frets 10–13), the last link of the C chain.
    expect(unreachable(STANDARD_TUNING)).toEqual([]);
    expect(d9Placements('D', 'major', 'C', STANDARD_TUNING).map((p) => p.shape.rootFret)).toEqual([
      10,
    ]);
    // Drop D moves string 6 up two frets, so the G shape spans 6 frets: F♯
    // would need its root at fret 2 (fret −1 below) or 16.
    expect(unreachable(DROP_D_TUNING)).toEqual([
      'G shape of F# major',
      'G shape of F# minor',
      'G shape of F# dominant7',
    ]);
  });
});

describe('d9Check', () => {
  const a = make('caged:A-shape@major'); // root C at string 5, fret 3

  it('is correct when every note is found, in any order, ignoring the root', () => {
    const taps = [...a.targets].reverse().map(pos);
    expect(d9Check(a, [at(5, 3), ...taps])).toEqual({
      correct: true,
      expected: 'the A shape of C',
    });
  });

  it('is wrong when notes are missing (Done)', () => {
    expect(d9Check(a, [at(4, 5)])).toEqual({ correct: false, expected: 'the A shape of C' });
    expect(d9Check(a, [])).toEqual({ correct: false, expected: 'the A shape of C' });
  });

  it('logs a tap in the C shape as the C vs A confusion', () => {
    expect(d9Check(a, [at(4, 5), at(2, 1)])).toEqual({
      correct: false,
      expected: 'the A shape of C',
      confusedWith: 'caged:C',
      concept: 'caged:A',
    });
    const c = make('caged-core:C-shape@major');
    expect(d9Check(c, [at(3, 5)]).confusedWith).toBe('caged:A');
  });

  it('logs other wrong taps without a confusion', () => {
    expect(d9Check(a, [at(6, 10)])).toEqual({ correct: false, expected: 'the A shape of C' });
    expect(d9Check(make('caged:D-shape@major'), [at(6, 0)]).confusedWith).toBeUndefined();
  });
});

describe('D9 feedback', () => {
  const core = make('caged-core:A-shape@major');
  const all = core.targets.map(pos);

  it('plays the chord low to high, plus a wrong note', () => {
    expect(d9Sounds(core, fb(core, all))).toEqual({ expected: ['C3', 'C4', 'E4', 'G4'] });
    expect(d9Sounds(core, fb(core, [at(1, 0)]))).toEqual({
      expected: ['C3', 'C4', 'E4', 'G4'],
      given: ['E4'],
    });
    expect(d9FeedbackPositions(core, fb(core, [at(1, 0)]))).toEqual({
      expected: core.targets,
      given: [at(1, 0)],
    });
  });

  it('grades completion time per note', () => {
    expect(d9GradedResponseMs(core, all, 3000)).toBe(1000);
    expect(d9DescribeAnswer([at(3, 5), at(2, 5)])).toBe('s3f5 s2f5');
    expect(d9DescribeAnswer([])).toBe('none');
  });

  it('names the degrees when right, and why when wrong', () => {
    expect(d9Explain(core, fb(core, all))).toBe(
      "That's the A-shape triad of C: R 3 5 from strings 3–1.",
    );
    expect(d9Explain(core, fb(core, [at(3, 5)]))).toBe(
      "It's the A-shape triad of C: R 3 5 from strings 3–1. 2 still to find, ringed on the neck.",
    );
    expect(d9Explain(core, fb(core, [at(2, 1)]))).toBe(
      'You tapped string 2, fret 1. That note is in the C shape. Both root on string 5: ' +
        'the A shape reaches up from the root, the C shape back toward the nut. ' +
        "It's the A-shape triad of C: R 3 5 from strings 3–1.",
    );
    expect(d9Explain(core, fb(core, [at(6, 9)]))).toBe(
      "You tapped string 6, fret 9. It's the A-shape triad of C: R 3 5 from strings 3–1.",
    );
    const minor = make('caged:E-shape@minor', { rng: () => 0.29 });
    expect(d9Explain(minor, fb(minor, minor.targets))).toMatch(
      /^That's the E shape of [A-G]m: R 5 R ♭3 5 R from strings 6–1\.$/,
    );
  });

  it('formats degrees, notes, string spans and the marker style', () => {
    expect(d9Display('b3')).toBe('♭3');
    expect(d9Display('b7')).toBe('♭7');
    expect(d9Display('F#')).toBe('F♯');
    expect(d9Display('Bbm')).toBe('B♭m');
    expect(d9Display('Bb7')).toBe('B♭7');
    expect(d9Display('5')).toBe('5');
    expect(d9StringSpan([3, 2, 1])).toBe('strings 3–1');
    expect(d9StringSpan([4])).toBe('string 4');
    expect(d9DegreeLine(core.targets)).toBe('R 3 5');
    expect(['R', '3', 'b3', '5', 'b7'].map((d) => d9DegreeStyle(d as never))).toEqual([
      'root',
      'third',
      'third',
      'fifth',
      'seventh',
    ]);
  });

  it('shows the note total only while guides are up', () => {
    expect(d9ShowsCount(3, false)).toBe(true);
    expect(d9ShowsCount(2, false)).toBe(true);
    expect(d9ShowsCount(1, false)).toBe(false);
    expect(d9ShowsCount(0, true)).toBe(true);
  });
});

describe('windows', () => {
  it('knows how far a shape reaches from its root', () => {
    expect(d9Reach(STANDARD_TUNING)).toBe(3);
    expect(d9Reach(DROP_D_TUNING)).toBe(5);
    expect(make('caged:A-shape@major').reach).toBe(3);
  });

  it('slides the portrait 12-fret neck up only for high roots', () => {
    expect(d9RegularWindow(make('caged:A-shape@major'))).toEqual({ from: 0, to: 12 });
    // The D shape of C: root at string 4, fret 10; the shape reaches fret 13.
    const roots = new Map<string, D9Prompt>();
    for (const r of RNGS) {
      const p = make('caged:D-shape@major', { rng: () => r });
      roots.set(p.root, p);
    }
    const dOfC = roots.get('C')!;
    expect(dOfC.anchor.fret).toBe(10);
    expect(d9RegularWindow(dOfC)).toEqual({ from: 1, to: 13 });
  });

  it('centres the compact window on the root, wide enough either way', () => {
    const p = make('caged:A-shape@major'); // root at fret 3
    expect(d9Window(p, 5)).toEqual({ from: 0, to: 6 });
    const high = make('caged:E-shape@major', { rng: () => 0.86 });
    const w = d9Window(high, 5);
    expect(w.to - w.from + 1).toBe(7);
    expect(w.from).toBeLessThanOrEqual(Math.max(0, high.anchor.fret - 3));
    expect(w.to).toBeGreaterThanOrEqual(Math.min(15, high.anchor.fret + 3));
    // A phone on its side shows more frets.
    expect(d9Window(p, 9)).toEqual({ from: 0, to: 8 });
  });

  it('keeps every note of the shape on screen, and each window follows the root', () => {
    for (const tuning of [STANDARD_TUNING, DROP_D_TUNING]) {
      for (const id of C6_IDS) {
        for (const r of RNGS) {
          const p = make(id, { scopeLevel: 1, rng: () => r, tuning });
          const windows = [d9Window(p, 5), d9RegularWindow(p)];
          expect(windows[1]!.to - windows[1]!.from).toBe(12);
          for (const w of windows) {
            // Either side of the root, so the window never shows the shape's direction.
            expect(w.from, id).toBeLessThanOrEqual(Math.max(0, p.anchor.fret - p.reach));
            expect(w.to, id).toBeGreaterThanOrEqual(Math.min(15, p.anchor.fret + p.reach));
            for (const n of p.shapeNotes) {
              expect(n.fret, id).toBeGreaterThanOrEqual(w.from);
              expect(n.fret, id).toBeLessThanOrEqual(w.to);
            }
          }
        }
      }
    }
    // Drop D's wider reach widens the compact window.
    const g = make('caged:G-shape@major', { tuning: DROP_D_TUNING });
    const w = d9Window(g, 5);
    expect(w.to - w.from + 1).toBe(11);
  });
});

describe('D9 names chord tones as the CAGED view spells them', () => {
  it("names D♭7's ♭7 C♭, not B, for a learner set to sharps", () => {
    const p = [...Array(48).keys()]
      .map((i) => make('caged:A-shape@dominant7', { scopeLevel: 1, rng: () => i / 48 }))
      .find((q) => q.root === 'Db') as D9Prompt;
    const seventh = p.shapeNotes.find((n) => n.degree === 'b7') as Position;
    expect(d9NoteName(p, seventh)).toBe('C♭');
    // C♭ is named from the C above the B it sounds: an octave number up.
    expect(d9Sounds(p, fb(p, p.targets)).expected).toContain(
      `Cb${Math.floor(midiAt(seventh) / 12)}`,
    );
  });

  for (const quality of CAGED_QUALITIES) {
    for (const pref of ['sharp', 'flat'] as const) {
      it(`agrees on every ${quality} root and shape, preferring ${pref}s`, () => {
        const roots = new Set<number>();
        for (const shape of CAGED_ORDER) {
          for (let i = 0; i < 48; i++) {
            const p = make(`caged:${shape}-shape@${quality}`, {
              scopeLevel: 1,
              pref,
              rng: () => i / 48,
            });
            const view = cagedContent(chromaOf(p.root), quality, pref);
            expect(p.root).toBe(view.root);
            roots.add(chromaOf(p.root));
            for (const n of p.shapeNotes) {
              expect(d9NoteName(p, n), `${p.chord} ${n.degree}`).toBe(
                d9Display(view.notes.get(n.degree) as string),
              );
            }
            const degreeAt = new Map(p.shapeNotes.map((n) => [midiAt(n), n.degree]));
            for (const name of d9Sounds(p, fb(p, p.targets)).expected) {
              const degree = degreeAt.get(Note.midi(name) as number);
              expect(name.replace(/\d+$/, ''), `${p.chord} ${name}`).toBe(
                view.notes.get(degree as Degree),
              );
            }
          }
        }
        expect(roots.size).toBe(12);
      });
    }
  }
});
