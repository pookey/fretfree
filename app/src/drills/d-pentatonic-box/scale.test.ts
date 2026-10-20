import { describe, expect, it } from 'vitest';
import {
  BOX_NUMBERS,
  DROP_D_TUNING,
  STANDARD_TUNING,
  chromaOf,
  midiAt,
  type AccidentalPref,
  type BoxNumber,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillFeedback } from '../types';
import {
  DPB_REGION,
  dpbRegularWindow,
  dpbWindow,
  isScalePrompt,
  pentaCheck,
  pentaFeedbackPositions,
  pentaGradedResponseMs,
  pentaMakePrompt,
  pentaSounds,
} from './logic';
import {
  dpsAccepts,
  dpsCheck,
  dpsConfusedWith,
  dpsDegreeLabel,
  dpsDegreeLine,
  dpsDegreeName,
  dpsExplain,
  dpsFound,
  dpsIgnores,
  dpsInKey,
  dpsMakePrompt,
  dpsMissed,
  dpsPlacements,
  dpsStartAt,
  dpsSubject,
  dpsTonic,
  dpsWrongTaps,
  type DpsAnswer,
  type DpsPrompt,
} from './scale';

const ctx = (
  over: { scopeLevel?: number; rng?: () => number; tuning?: Tuning; pref?: AccidentalPref } = {},
) => ({
  tuning: over.tuning ?? STANDARD_TUNING,
  accidentalPref: over.pref ?? 'sharp',
  scopeLevel: over.scopeLevel ?? 0,
  rng: over.rng ?? (() => 0),
});

const make = (id: string, over: Parameters<typeof ctx>[0] = {}) =>
  dpsMakePrompt({ id, skillId: 'I7.positions' }, ctx(over));

const at = (string: number, fret: number): Position => ({ string, fret });
const pos = (p: Position) => ({ string: p.string, fret: p.fret });
const cells = (ps: readonly Position[]) => ps.map((p) => `s${p.string}f${p.fret}`);
const fb = (p: DpsPrompt, answer: DpsAnswer): DrillFeedback<DpsAnswer> => ({
  answer,
  result: dpsCheck(p, answer),
});

