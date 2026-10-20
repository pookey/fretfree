import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine/skills';
import { DROP_D_TUNING, STANDARD_TUNING, midiAt, type Position, type Tuning } from '../../theory';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import {
  D18_ID,
  D18_REGION,
  d18CanTest,
  d18Check,
  d18ConceptOf,
  d18DescribeAnswer,
  d18Display,
  d18Explain,
  d18FeedbackPositions,
  d18Formula,
  d18Found,
  d18GradedResponseMs,
  d18IsLive,
  d18KeyToInversion,
  d18MakePrompt,
  d18Missed,
  d18Reach,
  d18ScopeFor,
  d18Sounds,
  d18SpellRoot,
  d18Subject,
  d18Voicings,
  d18Window,
  d18WrongTaps,
  type D18Answer,
  type D18Prompt,
} from './logic';

const ctx = (
  over: { rng?: () => number; scopeLevel?: number; tuning?: Tuning; pref?: 'sharp' | 'flat' } = {},
) => ({
  tuning: over.tuning ?? STANDARD_TUNING,
  accidentalPref: over.pref ?? ('sharp' as const),
  scopeLevel: over.scopeLevel ?? 0,
  rng: over.rng ?? (() => 0),
});

const prompt = (id: string, over: Parameters<typeof ctx>[0] = {}) =>
  d18MakePrompt({ id, skillId: 'I1.major-top-sets' }, ctx(over));

const taps = (...ps: Position[]): D18Answer => ({ kind: 'taps', taps: ps });
const named = (inversion: 0 | 1 | 2): D18Answer => ({ kind: 'inversion', inversion });
const fb = (p: D18Prompt, answer: D18Answer): DrillFeedback<D18Answer> => ({
  answer,
  result: d18Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });
const frets = (p: D18Prompt) => p.notes.map((n) => `s${n.string}f${n.fret}${n.degree}`);

