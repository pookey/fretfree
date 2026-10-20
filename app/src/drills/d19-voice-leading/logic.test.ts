import { describe, expect, it } from 'vitest';
import { VOICE_LEAD_MOVES } from '../../engine/items/voice-lead';
import { SKILLS } from '../../engine/skills';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  midiAt,
  type Inversion,
  type Position,
  type Tuning,
} from '../../theory';
import { d18Voicings } from '../d18-inversions/logic';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import {
  D19_ID,
  D19_MAX_MOVE,
  D19_REGION,
  d19CanTest,
  d19Check,
  d19ConceptOf,
  d19DescribeAnswer,
  d19Explain,
  d19FeedbackPositions,
  d19Found,
  d19GradedResponseMs,
  d19IsLive,
  d19Keys,
  d19MakePrompt,
  d19Missed,
  d19Moves,
  d19MovesLine,
  d19Nearest,
  d19Roots,
  d19ScopeFor,
  d19Sounds,
  d19Subject,
  d19Window,
  d19WrongTaps,
  type D19Answer,
  type D19Prompt,
} from './logic';

const ctx = (over: { rng?: () => number; scopeLevel?: number; tuning?: Tuning } = {}) => ({
  tuning: over.tuning ?? STANDARD_TUNING,
  accidentalPref: 'sharp' as const,
  scopeLevel: over.scopeLevel ?? 0,
  rng: over.rng ?? (() => 0),
});

const prompt = (id: string, over: Parameters<typeof ctx>[0] = {}) =>
  d19MakePrompt({ id, skillId: 'I1.voice-leading-top-sets' }, ctx(over));

const taps = (...ps: Position[]): D19Answer => ({ taps: ps });
const fb = (p: D19Prompt, answer: D19Answer): DrillFeedback<D19Answer> => ({
  answer,
  result: d19Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });
const cells = (ns: readonly { string: number; fret: number; degree: string }[]) =>
  ns.map((n) => `s${n.string}f${n.fret}${n.degree}`);

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

/** C to F on strings 3–1, from C in root position at fret 5. */
const cToF = () => prompt('voice-lead:I-IV@s3');

describe('D19 registration', () => {
  it('is a tap drill for the voice-leading skills, and tests only voice-leading cards', () => {
    const drill = getDrill(D19_ID)!;
    expect(drill.inputModes).toEqual(['tap']);
    const skills = SKILLS.filter((s) => s.drillTypes.includes(D19_ID)).map((s) => s.id);
    expect(skills).toEqual(['I1.voice-leading-top-sets', 'I1.voice-leading-low-sets']);
    expect([...drill.skills]).toEqual(skills);
    expect(d19CanTest({ id: 'voice-lead:IV-V@s5', skillId: 'x' })).toBe(true);
    expect(d19CanTest({ id: 'inversion:0@s3/major', skillId: 'x' })).toBe(false);
    expect(d19ConceptOf({ id: 'voice-lead:V-I@s4', skillId: 'x' })).toBe('voice-lead:V-I@s4');
    expect(d19ConceptOf({ id: 'note@s6f5', skillId: 'x' })).toBeNull();
    for (const s of SKILLS.filter((x) => x.drillTypes.includes(D19_ID))) {
      for (const item of s.items()) expect(d19CanTest(item), item.id).toBe(true);
    }
  });
});