/** Semitones above the tonic, independent of the theory module. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];
const semisOf = (p: Position, tonic: string, tuning: Tuning = STANDARD_TUNING) =>
  (((midiAt(p, tuning) - chromaOf(tonic)) % 12) + 12) % 12;

describe('scale-position basics', () => {
  it('names degrees and keys', () => {
    expect(([1, 2, 3, 4, 5, 6, 7] as const).map(dpsDegreeName)).toEqual([
      'root',
      '2nd',
      '3rd',
      '4th',
      '5th',
      '6th',
      '7th',
    ]);
    expect(dpsDegreeLabel(1)).toBe('R');
    expect(dpsDegreeLabel(4)).toBe('4');
    // Keys as the circle spells them: no A♯ major, whatever the preference.
    expect([1, 3, 6, 8, 10].map((c) => dpsTonic(c, 'sharp'))).toEqual([
      'Db',
      'Eb',
      'F#',
      'Ab',
      'Bb',
    ]);
    expect(dpsTonic(6, 'flat')).toBe('Gb');
  });

  it('refuses other cards and tunings without six strings', () => {
    expect(() => make('penta-box:1@minor')).toThrow();
    const bass: Tuning = { id: 'bass', name: 'Bass', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(() => make('scale-position:1', { tuning: bass })).toThrow();
  });
});

describe('dpsPlacements', () => {
  it('places every position of every key on the neck, as its box plus the 4 and 7', () => {
    for (let chroma = 0; chroma < 12; chroma++) {
      const tonic = dpsTonic(chroma, 'sharp');
      for (const position of BOX_NUMBERS) {
        const label = `${tonic} major position ${position}`;
        const placements = dpsPlacements(tonic, position, STANDARD_TUNING);
        expect(placements.length, label).toBeGreaterThan(0);
        for (const p of placements) {
          const midis = p.notes.map((n) => midiAt(n));
          // One cell per pitch, low to high.
          expect(
            midis.every((m, i) => i === 0 || m > midis[i - 1]!),
            label,
          ).toBe(true);
          const frets = p.notes.map((n) => n.fret);
          expect(Math.max(...frets) - Math.min(...frets), label).toBeLessThanOrEqual(4);
          for (const n of p.notes) {
            expect(n.fret).toBeGreaterThanOrEqual(DPB_REGION.from);
            expect(n.fret).toBeLessThanOrEqual(DPB_REGION.to);
            expect(MAJOR[n.degree - 1], label).toBe(semisOf(n, tonic));
          }
          // The box is inside the position, and the rest is the 4ths and 7ths.
          expect(p.box, label).toHaveLength(12);
          for (const b of p.box) {
            expect(PENTA).toContain(semisOf(b, tonic));
            expect(cells(p.notes)).toContain(cells([b])[0]);
          }
          const rest = p.notes.filter((n) => !cells(p.box).includes(cells([n])[0]!));
          expect(new Set(rest.map((n) => n.degree)), label).toEqual(new Set([4, 7]));
          // Every degree comes at least twice, so every run has a top and a bottom.
          for (let d = 1; d <= 7; d++) {
            expect(p.notes.filter((n) => n.degree === d).length, label).toBeGreaterThanOrEqual(2);
          }
        }
      }
    }
  });

  it('finds every octave that fits the neck', () => {
    // F major position 1 (E shape): open position and at the 12th fret.
    const from = dpsPlacements('F', 1, STANDARD_TUNING).map((p) =>
      Math.min(...p.notes.map((n) => n.fret)),
    );
    expect(from).toEqual([0, 12]);
    expect(dpsPlacements('F', 1, STANDARD_TUNING, { from: 1, to: 15 })).toHaveLength(1);
    // E major's would need fret −1 for its lowest 7th, so it sits only at the 11th.
    expect(dpsPlacements('E', 1, STANDARD_TUNING)).toHaveLength(1);
  });
});

describe('position prompts (scale-position)', () => {
  // rng 0 picks the first natural key, C, and its lowest place: frets 7–10.
  const p = make('scale-position:1');

  it('draws C major box 1 and asks for the 4ths and 7ths around it', () => {
    expect(p).toMatchObject({
      mode: 'position',
      position: 1,
      degree: 1,
      tonic: 'C',
      shape: 'E',
      span: { from: 7, to: 10 },
      scope: 'naturals',
      activeRange: DPB_REGION,
    });
    expect(p.notes).toHaveLength(17);
    expect(p.given).toHaveLength(12);
    expect(cells(p.targets)).toEqual(['s6f7', 's5f8', 's4f9', 's3f10', 's1f7']);
    expect(p.targets.map((n) => n.pc)).toEqual(['B', 'F', 'B', 'F', 'B']);
    expect(dpsSubject(p)).toBe('C major position 1');
  });

  it('places the positions either side as the confusion', () => {
    expect(p.neighbours.map((n) => n.position)).toEqual([5, 2]);
    for (const n of p.neighbours) {
      for (const c of n.notes) expect(cells(p.notes)).not.toContain(cells([c])[0]);
    }
    // In open position there is no room for the one below.
    const open = make('scale-position:1', { rng: () => 3 / 7 }); // F
    expect(open.tonic).toBe('F');
    expect(open.span.from).toBe(0);
    expect(open.neighbours.map((n) => n.position)).toEqual([2]);
  });

  it('grades the whole position, ignoring taps on the box', () => {
    expect(dpsIgnores(p, at(6, 8))).toBe(true);
    expect(dpsIgnores(p, at(6, 7))).toBe(false);
    expect(dpsAccepts(p, [], at(5, 8))).toBe(true);
    expect(dpsAccepts(p, [], at(5, 9))).toBe(false);
    const all = p.targets.map(pos);
    expect(dpsCheck(p, all)).toEqual({ correct: true, expected: 'C major position 1' });
    // Any order: a position is a shape, not a run.
    expect(dpsCheck(p, [...all].reverse()).correct).toBe(true);
    expect(dpsCheck(p, [...all, at(6, 8)]).correct).toBe(true);
    expect(dpsFound(p, [at(1, 7), at(6, 7)]).map(pos)).toEqual([at(1, 7), at(6, 7)]);
    expect(dpsMissed(p, all.slice(1))).toHaveLength(1);
    expect(dpsCheck(p, all.slice(1))).toEqual({ correct: false, expected: 'C major position 1' });
  });

  it('logs a tap in the next position against its card (rule 6)', () => {
    const wrong = p.neighbours.find((n) => n.position === 2)!.notes[0]!;
    expect(dpsConfusedWith(p, [wrong], wrong)).toBe('scale-position:2');
    expect(dpsCheck(p, [at(6, 7), wrong])).toEqual({
      correct: false,
      expected: 'C major position 1',
      confusedWith: 'scale-position:2',
      concept: 'scale-position:1',
    });
    expect(dpsExplain(p, fb(p, [wrong]))).toMatch(
      /^You tapped string \d, fret \d+, in position 2\./,
    );
  });

  it('explains a note out of the key, one out of the position, and a miss', () => {
    // F♯ (s6f2) isn't in C major; s6f14 is, but far from position 1.
    expect(dpsInKey(p, at(6, 2))).toBe(false);
    expect(dpsExplain(p, fb(p, [at(6, 2)]))).toContain("that note isn't in C major");
    expect(dpsCheck(p, [at(6, 2)])).toEqual({ correct: false, expected: 'C major position 1' });
    expect(dpsExplain(p, fb(p, [at(6, 15)]))).toContain('outside the position');
    expect(dpsExplain(p, fb(p, [at(6, 7)]))).toContain('4 still to play');
    expect(dpsExplain(p, fb(p, p.targets.map(pos)))).toBe(
      "That's C major position 1. Position 1 is major box 1 with its 4ths and 7ths, " +
        'around the E shape.',
    );
  });

  it('plays the position up from its lowest note, then a wrong note', () => {
    const right = pentaSounds(p, fb(p, p.targets.map(pos)));
    expect(right.expected).toHaveLength(17);
    expect(right.expected[0]).toBe('B2');
    expect(right.given).toBeUndefined();
    expect(pentaSounds(p, fb(p, [at(6, 2)])).given).toEqual(['F#2']);
    expect(pentaFeedbackPositions(p, fb(p, [at(6, 2)]))).toEqual({
      expected: p.targets,
      given: [at(6, 2)],
    });
  });
});

describe('run prompts (scale-run)', () => {
  const r = make('scale-run:1@5');

  it('draws the roots and asks for the run from the lowest 5th to the highest', () => {
    expect(r).toMatchObject({ mode: 'run', position: 1, degree: 5, tonic: 'C', neighbours: [] });
    expect(r.given.every((n) => n.degree === 1)).toBe(true);
    expect(cells(r.given)).toEqual(['s6f8', 's4f10', 's1f8']);
    expect(dpsDegreeLine(r.targets)).toBe('5 6 7 R 2 3 4 5');
    expect(cells(r.targets)).toEqual([
      's5f10',
      's4f7',
      's4f9',
      's4f10',
      's3f7',
      's3f9',
      's3f10',
      's2f8',
    ]);
    expect(dpsSubject(r)).toBe('C major position 1 from the 5th');
    // From the root: root to root, two octaves.
    expect(dpsDegreeLine(make('scale-run:1@1').targets)).toBe('R 2 3 4 5 6 7 R 2 3 4 5 6 7 R');
  });

  it('takes the run only in order', () => {
    const run = r.targets.map(pos);
    expect(dpsCheck(r, run)).toEqual({
      correct: true,
      expected: 'C major position 1 from the 5th',
    });
    expect(dpsAccepts(r, [], run[0]!)).toBe(true);
    expect(dpsAccepts(r, [], run[1]!)).toBe(false);
    expect(dpsAccepts(r, run, run[0]!)).toBe(false);
    expect(dpsFound(r, run.slice(0, 3))).toEqual(r.targets.slice(0, 3));
    // A skipped note: the taps after it are wrong.
    const skipped = [run[0]!, run[2]!];
    expect(dpsWrongTaps(r, skipped)).toEqual([run[2]]);
    expect(dpsCheck(r, skipped)).toEqual({
      correct: false,
      expected: 'C major position 1 from the 5th',
    });
    expect(dpsExplain(r, fb(r, skipped))).toContain(
      'You tapped string 4, fret 9; the next note was string 4, fret 7.',
    );
    expect(dpsCheck(r, run.slice(0, 4)).correct).toBe(false);
    expect(dpsExplain(r, fb(r, run.slice(0, 4)))).toContain('4 still to play');
  });

  it('logs a start on another degree against that run (rule 6)', () => {
    // The lowest 4th in C position 1 is s5f8.
    expect(dpsStartAt(r, at(5, 8))).toBe(4);
    expect(dpsStartAt(r, at(3, 10))).toBeUndefined(); // the higher 4th
    expect(dpsStartAt(r, at(5, 9))).toBeUndefined(); // not in the position
    expect(dpsCheck(r, [at(5, 8)])).toEqual({
      correct: false,
      expected: 'C major position 1 from the 5th',
      confusedWith: 'scale-run:1@4',
      concept: 'scale-run:1@5',
    });
    expect(dpsExplain(r, fb(r, [at(5, 8)]))).toBe(
      'You tapped string 5, fret 8, the lowest 4th. ' +
        'The run starts on the lowest 5th, string 5, fret 10, and goes up to the highest.',
    );
    // A wrong note later on is no wrong start, nor is a note outside the position.
    expect(dpsConfusedWith(r, [at(5, 10), at(5, 8)], at(5, 8))).toBeUndefined();
    expect(dpsCheck(r, [at(5, 9)]).confusedWith).toBeUndefined();
    expect(dpsExplain(r, fb(r, r.targets.map(pos)))).toMatch(/^That's it\./);
  });

  it('plays the run', () => {
    expect(pentaSounds(r, fb(r, r.targets.map(pos))).expected).toEqual([
      'G3',
      'A3',
      'B3',
      'C4',
      'D4',
      'E4',
      'F4',
      'G4',
    ]);
  });
});

describe('varied keys, places and tunings (rule 12)', () => {
  it('uses natural keys first, then all twelve', () => {
    const keys = (scopeLevel: number, pref: AccidentalPref = 'sharp') =>
      new Set(
        Array.from(
          { length: 24 },
          (_, i) => make('scale-position:3', { scopeLevel, pref, rng: () => i / 24 }).tonic,
        ),
      );
    expect(keys(0)).toEqual(new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']));
    expect(keys(1).size).toBe(12);
    expect(keys(1, 'flat').has('Gb')).toBe(true);
  });

  it('keeps the pitches in drop D', () => {
    const std = make('scale-run:1@1');
    const drop = make('scale-run:1@1', { tuning: DROP_D_TUNING });
    expect(drop.tonic).toBe('C');
    const midis = (q: DpsPrompt) => q.notes.map((n) => midiAt(n, q.tuning));
    expect(midis(drop)).toEqual(midis(std));
    expect(drop.notes.filter((n) => n.string === 6).map((n) => n.fret)).toEqual([9, 10, 12]);
    for (const n of drop.notes) expect(MAJOR[n.degree - 1]).toBe(semisOf(n, 'C', DROP_D_TUNING));
  });

  it('keeps every placed position inside each window', () => {
    for (const position of [1, 2, 3, 4, 5] as BoxNumber[]) {
      for (let i = 0; i < 12; i++) {
        const q = make(`scale-position:${position}`, { scopeLevel: 1, rng: () => i / 12 });
        for (const w of [dpbWindow(q, 5), dpbRegularWindow(q)]) {
          expect(w.from).toBeLessThanOrEqual(q.span.from);
          expect(w.to).toBeGreaterThanOrEqual(q.span.to);
        }
      }
    }
  });
});

describe('the drill routes each card to its half', () => {
  const c = ctx();

  it('builds, grades and times scale and box prompts', () => {
    const scale = pentaMakePrompt({ id: 'scale-run:2@3', skillId: 'I7.degree-runs' }, c);
    const box = pentaMakePrompt({ id: 'penta-box:2@major', skillId: 'C7.major-boxes' }, c);
    expect(isScalePrompt(scale)).toBe(true);
    expect(isScalePrompt(box)).toBe(false);
    expect(pentaCheck(scale, scale.targets.map(pos)).correct).toBe(true);
    expect(pentaCheck(box, box.targets.map(pos)).correct).toBe(true);
    const fbox = { answer: box.targets, result: pentaCheck(box, box.targets) };
    expect(pentaSounds(box, fbox).expected).toHaveLength(12);
    expect(pentaFeedbackPositions(box, fbox).expected).toEqual(box.targets);
    expect(pentaGradedResponseMs(scale, [], scale.targets.length * 900)).toBe(900);
    expect(pentaGradedResponseMs(box, [], box.targets.length * 700)).toBe(700);
  });
});
