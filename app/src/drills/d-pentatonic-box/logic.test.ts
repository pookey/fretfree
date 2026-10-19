import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine/skills';
import {
  BOX_NUMBERS,
  DROP_D_TUNING,
  STANDARD_TUNING,
  chromaOf,
  chromaToPc,
  midiAt,
  noteAt,
  type AccidentalPref,
  type BoxNumber,
  type PentatonicQuality,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillFeedback } from '../types';
import drill from './drill';
import {
  DPB_ID,
  DPB_REGION,
  dpbCanTest,
  dpbCheck,
  dpbChordSymbol,
  dpbConceptOf,
  dpbConfusedWith,
  dpbDegreeLine,
  dpbDescribeAnswer,
  dpbDisplay,
  dpbExplain,
  dpbFeedbackPositions,
  dpbFound,
  dpbGradedResponseMs,
  dpbIgnores,
  dpbIsLive,
  dpbMakePrompt,
  dpbMissed,
  dpbPlacements,
  dpbRelativeRoot,
  dpbRegularWindow,
  dpbScopeFor,
  dpbShowsCount,
  dpbShowsHint,
  dpbSounds,
  dpbSubject,
  dpbWindow,
  dpbWrongTaps,
  type DpbAnswer,
  type DpbPrompt,
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
  dpbMakePrompt({ id, skillId: 'C7.minor-boxes' }, ctx(over));

const at = (string: number, fret: number): Position => ({ string, fret });
const pos = (p: Position) => ({ string: p.string, fret: p.fret });
const cells = (ps: readonly Position[]) => ps.map((p) => `s${p.string}f${p.fret}`);
const fb = (p: DpbPrompt, answer: DpbAnswer): DrillFeedback<DpbAnswer> => ({
  answer,
  result: dpbCheck(p, answer),
});

/** Semitones above the root, independent of the theory module. */
const SCALE: Record<PentatonicQuality, number[]> = {
  minor: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 7, 9],
};
/** The CAGED shape each box wraps, from the usual box charts. */
const SHAPE_OF_BOX = { 1: 'E', 2: 'D', 3: 'C', 4: 'A', 5: 'G' } as const;

