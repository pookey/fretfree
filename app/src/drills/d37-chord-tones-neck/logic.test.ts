import { describe, expect, it } from 'vitest';
import { neckRegions } from '../../shell/size-class';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  chromaOf,
  noteAt,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillFeedback } from '../types';
import {
  D37_NECK,
  d37Asking,
  d37CanTest,
  d37Check,
  d37ConceptOf,
  d37ConfusedWith,
  d37DescribeAnswer,
  d37Expected,
  d37Explain,
  d37FeedbackPositions,
  d37FeedbackRound,
  d37Found,
  d37GradedResponseMs,
  d37IsLive,
  d37MakePrompt,
  d37MarkedOutside,
  d37Missed,
  d37NeckGuideLevel,
  d37RegionLine,
  d37RegionWindow,
  d37RegularWindow,
  d37Roots,
  d37Rounds,
  d37ScopeFor,
  d37Shapes,
  d37ShowsCount,
  d37ShowsRoots,
  d37Sounds,
  d37TapName,
  d37WrongTaps,
  type D37Answer,
  type D37Prompt,
} from './logic';

const prompt = (id: string, scopeLevel = 1, r = 0, tuning: Tuning = STANDARD_TUNING) =>
  d37MakePrompt(
    { id, skillId: 'C5.neck-triads' },
    { tuning, accidentalPref: 'flat', scopeLevel, rng: () => r },
  );

const at = (string: number, fret: number): Position => ({ string, fret });
const cells = (ps: readonly Position[]) => ps.map((p) => `s${p.string}f${p.fret}`);
const fb = (p: D37Prompt, answer: D37Answer): DrillFeedback<D37Answer> => ({
  answer,
  result: d37Check(p, answer),
});
/** A cell in the live range that holds the note, for wrong taps. */
const cellOf = (p: D37Prompt, note: string): Position => {
  for (let fret = p.activeRange.from; fret <= p.activeRange.to; fret++) {
    for (const string of [1, 2, 3, 4, 5, 6]) {
      if (noteAt({ string, fret }, p.tuning).chroma === chromaOf(note)) return { string, fret };
    }
  }
  throw new Error(`no ${note} in range`);
};

describe('D37 items', () => {
  it('tests chord-tones cards for kinds it has shapes for', () => {
    const can = (id: string) => d37CanTest({ id, skillId: 'x' });
    expect(can('chord-tones:C')).toBe(true);
    expect(can('chord-tones:3@C')).toBe(true);
    expect(can('chord-tones:Bbm7')).toBe(true);
    expect(can('chord-tones:Cm7b5')).toBe(false);
    expect(can('chord-tone:3@major')).toBe(false);
    expect(() => prompt('octaves:G')).toThrow(/cannot test/);
  });

  it('keys chord cards by D7 concept and degree cards by interval', () => {
    const c = (id: string) => d37ConceptOf({ id, skillId: 'x' });
    expect(c('chord-tones:C')).toBe('triad:maj');
    expect(c('chord-tones:Am')).toBe('triad:min');
    expect(c('chord-tones:G7')).toBe('chord:7');
    expect(c('chord-tones:3@C')).toBe('M3');
    expect(c('chord-tones:b3@Cm')).toBe('m3');
    expect(c('chord-tones:b7@C7')).toBe('m7');
    expect(c('chord-tones:7@Cmaj7')).toBe('M7');
    expect(c('note@s6f5')).toBeNull();
  });

  it('maps scope levels to shape, then neck', () => {
    expect(d37ScopeFor(0)).toBe('shape');
    expect(d37ScopeFor(1)).toBe('neck');
    expect(d37ScopeFor(9)).toBe('neck');
    expect(d37ScopeFor(-1)).toBe('shape');
  });
});