describe('keys and chords', () => {
  it('serves natural keys at scope 0 and all 12 at scope 1', () => {
    expect(d19ScopeFor(-1)).toBe('naturals');
    expect(d19ScopeFor(0)).toBe('naturals');
    expect(d19ScopeFor(1)).toBe('all');
    expect(d19ScopeFor(5)).toBe('all');
    expect(d19Keys('naturals')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(d19Keys('all')).toHaveLength(12);
  });

  it('spells I, IV and V for the key', () => {
    expect(d19Roots('C')).toEqual({ I: 'C', IV: 'F', V: 'G' });
    expect(d19Roots('F')).toEqual({ I: 'F', IV: 'Bb', V: 'C' });
    expect(d19Roots('F#')).toEqual({ I: 'F#', IV: 'B', V: 'C#' });
  });
});

describe('d19MakePrompt', () => {
  it('moves C to F on strings 3–1: C stays, E up 1 fret, G up 2 frets', () => {
    const p = cToF();
    expect(p).toMatchObject({
      from: 'I',
      to: 'IV',
      key: 'C',
      lowString: 3,
      strings: [3, 2, 1],
      fromInversion: 0,
      toInversion: 2,
      other: 'V',
      scope: 'naturals',
    });
    expect(cells(p.fromNotes)).toEqual(['s3f5R', 's2f53', 's1f35']);
    expect(cells(p.targets)).toEqual(['s3f55', 's2f6R', 's1f53']);
    expect(d19Moves(p).map((m) => m.frets)).toEqual([0, 1, 2]);
    // B and D: the notes of G in neither C nor F.
    expect(p.otherChromas).toEqual([11, 2]);
    expect(d19MovesLine(p)).toBe('C stays, E up 1 fret to F, G up 2 frets to A');
  });

  it('moves every voice a whole step for IV to V, which share no note', () => {
    const p = prompt('voice-lead:IV-V@s3');
    expect(p.key).toBe('C');
    expect(d19Moves(p).map((m) => m.frets)).toEqual([2, 2, 2]);
    expect(p.toInversion).toBe(p.fromInversion);
    expect(p.otherChromas).toEqual([4]);
  });

  it('moves down for I to V and V to IV', () => {
    const iv = prompt('voice-lead:I-V@s4');
    expect(d19Moves(iv).every((m) => m.frets <= 0)).toBe(true);
    expect(d19MovesLine(iv)).toBe('C down 1 fret to B, E down 2 frets to D, G stays');
    const viv = prompt('voice-lead:V-IV@s4');
    expect(d19Moves(viv).map((m) => m.frets)).toEqual([-2, -2, -2]);
  });

  it('spells the chords for the key: B♭ is IV in F', () => {
    const p = prompt('voice-lead:I-IV@s3', { rng: () => 0.5 });
    expect(p.key).toBe('F');
    expect(p.roots.IV).toBe('Bb');
    expect(d19Subject(p)).toBe('B♭ in root position on strings 3–1');
    expect(d19MovesLine(p)).toBe('A up 1 fret to B♭, C up 2 frets to D, F stays');
  });

  it('places every card in every key, inside the region, each voice a step at most', () => {
    const rng = seeded(19);
    const keys = new Set<string>();
    const inversions = new Set<Inversion>();
    for (const s of SKILLS.filter((x) => x.drillTypes.includes(D19_ID))) {
      for (const item of s.items()) {
        for (const tuning of [STANDARD_TUNING, DROP_D_TUNING]) {
          for (let i = 0; i < 24; i++) {
            const p = d19MakePrompt(item, { ...ctx({ tuning, scopeLevel: 1 }), rng });
            keys.add(p.key);
            inversions.add(p.fromInversion);
            for (const n of [...p.fromNotes, ...p.targets]) expect(d19IsLive(p, n)).toBe(true);
            expect(p.fromNotes.map((n) => n.string)).toEqual(p.strings);
            expect(p.targets.map((n) => n.string)).toEqual(p.strings);
            const moves = d19Moves(p).map((m) => Math.abs(m.frets));
            expect(Math.max(...moves), item.id).toBeLessThanOrEqual(D19_MAX_MOVE);
            // A voice moves as many semitones as frets: same string, no crossing.
            const midis = p.targets.map((n) => midiAt(n, tuning));
            expect(midis[0]! < midis[1]! && midis[1]! < midis[2]!).toBe(true);
          }
        }
      }
    }
    expect(keys.size).toBe(12);
    expect(inversions).toEqual(new Set([0, 1, 2]));
  });

  it('finds exactly one nearest voicing from any start away from the ends of the neck', () => {
    for (const tuning of [STANDARD_TUNING, DROP_D_TUNING]) {
      for (const key of d19Keys('all')) {
        const roots = d19Roots(key);
        for (const [from, to] of VOICE_LEAD_MOVES) {
          for (const low of [3, 4, 5, 6] as const) {
            for (const inv of [0, 1, 2] as const) {
              for (const v of d18Voicings(roots[from], 'major', low, inv, tuning)) {
                const frets = v.notes.map((n) => n.fret);
                const inside =
                  Math.min(...frets) >= D19_REGION.from + D19_MAX_MOVE &&
                  Math.max(...frets) <= D19_REGION.to - D19_MAX_MOVE;
                if (inside) {
                  expect(d19Nearest(v, roots[to], low, tuning), `${key} ${from}-${to}`).not.toBe(
                    null,
                  );
                }
              }
            }
          }
        }
      }
    }
  });

  it('refuses items it cannot test', () => {
    expect(() => prompt('inversion:0@s3/major')).toThrow('cannot test');
    const seven: Tuning = { id: 'seven', name: 'Seven', notes: ['B1', ...STANDARD_TUNING.notes] };
    expect(() => prompt('voice-lead:I-IV@s3', { tuning: seven })).toThrow('cannot test');
  });
});

describe('d19Check', () => {
  const p = cToF();

  it('accepts the three notes in any order, the held note included', () => {
    expect(d19Check(p, taps(at(1, 5), at(3, 5), at(2, 6)))).toEqual({
      correct: true,
      expected: 'F in 2nd inversion on strings 3–1',
    });
    expect(d19Found(p, [at(2, 6), at(4, 1)])).toEqual([p.targets[1]]);
    expect(d19Missed(p, [at(2, 6)])).toEqual([p.targets[0], p.targets[2]]);
  });

  it('marks an unfinished round wrong', () => {
    expect(d19Check(p, taps(at(3, 5), at(2, 6))).correct).toBe(false);
    expect(d19Check(p, taps()).correct).toBe(false);
  });

  it("logs a tap on a note of the key's third chord as that move", () => {
    // B on string 3: a note of G, in neither C nor F.
    expect(d19Check(p, taps(at(3, 4)))).toEqual({
      correct: false,
      expected: 'F in 2nd inversion on strings 3–1',
      confusedWith: 'voice-lead:I-V@s3',
      concept: 'voice-lead:I-IV@s3',
    });
  });

  it('marks other wrong taps wrong, without a confusion: a held note that moves, a far F', () => {
    expect(d19Check(p, taps(at(1, 3)))).toEqual({
      correct: false,
      expected: 'F in 2nd inversion on strings 3–1',
    });
    // F on string 3, but the nearest F holds C there.
    expect(d19Check(p, taps(at(3, 10))).confusedWith).toBeUndefined();
    expect(d19Check(p, taps(at(1, 1))).confusedWith).toBeUndefined();
    expect(d19WrongTaps(p, [at(3, 5), at(1, 1)])).toEqual([at(1, 1)]);
  });

  it('names root position in the subject', () => {
    expect(d19Subject(prompt('voice-lead:IV-V@s3'))).toBe('G in root position on strings 3–1');
  });
});

describe('answers, timing and sound', () => {
  const p = cToF();

  it('describes answers for the review log', () => {
    expect(d19DescribeAnswer(taps(at(3, 5), at(2, 6)))).toBe('s3f5 s2f6');
    expect(d19DescribeAnswer(taps())).toBe('none');
  });

  it('grades per note', () => {
    expect(d19GradedResponseMs(p, taps(), 3000)).toBe(1000);
  });

  it('plays the starting triad, then the next one, and a wrong tap after them', () => {
    const right = taps(...p.targets);
    expect(d19Sounds(p, fb(p, right))).toEqual({
      expected: ['C4', 'E4', 'G4', 'C4', 'F4', 'A4'],
    });
    expect(d19Sounds(p, fb(p, taps(at(3, 4))))).toEqual({
      expected: ['C4', 'E4', 'G4', 'C4', 'F4', 'A4'],
      given: ['B3'],
    });
  });

  it('shows the answer and the wrong taps', () => {
    expect(d19FeedbackPositions(p, fb(p, taps(at(3, 4))))).toEqual({
      expected: p.targets,
      given: [at(3, 4)],
    });
  });
});

describe('d19Explain', () => {
  const p = cToF();
  const answer = 'F in 2nd inversion on strings 3–1: C stays, E up 1 fret to F, G up 2 frets to A.';

  it('says how each voice moves when right', () => {
    expect(d19Explain(p, fb(p, taps(...p.targets)))).toBe(`That's ${answer}`);
  });

  it('says how many are left when the round stops early', () => {
    expect(d19Explain(p, fb(p, taps(at(3, 5))))).toBe(`It's ${answer} 2 still to find.`);
  });

  it('explains each kind of wrong tap', () => {
    expect(d19Explain(p, fb(p, taps(at(3, 4))))).toBe(
      `You tapped string 3, fret 4. That's B, a note of G (V), not F. It's ${answer}`,
    );
    expect(d19Explain(p, fb(p, taps(at(1, 3))))).toBe(
      `You tapped string 1, fret 3. That holds G, which moves to A. It's ${answer}`,
    );
    // A on string 2 is a note of F, but the nearest F has F there.
    expect(d19Explain(p, fb(p, taps(at(2, 10))))).toBe(
      `You tapped string 2, fret 10. That's A, a note of F, but not the nearest one. It's ${answer}`,
    );
    expect(d19Explain(p, fb(p, taps(at(1, 2))))).toBe(
      `You tapped string 1, fret 2. That's F♯, not a note of F. It's ${answer}`,
    );
  });
});

describe('d19Window', () => {
  const p = cToF();

  it('shows the whole region on iPad landscape', () => {
    expect(d19Window(p, 'regular-wide', 5)).toEqual(D19_REGION);
  });

  it('slides the 12-fret portrait neck to hold the triad and 2 frets either side', () => {
    expect(d19Window(p, 'regular', 5)).toEqual({ from: 0, to: 12 });
    const high = prompt('voice-lead:I-IV@s3', { rng: () => 0.5 });
    expect(Math.max(...high.fromNotes.map((n) => n.fret))).toBe(14);
    expect(d19Window(high, 'regular', 5)).toEqual({ from: 3, to: 15 });
  });

  it('centres a compact window on the triad, 2 frets clear either side', () => {
    // C at frets 3–5: frets 1–7 are needed.
    expect(d19Window(p, 'compact', 5)).toEqual({ from: 1, to: 7 });
    expect(d19Window(p, 'compact', 11)).toEqual({ from: 0, to: 10 });
  });
});