describe('pentatonic-box basics', () => {
  it('tests only C7 cards', () => {
    expect(dpbCanTest({ id: 'penta-box:1@minor', skillId: 'C7.minor-boxes' })).toBe(true);
    expect(dpbCanTest({ id: 'penta-relative:5@major', skillId: 'C7.relative' })).toBe(true);
    expect(dpbCanTest({ id: 'caged:E-shape@minor', skillId: 'C6.minor-shapes' })).toBe(false);
    expect(dpbConceptOf({ id: 'penta-box:2@major', skillId: 'C7.major-boxes' })).toBe(
      'penta-box:2@major',
    );
    expect(dpbConceptOf({ id: 'note@s6f5', skillId: 'F2.string6-naturals' })).toBeNull();
  });

  it('maps scope levels to roots, clamped', () => {
    expect([-1, 0, 0.4, 1, 7].map(dpbScopeFor)).toEqual([
      'naturals',
      'naturals',
      'naturals',
      'all',
      'all',
    ]);
  });

  it('displays degrees and accidentals', () => {
    expect(['1', 'b3', '4', 'b7', 'F#', 'Bb', 'Bbm'].map(dpbDisplay)).toEqual([
      'R',
      '♭3',
      '4',
      '♭7',
      'F♯',
      'B♭',
      'B♭m',
    ]);
    expect(dpbChordSymbol('A', 'minor')).toBe('Am');
    expect(dpbChordSymbol('C', 'major')).toBe('C');
  });

  it('is registered for every C7 skill, and every C7 card is one it can test', () => {
    expect(drill.id).toBe(DPB_ID);
    expect(drill.inputModes).toEqual(['tap']);
    expect(drill.skills).toEqual(['C7.minor-boxes', 'C7.major-boxes', 'C7.relative']);
    for (const id of drill.skills) {
      const skill = getSkill(id)!;
      expect(skill.drillTypes).toContain(DPB_ID);
      for (const item of skill.items()) expect(drill.canTest(item), item.id).toBe(true);
    }
  });

  it('refuses other cards and tunings without six strings', () => {
    expect(() => make('caged:E-shape@minor')).toThrow();
    const bass: Tuning = { id: 'bass', name: 'Bass', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(() => make('penta-box:1@minor', { tuning: bass })).toThrow();
  });
});

describe('dpbPlacements', () => {
  it('places every box of every root and quality, each holding its chord shape', () => {
    for (const quality of ['minor', 'major'] as const) {
      for (const box of BOX_NUMBERS) {
        for (let chroma = 0; chroma < 12; chroma++) {
          const root = chromaToPc(chroma);
          const placements = dpbPlacements(box, quality, root, STANDARD_TUNING);
          const label = `${root} ${quality} box ${box}`;
          expect(placements.length, label).toBeGreaterThan(0);
          for (const p of placements) {
            expect(p.notes, label).toHaveLength(12);
            for (let s = 1; s <= 6; s++) {
              expect(
                p.notes.filter((n) => n.string === s),
                label,
              ).toHaveLength(2);
            }
            for (const n of p.notes) {
              const semis = (((midiAt(n) - chroma) % 12) + 12) % 12;
              expect(SCALE[quality], label).toContain(semis);
              expect(n.fret).toBeGreaterThanOrEqual(DPB_REGION.from);
              expect(n.fret).toBeLessThanOrEqual(DPB_REGION.to);
            }
            // Box N starts on the scale's Nth note on string 6.
            const low = p.notes.filter((n) => n.string === 6).sort((a, b) => a.fret - b.fret)[0]!;
            expect((((midiAt(low) - chroma) % 12) + 12) % 12, label).toBe(SCALE[quality][box - 1]);
            for (const s of p.shape) {
              expect(
                p.notes.some((n) => n.string === s.string && n.fret === s.fret),
                label,
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  it('finds every octave that fits the neck', () => {
    // E minor box 1: open position and at the 12th fret.
    const frets = dpbPlacements(1, 'minor', 'E', STANDARD_TUNING).map((p) =>
      Math.min(...p.notes.map((n) => n.fret)),
    );
    expect(frets).toEqual([0, 12]);
    const above = dpbPlacements(1, 'minor', 'E', STANDARD_TUNING, { from: 1, to: 15 });
    expect(above.map((p) => Math.min(...p.notes.map((n) => n.fret)))).toEqual([12]);
  });
});

describe('overlay prompts (penta-box)', () => {
  // rng 0 picks the first natural root, C, and its lowest position: frets 8–11.
  const p = make('penta-box:1@minor');

  it('draws the E-shape Cm chord and asks for the rest of box 1', () => {
    expect(p).toMatchObject({
      mode: 'overlay',
      box: 1,
      quality: 'minor',
      root: 'C',
      chord: 'Cm',
      shape: 'E',
      span: { from: 8, to: 11 },
      scope: 'naturals',
      activeRange: DPB_REGION,
    });
    expect(cells(p.given)).toEqual(['s6f8', 's5f10', 's4f10', 's3f8', 's2f8', 's1f8']);
    expect(p.given.map((n) => n.degree)).toEqual(['1', '5', '1', 'b3', '5', '1']);
    expect(cells(p.targets)).toEqual(['s6f11', 's5f8', 's4f8', 's3f10', 's2f11', 's1f11']);
    expect(dpbDegreeLine(p.targets)).toBe('♭3 4 ♭7 4 ♭7 ♭3');
    expect(p.targets.map((n) => n.pc)).toEqual(['D#', 'F', 'A#', 'F', 'A#', 'D#']);
    expect(p.boxNotes).toHaveLength(12);
    expect(p.relative).toEqual({ root: 'Eb', quality: 'major', box: 5 });
  });

  it('places the boxes either side, without the notes they share', () => {
    expect(p.neighbours.map((n) => n.box)).toEqual([5, 2]);
    expect(cells(p.neighbours[0]!.notes)).toEqual(['s6f6', 's5f6', 's4f5', 's3f5', 's2f6', 's1f6']);
    expect(cells(p.neighbours[1]!.notes)).toEqual([
      's6f13',
      's5f13',
      's4f13',
      's3f12',
      's2f13',
      's1f13',
    ]);
  });

  it('wraps the box’s CAGED shape for every box number', () => {
    for (const box of BOX_NUMBERS) {
      for (const quality of ['minor', 'major'] as const) {
        const q = make(`penta-box:${box}@${quality}`, { scopeLevel: 1, rng: () => 0.5 });
        expect(q.shape).toBe(SHAPE_OF_BOX[box]);
        expect(q.given.length + q.targets.length).toBe(12);
        // The chord shape's notes are its root, 3rd and 5th.
        const chord = quality === 'minor' ? ['1', 'b3', '5'] : ['1', '3', '5'];
        for (const n of q.given) expect(chord).toContain(n.degree);
      }
    }
  });

  it('roots on naturals at scope 0 and on any pitch class at scope 1', () => {
    const roots = (scopeLevel: number) =>
      new Set(
        Array.from(
          { length: 24 },
          (_, i) => make('penta-box:3@major', { scopeLevel, rng: () => i / 24 }).root,
        ),
      );
    expect([...roots(0)].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(roots(1).size).toBe(12);
    expect(make('penta-box:1@minor', { scopeLevel: 1, rng: () => 0.99, pref: 'flat' }).root).toBe(
      'B',
    );
    expect(make('penta-box:1@minor', { scopeLevel: 1, rng: () => 0.3, pref: 'flat' }).root).toMatch(
      /b$/,
    );
  });

  it('ignores taps on the given chord, and marks everything else', () => {
    expect(dpbIgnores(p, at(6, 8))).toBe(true);
    expect(dpbIgnores(p, at(6, 11))).toBe(false);
    expect(dpbIsLive(p, at(6, 15))).toBe(true);
    expect(dpbIsLive(p, at(6, 16))).toBe(false);
    const taps = [at(6, 8), at(6, 11), at(5, 8)];
    expect(cells(dpbFound(p, taps))).toEqual(['s6f11', 's5f8']);
    expect(dpbMissed(p, taps)).toHaveLength(4);
    expect(dpbWrongTaps(p, taps)).toEqual([]);
  });

  it('checks a whole box, and a box left unfinished', () => {
    expect(dpbCheck(p, p.targets.map(pos))).toEqual({
      correct: true,
      expected: 'Cm pentatonic box 1',
    });
    expect(dpbCheck(p, [at(6, 11)])).toEqual({ correct: false, expected: 'Cm pentatonic box 1' });
  });

  it('keys a tap in the next box, or the box below, as that box', () => {
    expect(dpbCheck(p, [at(6, 11), at(4, 13)])).toEqual({
      correct: false,
      expected: 'Cm pentatonic box 1',
      confusedWith: 'penta-box:2@minor',
      concept: 'penta-box:1@minor',
    });
    expect(dpbConfusedWith(p, at(3, 5))).toBe('penta-box:5@minor');
  });

  it('keys a note of C major pentatonic as the major box', () => {
    // String 6, fret 10 is D: in C major pentatonic, not C minor.
    expect(dpbCheck(p, [at(6, 10)]).confusedWith).toBe('penta-box:1@major');
    // C♯ is in neither scale.
    expect(dpbCheck(p, [at(6, 9)])).toEqual({ correct: false, expected: 'Cm pentatonic box 1' });
  });

  it('explains the box, and each kind of mistake', () => {
    const what = 'Box 1 wraps the E shape of Cm.';
    expect(dpbExplain(p, fb(p, p.targets.map(pos)))).toBe(`That's Cm pentatonic box 1. ${what}`);
    expect(dpbExplain(p, fb(p, [at(6, 11)]))).toBe(`${what} 5 still to find, ringed on the neck.`);
    expect(dpbExplain(p, fb(p, [at(4, 13)]))).toBe(
      `You tapped string 4, fret 13, in box 2. ${what}`,
    );
    expect(dpbExplain(p, fb(p, [at(6, 10)]))).toBe(
      `You tapped string 6, fret 10: that note is in C major pentatonic. ${what}`,
    );
    expect(dpbExplain(p, fb(p, [at(6, 9)]))).toBe(
      `You tapped string 6, fret 9, outside the box. ${what}`,
    );
  });

  it('plays the box up from its lowest note, and a wrong note after', () => {
    expect(dpbSounds(p, fb(p, p.targets.map(pos)))).toEqual({
      expected: ['C3', 'D#3', 'F3', 'G3', 'A#3', 'C4', 'D#4', 'F4', 'G4', 'A#4', 'C5', 'D#5'],
    });
    expect(dpbSounds(p, fb(p, [at(6, 9)])).given).toEqual(['C#3']);
  });

  it('grades per note and logs the taps', () => {
    expect(dpbGradedResponseMs(p, [], 6000)).toBe(1000);
    expect(dpbDescribeAnswer([at(6, 11), at(5, 8)])).toBe('s6f11 s5f8');
    expect(dpbDescribeAnswer([])).toBe('none');
    expect(dpbFeedbackPositions(p, fb(p, [at(6, 11), at(6, 9)]))).toEqual({
      expected: p.targets,
      given: [at(6, 9)],
    });
  });
});

describe('relative prompts (penta-relative)', () => {
  const p = make('penta-relative:1@minor');

  it('draws the whole box and asks for the relative major’s roots', () => {
    expect(p).toMatchObject({ mode: 'relative', root: 'C', shape: 'E', neighbours: [] });
    expect(p.given).toEqual(p.boxNotes);
    expect(cells(p.targets)).toEqual(['s6f11', 's3f8', 's1f11']);
    expect(p.relative).toEqual({ root: 'Eb', quality: 'major', box: 5 });
    expect(dpbSubject(p)).toBe('E♭, the relative major of Cm');
    expect(make('penta-relative:1@minor', { pref: 'flat' }).relative.root).toBe('Eb');
  });

  it('spells the relative key as keys are spelled, falling back to the preference', () => {
    expect(dpbRelativeRoot('G', 'minor', 'sharp')).toBe('Bb');
    expect(dpbRelativeRoot('A#', 'minor', 'sharp')).toBe('C#');
    expect(dpbRelativeRoot('Db', 'major', 'flat')).toBe('Bb');
    // D♯ major's relative is B♯ minor: spelled C instead.
    expect(dpbRelativeRoot('D#', 'major', 'sharp')).toBe('C');
    expect(dpbRelativeRoot('Gb', 'major', 'flat')).toBe('Eb');
  });

  it('finds the relative minor’s root in a major box', () => {
    const q = make('penta-relative:5@major');
    expect(q.root).toBe('C');
    expect(q.relative).toEqual({ root: 'A', quality: 'minor', box: 1 });
    for (const t of q.targets) expect(noteAt(t).pc).toBe('A');
    expect(dpbSubject(q)).toBe('A, the relative minor of C');
    expect(dpbExplain(q, fb(q, q.targets.map(pos)))).toBe(
      "That's it. A is a minor 3rd down from C: this box is also A minor box 1.",
    );
  });

  it('keys a tap on the box’s own root as the relative card with the same fingering', () => {
    expect(dpbIgnores(p, at(6, 8))).toBe(false);
    expect(dpbCheck(p, [at(6, 11), at(4, 10)])).toEqual({
      correct: false,
      expected: 'E♭, the relative major of Cm',
      confusedWith: 'penta-relative:5@major',
      concept: 'penta-relative:1@minor',
    });
    // Another note of the box, or a C outside it, is wrong with no confusion.
    expect(dpbCheck(p, [at(5, 8)]).confusedWith).toBeUndefined();
    expect(dpbCheck(p, [at(5, 15)]).confusedWith).toBeUndefined();
    expect(dpbCheck(p, p.targets.map(pos)).correct).toBe(true);
  });

  it('explains the relative link, and each kind of mistake', () => {
    const what = 'E♭ is a minor 3rd up from C: this box is also E♭ major box 5.';
    expect(dpbExplain(p, fb(p, p.targets.map(pos)))).toBe(`That's it. ${what}`);
    expect(dpbExplain(p, fb(p, [at(6, 11)]))).toBe(`${what} 2 still to find, ringed on the neck.`);
    expect(dpbExplain(p, fb(p, [at(4, 10)]))).toBe(
      `You tapped string 4, fret 10, the box's own root. ${what}`,
    );
    expect(dpbExplain(p, fb(p, [at(5, 15)]))).toBe(
      `You tapped string 5, fret 15, outside the box. ${what}`,
    );
    expect(dpbExplain(p, fb(p, [at(5, 8)]))).toBe(`You tapped string 5, fret 8. ${what}`);
  });

  it('plays the box from the relative root’s lowest note to its highest', () => {
    const { expected } = dpbSounds(p, fb(p, p.targets.map(pos)));
    expect(expected[0]).toBe('D#3');
    expect(expected[expected.length - 1]).toBe('D#5');
    expect(expected).toHaveLength(11);
  });

  it('lists the relative pairs side by side (rule 6)', () => {
    const ids = getSkill('C7.relative')!
      .items()
      .map((i) => i.id);
    for (let i = 0; i < ids.length; i += 2) {
      const minor = make(ids[i]!);
      expect(ids[i + 1]).toBe(`penta-relative:${minor.relative.box}@major`);
      // The confusion a tap on the minor box's root logs is its partner.
      const own = minor.boxNotes.find((n) => chromaOf(n.pc) === chromaOf(minor.root))!;
      expect(dpbConfusedWith(minor, own)).toBe(ids[i + 1]);
    }
  });
});

describe('tunings', () => {
  it('moves each note along its string to keep its pitch in drop D', () => {
    const std = make('penta-relative:1@minor', { scopeLevel: 1, rng: () => 4 / 12 });
    const drop = make('penta-relative:1@minor', {
      scopeLevel: 1,
      rng: () => 4 / 12,
      tuning: DROP_D_TUNING,
    });
    expect(std.root).toBe('E');
    expect(drop.root).toBe('E');
    // E minor box 1 sits in open position: in drop D its string-6 notes move up two frets.
    const midis = (q: DpbPrompt) => q.boxNotes.map((n) => midiAt(n, q.tuning));
    expect(midis(drop)).toEqual(midis(std));
    const low = (q: DpbPrompt) => q.boxNotes.filter((n) => n.string === 6).map((n) => n.fret);
    expect(low(std)).toEqual([0, 3]);
    expect(low(drop)).toEqual([2, 5]);
  });
});

describe('guides and windows', () => {
  it('shows the count and the hint only while guides are up (rule 9)', () => {
    expect(dpbShowsCount(1, false)).toBe(false);
    expect(dpbShowsCount(2, false)).toBe(true);
    expect(dpbShowsCount(0, true)).toBe(true);
    expect(dpbShowsHint(1, false)).toBe(false);
    expect(dpbShowsHint(3, false)).toBe(true);
    expect(dpbShowsHint(0, true)).toBe(true);
  });

  const placed = (from: number, to: number): DpbPrompt => ({
    ...make('penta-box:1@minor'),
    span: { from, to },
  });

  it('centres a compact window on the box, inside the neck', () => {
    expect(dpbWindow(placed(8, 11), 5)).toEqual({ from: 7, to: 13 });
    expect(dpbWindow(placed(0, 3), 5)).toEqual({ from: 0, to: 6 });
    expect(dpbWindow(placed(12, 15), 5)).toEqual({ from: 9, to: 15 });
    // A phone on its side shows more frets.
    expect(dpbWindow(placed(8, 11), 9)).toEqual({ from: 6, to: 14 });
  });

  it('slides the 12-fret portrait neck up just far enough to hold the box', () => {
    expect(dpbRegularWindow(placed(3, 6))).toEqual({ from: 0, to: 12 });
    expect(dpbRegularWindow(placed(8, 11))).toEqual({ from: 0, to: 12 });
    expect(dpbRegularWindow(placed(10, 13))).toEqual({ from: 2, to: 14 });
    expect(dpbRegularWindow(placed(12, 15))).toEqual({ from: 3, to: 15 });
  });

  it('keeps every placed box inside each window', () => {
    for (const box of [1, 2, 3, 4, 5] as BoxNumber[]) {
      for (let i = 0; i < 12; i++) {
        const q = make(`penta-box:${box}@major`, { scopeLevel: 1, rng: () => i / 12 });
        for (const w of [dpbWindow(q, 5), dpbRegularWindow(q)]) {
          expect(w.from).toBeLessThanOrEqual(q.span.from);
          expect(w.to).toBeGreaterThanOrEqual(q.span.to);
        }
      }
    }
  });
});