describe('D37 target sets', () => {
  it('finds every C, E and G in frets 0–12 for C major', () => {
    const p = prompt('chord-tones:C');
    expect(p.scope).toBe('neck');
    expect(p.activeRange).toEqual(D37_NECK);
    expect(p.chord).toBe('C');
    expect(p.tones).toEqual([
      { degree: '1', name: 'C' },
      { degree: '3', name: 'E' },
      { degree: '5', name: 'G' },
    ]);
    // 3 pitch classes × 6 strings × 13 frets ≈ 19.5: open E and G strings add two.
    expect(p.targets).toHaveLength(21);
    for (const t of p.targets) {
      const pc = noteAt(t, STANDARD_TUNING).pc;
      expect({ C: '1', E: '3', G: '5' }[pc], cells([t])[0]).toBe(t.degree);
    }
    expect(cells(p.targets.slice(0, 4))).toEqual(['s6f0', 's3f0', 's1f0', 's2f1']);
  });

  it('asks only the named degree on a degree card', () => {
    const p = prompt('chord-tones:3@C');
    expect(p.degree).toBe('3');
    expect(cells(p.targets)).toEqual([
      's6f0',
      's1f0',
      's4f2',
      's2f5',
      's5f7',
      's3f9',
      's6f12',
      's1f12',
    ]);
    expect(p.targets.every((t) => t.degree === '3')).toBe(true);
  });

  it('spells tones as the chord does: the ♭3 of C♯ minor is E, the 7 of F♯maj7 is E♯', () => {
    expect(prompt('chord-tones:C#m').tones.map((t) => t.name)).toEqual(['C#', 'E', 'G#']);
    expect(prompt('chord-tones:F#maj7').tones.map((t) => t.name)).toEqual(['F#', 'A#', 'C#', 'E#']);
  });

  it('keeps each note at its pitch in another tuning', () => {
    const p = prompt('chord-tones:3@D', 1, 0, DROP_D_TUNING);
    // F# on drop D's low string is at fret 4, not 2.
    expect(cells(p.targets.filter((t) => t.string === 6))).toEqual(['s6f4']);
  });

  it('narrows to a CAGED shape’s span at scope 0, picked per prompt (rule 12)', () => {
    const shapes = d37Shapes('C', 'major', STANDARD_TUNING);
    // C's C shape comes up twice: open, and at fret 12.
    expect(shapes.map((s) => s.name)).toEqual(['C', 'C', 'A', 'G', 'E', 'D']);
    const first = prompt('chord-tones:C', 0, 0);
    const last = prompt('chord-tones:C', 0, 0.99);
    expect(first.scope).toBe('shape');
    expect(first.shape?.name).toBe('C');
    expect(first.activeRange).toEqual({ from: 0, to: 3 });
    expect(last.shape?.name).toBe('D');
    expect(last.activeRange).toEqual({ from: 10, to: 13 });
    expect(d37RegularWindow(last)).toEqual({ from: 3, to: 15 });
    expect(d37RegularWindow(first)).toEqual({ from: 0, to: 12 });
    // The box's own notes are all targets, and every target is in the box.
    for (const p of [first, last]) {
      for (const n of p.shape!.notes) expect(cells(p.targets)).toContain(cells([n])[0]);
      expect(p.targets.every((t) => t.fret >= p.activeRange.from && t.fret <= p.activeRange.to));
    }
    expect(d37RegionLine(first)).toBe('frets 0–3, the C shape of C major');
    expect(d37RegionLine(prompt('chord-tones:C'))).toBe('frets 0–12');
  });

  it('only picks a box that holds the asked degree, and falls back to the neck', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const p = prompt('chord-tones:b7@C7', 0, r);
      expect(p.scope).toBe('shape');
      expect(p.targets.length).toBeGreaterThan(0);
    }
    // Three octaves up, no shape fits on the neck.
    const high: Tuning = { id: 'high', name: 'High', notes: ['E5', 'A5', 'D6', 'G6', 'B6', 'E7'] };
    expect(d37Shapes('C', 'major', high)).toEqual([]);
    const p = prompt('chord-tones:C', 0, 0, high);
    expect(p.scope).toBe('neck');
    expect(p.shape).toBeNull();
  });
});