/** Seeded mulberry32, so the sweep is deterministic. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('D18 registration', () => {
  it('is a tap drill for every I1 inversion skill, and tests only inversion cards', () => {
    const drill = getDrill(D18_ID)!;
    expect(drill.inputModes).toEqual(['tap', 'choice', 'keyboard']);
    const i1 = SKILLS.filter((s) => s.drillTypes.includes(D18_ID)).map((s) => s.id);
    expect([...drill.skills]).toEqual(i1);
    expect(d18CanTest({ id: 'inversion:0@s3/major', skillId: 'x' })).toBe(true);
    expect(d18CanTest({ id: 'caged-core:A-shape@major', skillId: 'x' })).toBe(false);
    expect(d18ConceptOf({ id: 'inversion-name:2@s5/minor', skillId: 'x' })).toBe(
      'inversion-name:2@s5/minor',
    );
    expect(d18ConceptOf({ id: 'note@s6f5', skillId: 'x' })).toBeNull();
    for (const s of SKILLS.filter((x) => x.drillTypes.includes(D18_ID))) {
      for (const item of s.items()) expect(d18CanTest(item), item.id).toBe(true);
    }
  });
});

describe('d18MakePrompt', () => {
  it('builds C major in each inversion on strings 3–1 from its root', () => {
    const root = prompt('inversion:0@s3/major');
    expect(root).toMatchObject({
      mode: 'build',
      root: 'C',
      chord: 'C',
      quality: 'major',
      inversion: 0,
      lowString: 3,
      strings: [3, 2, 1],
      anchor: { string: 3, fret: 5, degree: 'R' },
      partner: { string: 2, fret: 4 },
      scope: 'naturals',
    });
    expect(frets(root)).toEqual(['s3f5R', 's2f5' + '3', 's1f35']);
    expect(root.targets.map((t) => t.degree)).toEqual(['3', '5']);
    expect(root.cores).toEqual(['A']);

    const first = prompt('inversion:1@s3/major');
    expect(frets(first)).toEqual(['s3f93', 's2f85', 's1f8R']);
    expect(first.anchor).toEqual({ string: 1, fret: 8, degree: 'R' });
    expect(first.cores).toEqual(['E']);

    const second = prompt('inversion:2@s3/major');
    expect(frets(second)).toEqual(['s3f05', 's2f1R', 's1f03']);
    expect(second.cores).toEqual(['C']);
  });

  it('places a triad at any of its positions, and names the CAGED shapes it sits in', () => {
    const vs = d18Voicings('C', 'major', 3, 2, STANDARD_TUNING);
    expect(vs.map((v) => v.notes.map((n) => n.fret))).toEqual([
      [0, 1, 0],
      [12, 13, 12],
    ]);
    const high = d18MakePrompt(
      { id: 'inversion:2@s3/major', skillId: 'x' },
      {
        ...ctx(),
        rng: (() => {
          const xs = [0, 0.99];
          let i = 0;
          return () => xs[i++] ?? 0;
        })(),
      },
    );
    expect(frets(high)).toEqual(['s3f125', 's2f13R', 's1f123']);
    expect(high.cores).toEqual(['C', 'D']);
  });

  it('draws minor triads with the ♭3, and their partner is the major 3rd', () => {
    const p = prompt('inversion:0@s4/minor');
    expect(p.chord).toBe('Cm');
    expect(frets(p)).toEqual(['s4f10R', 's3f8b3', 's2f85']);
    expect(p.partner).toEqual({ string: 3, fret: 9 });
  });

  it('serves name cards with the whole triad and nothing to tap', () => {
    const p = prompt('inversion-name:1@s5/major');
    expect(p.mode).toBe('name');
    expect(p.targets).toEqual([]);
    expect(p.partner).toBeNull();
    expect(p.notes).toHaveLength(3);
    expect(p.notes[0]!.degree).toBe('3');
  });

  it('roots on naturals at scope 0 and on any pitch class at scope 1', () => {
    expect(d18ScopeFor(-1)).toBe('naturals');
    expect(d18ScopeFor(0.4)).toBe('naturals');
    expect(d18ScopeFor(1)).toBe('all');
    expect(d18ScopeFor(9)).toBe('all');
    const roots = new Set<string>();
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      roots.add(prompt('inversion:1@s6/major', { scopeLevel: 1, rng }).root);
    }
    expect(roots.size).toBe(12);
    const naturals = new Set<string>();
    for (let i = 0; i < 100; i++) {
      naturals.add(prompt('inversion:1@s6/major', { rng }).root);
    }
    expect([...naturals].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });

  it('spells roots by preference unless the triad needs a double flat', () => {
    expect(d18SpellRoot(1, 'major', 'flat')).toBe('Db');
    expect(d18SpellRoot(6, 'minor', 'flat')).toBe('F#');
    expect(d18SpellRoot(6, 'minor', 'sharp')).toBe('F#');
    expect(d18SpellRoot(10, 'minor', 'flat')).toBe('Bb');
  });

  it('places every card at every root, close-voiced, within the region and a 4-fret stretch', () => {
    const rng = seeded(11);
    for (const s of SKILLS.filter((x) => x.drillTypes.includes(D18_ID))) {
      for (const item of s.items()) {
        for (const tuning of [STANDARD_TUNING, DROP_D_TUNING]) {
          for (let i = 0; i < 24; i++) {
            const p = d18MakePrompt(item, { ...ctx({ tuning, scopeLevel: 1 }), rng });
            const fs = p.notes.map((n) => n.fret);
            // Drop D's root position on 6–4 stretches 5 frets.
            const stretch = tuning === DROP_D_TUNING && p.lowString === 6 ? 5 : 4;
            expect(Math.max(...fs) - Math.min(...fs), item.id).toBeLessThanOrEqual(stretch);
            for (const n of p.notes) expect(d18IsLive(p, n)).toBe(true);
            const midis = p.notes.map((n) => midiAt(n, tuning));
            expect(midis[2]! - midis[0]!).toBeLessThan(12);
            expect(p.notes.map((n) => n.string)).toEqual(p.strings);
          }
        }
      }
    }
  });

  it("stretches drop D's root position on 6–4 to 5 frets, and names no shape there", () => {
    const drop = prompt('inversion:0@s6/major', { tuning: DROP_D_TUNING });
    expect(frets(drop)).toEqual(['s6f10R', 's5f73', 's4f55']);
    expect(drop.cores).toEqual([]);
    expect(prompt('inversion:0@s6/major').cores).toEqual(['G']);
    expect(prompt('inversion:0@s3/major', { tuning: DROP_D_TUNING }).cores).toEqual(['A']);
  });

  it('measures the furthest any inversion reaches from its root', () => {
    expect(d18Reach(STANDARD_TUNING)).toBe(3);
    // Cached per tuning.
    expect(d18Reach(STANDARD_TUNING)).toBe(3);
    expect(d18Reach(DROP_D_TUNING)).toBe(5);
  });

  it('refuses items it cannot test', () => {
    expect(() => prompt('note@s6f5')).toThrow(/cannot test/);
    const seven: Tuning = { id: 'seven', name: 'Seven', notes: ['B1', ...STANDARD_TUNING.notes] };
    expect(() => prompt('inversion:0@s3/major', { tuning: seven })).toThrow(/cannot test/);
  });
});

describe('d18Check: build', () => {
  const p = prompt('inversion:1@s3/major'); // E–G–C at 9, 8, 8

  it('accepts the two notes in any order', () => {
    expect(d18Check(p, taps(at(2, 8), at(3, 9)))).toEqual({
      correct: true,
      expected: 'C in 1st inversion on strings 3–1',
    });
    expect(d18Check(p, taps(at(3, 9), at(2, 8)))).toMatchObject({ correct: true });
  });

  it('marks an unfinished round wrong, and the given root is never a tap', () => {
    expect(d18Check(p, taps(at(3, 9)))).toEqual({
      correct: false,
      expected: 'C in 1st inversion on strings 3–1',
    });
    expect(d18WrongTaps(p, [at(1, 8)])).toEqual([]);
    expect(d18Found(p, [at(1, 8), at(3, 9)])).toEqual([{ string: 3, fret: 9, degree: '3' }]);
    expect(d18Missed(p, [at(3, 9)])).toEqual([{ string: 2, fret: 8, degree: '5' }]);
  });

  it('logs the ♭3 for the 3 as the minor card of the same inversion', () => {
    expect(d18Check(p, taps(at(3, 8)))).toEqual({
      correct: false,
      expected: 'C in 1st inversion on strings 3–1',
      confusedWith: 'inversion:1@s3/minor',
      concept: 'inversion:1@s3/major',
    });
    const minor = prompt('inversion:1@s3/minor');
    expect(d18Check(minor, taps(at(minor.partner!.string, minor.partner!.fret)))).toMatchObject({
      confusedWith: 'inversion:1@s3/major',
    });
  });

  it('marks any other wrong tap wrong, without a confusion', () => {
    expect(d18Check(p, taps(at(2, 10)))).toEqual({
      correct: false,
      expected: 'C in 1st inversion on strings 3–1',
    });
    expect(d18Check(p, named(1))).toMatchObject({ correct: false });
  });

  it('names root position and the 2nd inversion in the subject', () => {
    expect(d18Subject(prompt('inversion:0@s3/major'))).toBe('C in root position on strings 3–1');
    expect(d18Subject(prompt('inversion:2@s5/minor'))).toBe('Cm in 2nd inversion on strings 5–3');
  });
});

describe('d18Check: name', () => {
  const p = prompt('inversion-name:2@s4/major');

  it('accepts the right inversion and logs a wrong one against its card', () => {
    expect(d18Check(p, named(2))).toEqual({ correct: true, expected: '2nd inversion' });
    expect(d18Check(p, named(0))).toEqual({
      correct: false,
      expected: '2nd inversion',
      confusedWith: 'inversion-name:0@s4/major',
      concept: 'inversion-name:2@s4/major',
    });
    expect(d18Check(p, taps(at(4, 5)))).toEqual({ correct: false, expected: '2nd inversion' });
  });
});

describe('answers, timing and sound', () => {
  it('describes answers for the review log', () => {
    expect(d18DescribeAnswer(taps(at(3, 9), at(2, 8)))).toBe('s3f9 s2f8');
    expect(d18DescribeAnswer(taps())).toBe('none');
    expect(d18DescribeAnswer(named(0))).toBe('Root position');
  });

  it('grades a build per note and a name as is', () => {
    expect(d18GradedResponseMs(prompt('inversion:0@s3/major'), taps(), 3000)).toBe(1500);
    expect(d18GradedResponseMs(prompt('inversion-name:0@s3/major'), named(0), 3000)).toBe(3000);
  });

  it('plays the triad low to high, and a wrong tap after it', () => {
    const p = prompt('inversion:1@s3/major');
    expect(d18Sounds(p, fb(p, taps(at(3, 9), at(2, 8))))).toEqual({
      expected: ['E4', 'G4', 'C5'],
    });
    expect(d18Sounds(p, fb(p, taps(at(3, 8))))).toEqual({
      expected: ['E4', 'G4', 'C5'],
      given: ['D#4'],
    });
    const n = prompt('inversion-name:1@s3/major');
    expect(d18Sounds(n, fb(n, named(0)))).toEqual({ expected: ['E4', 'G4', 'C5'] });
  });

  it('shows the targets and wrong taps, or the whole triad for a name', () => {
    const p = prompt('inversion:1@s3/major');
    expect(d18FeedbackPositions(p, fb(p, taps(at(2, 10))))).toEqual({
      expected: p.targets,
      given: [at(2, 10)],
    });
    const n = prompt('inversion-name:1@s3/major');
    expect(d18FeedbackPositions(n, fb(n, named(2)))).toEqual({ expected: n.notes, given: [] });
  });
});

describe('d18Explain', () => {
  it('gives the degrees from the low string when right', () => {
    const p = prompt('inversion:1@s3/major');
    expect(d18Explain(p, fb(p, taps(at(3, 9), at(2, 8))))).toBe(
      "That's C in 1st inversion on strings 3–1: 3 5 R from string 3.",
    );
  });

  it('says how many are left when the round stops early', () => {
    const p = prompt('inversion:1@s3/major');
    expect(d18Explain(p, fb(p, taps(at(3, 9))))).toBe(
      "It's C in 1st inversion on strings 3–1: 3 5 R from string 3. 1 still to find, ringed on the neck.",
    );
  });

  it('explains a wrong tap, and the major–minor mix-up', () => {
    const p = prompt('inversion:1@s3/major');
    expect(d18Explain(p, fb(p, taps(at(2, 10))))).toBe(
      "You tapped string 2, fret 10. It's C in 1st inversion on strings 3–1: 3 5 R from string 3.",
    );
    expect(d18Explain(p, fb(p, taps(at(3, 8))))).toBe(
      "You tapped string 3, fret 8. That's E♭, the ♭3 of Cm; C has E. " +
        "It's C in 1st inversion on strings 3–1: 3 5 R from string 3.",
    );
    const m = prompt('inversion:0@s4/minor');
    expect(d18Explain(m, fb(m, taps(at(3, 9))))).toContain("That's E, the 3 of C; Cm has E♭.");
  });

  it('names the bass for a name card, right or wrong', () => {
    const p = prompt('inversion-name:1@s3/minor');
    expect(d18Explain(p, fb(p, named(1)))).toBe(
      "That's 1st inversion: the 3rd, E♭, is in the bass (♭3 5 R from string 3).",
    );
    expect(d18Explain(p, fb(p, named(0)))).toBe(
      'Root position has the root in the bass. This is 1st inversion: the 3rd, E♭, is in the bass (♭3 5 R from string 3).',
    );
    const r = prompt('inversion-name:2@s3/major');
    expect(d18Explain(r, fb(r, named(2)))).toContain('the 5th, G, is in the bass');
    expect(d18Explain(r, fb(r, taps()))).toMatch(/^It's 2nd inversion/);
  });
});

describe('helpers', () => {
  it('writes each formula low string first', () => {
    expect(d18Formula('major', 0)).toBe('R 3 5');
    expect(d18Formula('major', 2)).toBe('5 R 3');
    expect(d18Formula('minor', 1)).toBe('♭3 5 R');
    expect(d18Display('Bbm')).toBe('B♭m');
    expect(d18Display('F#')).toBe('F♯');
  });

  it('maps R, 0, 1 and 2 to the inversion buttons', () => {
    expect(d18KeyToInversion('r')).toBe(0);
    expect(d18KeyToInversion('R')).toBe(0);
    expect(d18KeyToInversion('0')).toBe(0);
    expect(d18KeyToInversion('1')).toBe(1);
    expect(d18KeyToInversion('2')).toBe(2);
    expect(d18KeyToInversion('3')).toBeNull();
  });
});

describe('d18Window', () => {
  it('shows the whole region on iPad landscape', () => {
    expect(d18Window(prompt('inversion:1@s3/major'), 'regular-wide', 5)).toEqual(D18_REGION);
  });

  it('slides the 12-fret portrait neck to hold the root reach or the triad', () => {
    expect(d18Window(prompt('inversion:1@s3/major'), 'regular', 5)).toEqual({ from: 0, to: 12 });
    const high = d18MakePrompt(
      { id: 'inversion-name:2@s3/major', skillId: 'x' },
      {
        ...ctx(),
        rng: (() => {
          const xs = [0, 0.99];
          let i = 0;
          return () => xs[i++] ?? 0;
        })(),
      },
    );
    expect(d18Window(high, 'regular', 5)).toEqual({ from: 1, to: 13 });
  });

  it('centres a compact window on the root, wide enough either way', () => {
    const p = prompt('inversion:1@s3/major'); // root at fret 8, reach 3
    const w = d18Window(p, 'compact', 5);
    expect(w).toEqual({ from: 5, to: 11 });
    for (const n of p.notes) expect(n.fret >= w.from && n.fret <= w.to).toBe(true);
    // The root at fret 1: the window stops at the nut.
    expect(d18Window(prompt('inversion:2@s3/major'), 'compact', 5)).toEqual({ from: 0, to: 6 });
    // A wider phone window, and one that stops at the last fret.
    expect(d18Window(p, 'compact', 9)).toEqual({ from: 4, to: 12 });
  });

  it('centres a compact name window on the triad', () => {
    const p = prompt('inversion-name:1@s3/major'); // frets 8–9
    expect(d18Window(p, 'compact', 5)).toEqual({ from: 5, to: 11 });
  });
});