describe('D37 grading', () => {
  const p = prompt('chord-tones:C');

  it('is correct once every target is tapped, in any order', () => {
    const all = [...p.targets].reverse();
    expect(d37Check(p, all)).toEqual({
      correct: true,
      expected: 'C major: C E G',
      concept: 'triad:maj',
    });
    expect(d37Found(p, all)).toHaveLength(21);
    expect(d37Missed(p, all)).toEqual([]);
  });

  it('is wrong when targets are left ("Done" early)', () => {
    const some = p.targets.slice(0, 5);
    expect(d37Check(p, some).correct).toBe(false);
    expect(d37Check(p, some).confusedWith).toBeUndefined();
    expect(d37Missed(p, some)).toHaveLength(16);
  });

  it('ends on the first wrong tap; the minor 3rd is logged as C minor', () => {
    const eb = cellOf(p, 'Eb');
    const res = d37Check(p, [p.targets[0]!, eb]);
    expect(res).toMatchObject({ correct: false, confusedWith: 'triad:min' });
    expect(d37WrongTaps(p, [p.targets[0]!, eb])).toEqual([eb]);
    const f = cellOf(p, 'F');
    expect(d37Check(p, [f])).toEqual({
      correct: false,
      expected: 'C major: C E G',
      concept: 'triad:maj',
    });
  });

  it('confuses each chord with its pair, and a degree with its twin', () => {
    const swap = (id: string, note: string) => {
      const q = prompt(id);
      return d37ConfusedWith(q, cellOf(q, note));
    };
    expect(swap('chord-tones:Cm', 'E')).toBe('triad:maj');
    expect(swap('chord-tones:C7', 'B')).toBe('chord:maj7');
    expect(swap('chord-tones:C7', 'Eb')).toBe('chord:m7');
    expect(swap('chord-tones:Cmaj7', 'Bb')).toBe('chord:7');
    expect(swap('chord-tones:Cm7', 'Gb')).toBe('chord:m7b5');
    expect(swap('chord-tones:Cm7', 'E')).toBe('chord:7');
    expect(swap('chord-tones:3@C', 'Eb')).toBe('m3');
    expect(swap('chord-tones:b3@Cm', 'E')).toBe('M3');
    expect(swap('chord-tones:b7@C7', 'B')).toBe('M7');
    expect(swap('chord-tones:7@Cmaj7', 'Bb')).toBe('m7');
    // Not twins: a 7th for a 3rd, or any other note.
    expect(swap('chord-tones:3@C', 'B')).toBeUndefined();
    expect(swap('chord-tones:3@C', 'G')).toBeUndefined();
    expect(swap('chord-tones:C', 'F')).toBeUndefined();
  });

  it('logs no confusion for a tap outside the live frets', () => {
    const q = prompt('chord-tones:C', 0, 0);
    expect(d37IsLive(q, at(3, 8))).toBe(false);
    expect(d37IsLive(q, at(3, 3))).toBe(true);
    expect(d37IsLive(q, at(7, 3))).toBe(false);
    expect(d37Check(q, [at(3, 8)]).confusedWith).toBeUndefined();
  });

  it('grades completion time per target', () => {
    expect(d37GradedResponseMs(p, [], 21_000)).toBe(1000);
    const one = { ...p, targets: [] };
    expect(d37GradedResponseMs(one, [], 900)).toBe(900);
  });

  it('describes the taps for the review log', () => {
    expect(d37DescribeAnswer([at(6, 8), at(5, 7)])).toBe('s6f8 s5f7');
    expect(d37DescribeAnswer([])).toBe('none');
  });
});

describe('D37 feedback', () => {
  it('names the expected answer for the feedback bar', () => {
    expect(d37Expected(prompt('chord-tones:C'))).toBe('C major: C E G');
    expect(d37Expected(prompt('chord-tones:Bbm7'))).toBe('B♭m7: B♭ D♭ F A♭');
    expect(d37Expected(prompt('chord-tones:3@C'))).toBe('E, the 3rd of C major');
    expect(d37Expected(prompt('chord-tones:b3@Cm'))).toBe('E♭, the ♭3rd of C minor');
    expect(d37Asking(prompt('chord-tones:b7@C7'))).toBe('every ♭7th of C7');
  });

  it('plays the chord up from its lowest root, or the root and the degree', () => {
    const p = prompt('chord-tones:C');
    expect(d37Sounds(p, fb(p, p.targets))).toEqual({ expected: ['C3', 'E3', 'G3'] });
    const q = prompt('chord-tones:3@C');
    const wrong = cellOf(q, 'Eb');
    expect(d37Sounds(q, fb(q, [wrong]))).toEqual({
      expected: ['C3', 'E3'],
      given: [noteAt(wrong, STANDARD_TUNING, 'flat').name],
    });
  });

  it('shows every target, and the wrong taps', () => {
    const p = prompt('chord-tones:3@C');
    const wrong = cellOf(p, 'F');
    expect(d37FeedbackPositions(p, fb(p, [p.targets[0]!, wrong]))).toEqual({
      expected: p.targets.map((t) => ({ string: t.string, fret: t.fret })),
      given: [wrong],
    });
  });

  it('explains a full round, a confusion, a stray note and what is left', () => {
    const p = prompt('chord-tones:C', 0, 0);
    expect(d37Explain(p, fb(p, p.targets))).toBe(
      "That's every note of C major: C (R), E (3), G (5) in frets 0–3, the C shape of C major.",
    );
    const eb = cellOf(p, 'Eb');
    expect(d37Explain(p, fb(p, [eb]))).toMatch(
      /^You tapped E♭ \(string \d, fret \d+\): the ♭3rd, which makes C minor\. \d+ were still to find/,
    );
    const f = cellOf(p, 'F');
    expect(d37Explain(p, fb(p, [f]))).toMatch(
      /F \(string \d, fret \d+\), which isn't in C major\./,
    );
    const d = prompt('chord-tones:3@C');
    expect(d37Explain(d, fb(d, [cellOf(d, 'G')]))).toMatch(/: the 5th, not the 3rd\./);
    expect(d37Explain(d, fb(d, [cellOf(d, 'Eb')]))).toMatch(/: the ♭3rd, not the 3rd\./);
    expect(d37Explain(d, fb(d, [cellOf(d, 'F')]))).toMatch(/, which isn't the 3rd\./);
    expect(d37Explain(d, fb(d, d.targets.slice(1)))).toBe(
      '1 was still to find, ringed on the neck. E (3) in frets 0–12.',
    );
  });
});

describe('D37 wrong-tap names', () => {
  const sharp = (id: string) =>
    d37MakePrompt(
      { id, skillId: 'x' },
      { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 1, rng: () => 0 },
    );

  it('spells a degree from the root whatever the preference, and other notes by it', () => {
    const c = sharp('chord-tones:C');
    expect(d37TapName(c, at(4, 1))).toBe('E♭');
    expect(d37TapName(c, at(6, 1))).toBe('F');
    expect(d37TapName(c, at(6, 2))).toBe('F♯');
    const third = sharp('chord-tones:3@C');
    expect(d37TapName(third, at(4, 1))).toBe('E♭');
    expect(d37TapName(third, at(6, 3))).toBe('G');
    const seventh = sharp('chord-tones:7@Cmaj7');
    expect(d37TapName(seventh, at(3, 3))).toBe('B♭');
    expect(d37Explain(c, fb(c, [at(4, 1)]))).toMatch(
      /^You tapped E♭ \(string 4, fret 1\): the ♭3rd, which makes C minor\./,
    );
  });
});

describe('D37 guides', () => {
  it('drops string names while an open string holds an asked tone', () => {
    const c = prompt('chord-tones:C');
    expect(d37NeckGuideLevel(c, 2, { guided: false, answered: false })).toBe(1);
    expect(d37NeckGuideLevel(c, 2, { guided: false, answered: true })).toBe(2);
    expect(d37NeckGuideLevel(c, 0, { guided: true, answered: false })).toBe(3);
    expect(d37NeckGuideLevel(c, 1, { guided: false, answered: false })).toBe(1);
    // D♭ major (D♭ F A♭) has no open string.
    const db = prompt('chord-tones:Db');
    expect(d37NeckGuideLevel(db, 3, { guided: false, answered: false })).toBe(3);
  });

  it('squares the roots as a guide on degree cards only', () => {
    const third = prompt('chord-tones:3@C', 0, 0);
    expect(d37ShowsRoots(third, 2, false)).toBe(true);
    expect(d37ShowsRoots(third, 1, false)).toBe(false);
    expect(d37ShowsRoots(third, 0, true)).toBe(true);
    expect(d37ShowsRoots(prompt('chord-tones:C'), 3, true)).toBe(false);
    expect(cells(d37Roots(third))).toEqual(['s2f1', 's5f3']);
  });

  it('shows the target count only while guides are up', () => {
    expect(d37ShowsCount(2, false)).toBe(true);
    expect(d37ShowsCount(1, false)).toBe(false);
    expect(d37ShowsCount(0, true)).toBe(true);
  });
});

describe('D37 compact rounds', () => {
  const p = prompt('chord-tones:C');
  const rounds = d37Rounds(p, neckRegions('compact', p.activeRange, 5));

  it('runs the neck region by region from the nut, skipping empty regions', () => {
    expect(rounds.map((r) => r.region)).toEqual([
      { from: 0, to: 4 },
      { from: 5, to: 8 },
      { from: 9, to: 12 },
    ]);
    expect(rounds.flatMap((r) => r.targets)).toHaveLength(p.targets.length);
    const empty = d37Rounds(p, [
      { from: 0, to: 12 },
      { from: 13, to: 15 },
    ]);
    expect(empty).toEqual([{ region: p.activeRange, targets: [...p.targets] }]);
  });

  it('keeps the iPad and a box that fits the window in one round', () => {
    expect(d37Rounds(p, neckRegions('regular-wide', p.activeRange))).toHaveLength(1);
    const box = prompt('chord-tones:C', 0, 0);
    expect(d37Rounds(box, neckRegions('compact', box.activeRange, 5))).toEqual([
      { region: box.activeRange, targets: [...box.targets] },
    ]);
  });

  it('shows a full window per region', () => {
    expect(d37RegionWindow({ from: 9, to: 12 }, 5)).toEqual({ from: 9, to: 13 });
    expect(d37RegionWindow({ from: 12, to: 15 }, 5)).toEqual({ from: 11, to: 15 });
    expect(d37RegionWindow({ from: 0, to: 4 }, 7)).toEqual({ from: 0, to: 6 });
  });

  it('opens feedback on the first region with a miss or a wrong tap', () => {
    const inFirst = rounds[0]!.targets;
    const inSecond = rounds[1]!.targets;
    // Region 1 done, then "Done": the misses start in region 2.
    expect(d37FeedbackRound(p, rounds, inFirst)).toBe(1);
    // A wrong tap in region 1 shows region 1.
    expect(d37FeedbackRound(p, rounds, [cellOf(p, 'F')])).toBe(0);
    // Everything found: no marks, so the first region.
    expect(d37FeedbackRound(p, rounds, p.targets)).toBe(0);
    expect(d37MarkedOutside(p, rounds[1]!.region, [...inFirst, ...inSecond])).toBe(
      rounds[2]!.targets.length,
    );
  });
});
