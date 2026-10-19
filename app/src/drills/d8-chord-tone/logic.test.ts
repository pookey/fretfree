import { describe, expect, it } from 'vitest';
import {
  chordToneItemId,
  itemId,
  parseChordToneItemId,
  parseItemId,
  type Item,
} from '../../engine/model';
import { getSkill } from '../../engine/skills';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  chordDegreeSemitones,
  chromaOf,
  midiAt,
  type ChordDegree,
  type ChordKind,
  type Position,
} from '../../theory';
import type { DrillFeedback } from '../types';
import {
  D8_REGION,
  d8CanTest,
  d8Check,
  d8Choices,
  d8ConceptOf,
  d8DegreeLabel,
  d8DegreeLine,
  d8DegreeName,
  d8DegreeSpoken,
  d8DegreeStyle,
  d8DescribeAnswer,
  d8Display,
  d8Expected,
  d8Explain,
  d8FeedbackPositions,
  d8KeyFor,
  d8KeyToAnswer,
  d8MakePrompt,
  d8NoteAt,
  d8ScopeFor,
  d8ShowsRoots,
  d8Sounds,
  d8SpellRoot,
  d8Targets,
  d8VoicingLine,
  d8Window,
  type D8Answer,
  type D8Prompt,
} from './logic';
import { D8_KINDS, placements, templatesFor } from './voicings';

const item = (id: string): Item => ({ id, skillId: 'C5.tones-roots' });

/** A deterministic rng cycling through fixed values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

const ctx = (rng: () => number, scopeLevel = 0, tuning = STANDARD_TUNING) => ({
  tuning,
  accidentalPref: 'sharp' as const,
  scopeLevel,
  rng,
});

const ITEM_IDS = [
  'C5.tones-roots',
  'C5.tones-thirds',
  'C5.tones-fifths',
  'C5.tones-sevenths',
].flatMap((id) =>
  getSkill(id)!
    .items()
    .map((i) => i.id),
);

/** Semitones above the root, independent of the drill's own degree labels. */
function semitonesAbove(root: string, pos: Position, tuning = STANDARD_TUNING): number {
  return (((midiAt(pos, tuning) - chromaOf(root)) % 12) + 12) % 12;
}

function feedback(prompt: D8Prompt, answer: D8Answer): DrillFeedback<D8Answer> {
  return { answer, result: d8Check(prompt, answer) };
}

describe('chord-tone item IDs', () => {
  it('formats, parses and round-trips both directions', () => {
    expect(chordToneItemId('chord-tone', 'b3', 'm7')).toBe('chord-tone:b3@m7');
    expect(chordToneItemId('chord-tone-name', '1', 'major')).toBe('chord-tone-name:1@major');
    expect(parseChordToneItemId('chord-tone:b7@7')).toEqual({
      kind: 'chord-tone',
      degree: 'b7',
      chord: '7',
    });
    for (const id of ['chord-tone:7@maj7', 'chord-tone-name:5@minor']) {
      expect(itemId(parseItemId(id)!)).toBe(id);
    }
  });

  it('rejects degrees the chord lacks and unknown kinds', () => {
    for (const id of [
      'chord-tone:3@minor',
      'chord-tone:b7@maj7',
      'chord-tone:3@m9',
      'chord-tone:R@major',
      'chord-tone:3',
      'chord-tones:3@major',
    ]) {
      expect(parseItemId(id), id).toBeNull();
    }
    expect(() => chordToneItemId('chord-tone', '3', 'minor')).toThrow(RangeError);
    expect(() => chordToneItemId('chord-tone', '3', 'm9' as ChordKind)).toThrow(RangeError);
  });
});

describe('voicings', () => {
  it('spells every degree of every shape by its interval from the root', () => {
    for (const kind of D8_KINDS) {
      const templates = templatesFor(kind);
      expect(templates.length, kind).toBeGreaterThanOrEqual(3);
      for (const t of templates) {
        for (const root of ['C', 'F#', 'Bb', 'E']) {
          const placed = placements(t, root, STANDARD_TUNING, D8_REGION.to);
          expect(placed.length, `${t.shape} ${kind} at ${root}`).toBeGreaterThan(0);
          for (const notes of placed) {
            for (const n of notes) {
              expect(semitonesAbove(root, n)).toBe(chordDegreeSemitones(n.degree) % 12);
              expect(n.fret).toBeGreaterThanOrEqual(0);
              expect(n.fret).toBeLessThanOrEqual(D8_REGION.to);
            }
            const frets = notes.map((n) => n.fret);
            expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(3);
            expect(new Set(notes.map((n) => n.string)).size).toBe(notes.length);
          }
        }
      }
    }
  });

  it('includes the open chords their shapes are named after', () => {
    const open = (kind: ChordKind, shape: string, root: string) => {
      const t = templatesFor(kind).find((x) => x.shape === shape)!;
      const notes = placements(t, root, STANDARD_TUNING, 15)[0]!;
      return [6, 5, 4, 3, 2, 1].map((s) => notes.find((n) => n.string === s)?.fret ?? 'x').join('');
    };
    expect(open('major', 'C', 'C')).toBe('x32010');
    expect(open('minor', 'A', 'A')).toBe('x02210');
    expect(open('7', 'E', 'E')).toBe('020100');
    expect(open('maj7', 'C', 'C')).toBe('x32000');
    expect(open('maj7', 'G', 'G')).toBe('320002');
    expect(open('m7', 'A', 'A')).toBe('x02010');
    expect(open('m7', 'D', 'D')).toBe('xx0211');
    // An E-shape barre: Fm7 at the first fret.
    expect(open('m7', 'E', 'F')).toBe('131111');
  });

  it('keeps each pitch in drop D, moving string 6 up two frets', () => {
    const t = templatesFor('major').find((x) => x.shape === 'E')!;
    const std = placements(t, 'G', STANDARD_TUNING, 15)[0]!;
    const drop = placements(t, 'G', DROP_D_TUNING, 15)[0]!;
    for (const [i, n] of drop.entries()) {
      expect(midiAt(n, DROP_D_TUNING)).toBe(midiAt(std[i]!, STANDARD_TUNING));
    }
    expect(drop.find((n) => n.string === 6)!.fret).toBe(5);
  });
});

describe('D8 prompts', () => {
  it('serves every chord-tone item of the C5 tone skills, and nothing else', () => {
    expect(ITEM_IDS).toHaveLength(24);
    for (const id of ITEM_IDS) expect(d8CanTest(item(id)), id).toBe(true);
    expect(d8CanTest(item('spell-chord:m7@B'))).toBe(false);
    expect(d8CanTest(item('chord-tone:b5@m7b5'))).toBe(false);
    expect(d8CanTest(item('chord-tone:3@add9'))).toBe(false);
  });

  it('draws a true shape for every item, scope and rng, with the asked degree in it', () => {
    const values = Array.from({ length: 12 }, (_, i) => i / 12 + 0.01);
    for (const id of ITEM_IDS) {
      for (const level of [0, 1, 2]) {
        for (const v of values) {
          const p = d8MakePrompt(item(id), ctx(seq(v, 1 - v, v / 2, 0.99 - v / 2), level));
          const ref = parseChordToneItemId(id)!;
          expect(p.mode).toBe(ref.kind === 'chord-tone' ? 'tap' : 'name');
          expect(p.kind).toBe(ref.chord);
          expect(d8Targets(p).length, id).toBeGreaterThan(0);
          for (const n of p.notes) {
            expect(semitonesAbove(p.root, n)).toBe(chordDegreeSemitones(n.degree) % 12);
            expect(chromaOf(n.name)).toBe(((midiAt(n) % 12) + 12) % 12);
            expect(n.fret).toBeGreaterThanOrEqual(D8_REGION.from);
            expect(n.fret).toBeLessThanOrEqual(D8_REGION.to);
          }
          if (p.mode === 'name') {
            expect(p.ringed?.degree).toBe(ref.degree);
            expect(p.choices).toContain(ref.degree);
          } else {
            expect(p.ringed).toBeNull();
            expect(p.choices).toEqual([]);
          }
          if (level === 0) expect(p.root).toMatch(/^[A-G]$/);
        }
      }
    }
  });

  it('roots on any pitch class at scope 1, and anywhere on the neck at scope 2', () => {
    const roots = new Set<string>();
    const lows = new Set<number>();
    for (let i = 0; i < 48; i++) {
      const v = (i + 0.5) / 48;
      roots.add(d8MakePrompt(item('chord-tone:3@major'), ctx(seq(0.5, v), 1)).root);
      // The E shape (fourth of five), at the last of its placements.
      lows.add(d8MakePrompt(item('chord-tone:3@major'), ctx(seq(0.7, v, 0.99), 2)).span.from);
    }
    expect(roots.size).toBe(12);
    expect(Math.max(...lows)).toBeGreaterThanOrEqual(12);
    expect(d8ScopeFor(-1)).toBe('naturals');
    expect(d8ScopeFor(9)).toBe('anywhere');
  });

  it('spells roots so the chord needs no double accidental', () => {
    expect(d8SpellRoot(3, 'major', 'sharp')).toBe('Eb');
    expect(d8SpellRoot(3, 'minor', 'sharp')).toBe('D#');
    expect(d8SpellRoot(6, 'minor', 'flat')).toBe('F#');
    expect(d8SpellRoot(10, '7', 'flat')).toBe('Bb');
  });

  it('names the shape as an open chord, a barre chord or a CAGED shape', () => {
    // The A shape (first of the three m7 shapes) at A: open Am7.
    const p = d8MakePrompt(item('chord-tone:b3@m7'), ctx(seq(0, 0.75)));
    expect(p.shape).toBe('A');
    expect(p.chord).toBe('Am7');
    expect(p.voicing).toBe('open');
    expect(d8VoicingLine({ ...p, voicing: 'open' })).toBe('Open chord, A shape');
    expect(d8VoicingLine({ ...p, voicing: 'barre', span: { from: 5, to: 7 } })).toBe(
      'A-shape barre at fret 5',
    );
    expect(d8VoicingLine({ ...p, voicing: 'shape', span: { from: 8, to: 10 } })).toBe(
      'A shape, frets 8–10',
    );
    // Open C: the C shape at C rings three open strings.
    const c = d8MakePrompt(item('chord-tone:3@major'), ctx(seq(0, 0)));
    expect(c.chord).toBe('C');
    expect(c.voicing).toBe('open');
    const f = d8MakePrompt(item('chord-tone:3@major'), ctx(seq(0.7, 0.5)));
    expect(f.shape).toBe('E');
    expect(f.voicing).toBe('barre');
  });

  it('refuses items it cannot test and tunings without six strings', () => {
    expect(() => d8MakePrompt(item('spell-chord:m7@B'), ctx(seq(0)))).toThrow(/cannot test/);
    const sevenString = { id: '7', name: '7-string', notes: ['B1', ...STANDARD_TUNING.notes] };
    expect(() => d8MakePrompt(item('chord-tone:3@major'), ctx(seq(0), 0, sevenString))).toThrow();
  });
});

describe('D8 choices and labels', () => {
  it('offers both 3rds for triads and both 7ths for seventh chords', () => {
    expect(d8Choices('major')).toEqual(['1', 'b3', '3', '5']);
    expect(d8Choices('minor')).toEqual(['1', 'b3', '3', '5']);
    expect(d8Choices('maj7')).toEqual(['1', 'b3', '3', '5', 'b7', '7']);
    expect(d8Choices('m7')).toEqual(['1', 'b3', '3', '5', 'b7', '7']);
  });

  it('labels degrees for buttons, prose and screen readers', () => {
    const all: ChordDegree[] = ['1', 'b3', '3', '5', 'b7', '7'];
    expect(all.map(d8DegreeLabel)).toEqual(['R', '♭3', '3', '5', '♭7', '7']);
    expect(all.map(d8DegreeName)).toEqual(['root', '♭3rd', '3rd', '5th', '♭7th', '7th']);
    expect(d8DegreeSpoken('b7')).toBe('flat 7th');
    expect(d8Display('F#m7')).toBe('F♯m7');
    expect(d8Display('Bbmaj7')).toBe('B♭maj7');
    expect(d8Display('Eb')).toBe('E♭');
  });

  it('maps the number row onto the buttons by position', () => {
    const choices = d8Choices('7');
    expect(d8KeyFor(0)).toBe('1');
    expect(d8KeyToAnswer('2', choices)).toBe('b3');
    expect(d8KeyToAnswer('6', choices)).toBe('7');
    expect(d8KeyToAnswer('6', d8Choices('major'))).toBeNull();
    expect(d8KeyToAnswer('x', choices)).toBeNull();
  });

  it('draws each degree with its own marker shape', () => {
    expect(['1', '3', 'b3', '5', 'b7', '7'].map((d) => d8DegreeStyle(d as ChordDegree))).toEqual([
      'root',
      'third',
      'third',
      'fifth',
      'seventh',
      'seventh',
    ]);
  });
});

describe('D8 grading', () => {
  const tapPrompt = () => d8MakePrompt(item('chord-tone:b3@m7'), ctx(seq(0.5, 0.6)));
  const namePrompt = () => d8MakePrompt(item('chord-tone-name:b7@7'), ctx(seq(0.5, 0.6, 0)));

  it('accepts a tap on any note of the asked degree', () => {
    const p = tapPrompt();
    for (const t of d8Targets(p)) expect(d8Check(p, t).correct).toBe(true);
    expect(d8Expected(p)).toMatch(/^the ♭3rd of [A-G]m7, [A-G]/);
  });

  it('logs a tapped degree as a confusion keyed by interval', () => {
    const p = tapPrompt();
    const fifth = p.notes.find((n) => n.degree === '5')!;
    expect(d8Check(p, fifth)).toMatchObject({
      correct: false,
      concept: 'm3',
      confusedWith: 'P5',
    });
    expect(d8ConceptOf(item('chord-tone:3@major'))).toBe('M3');
    expect(d8ConceptOf(item('chord-tone-name:7@maj7'))).toBe('M7');
    expect(d8ConceptOf(item('note@s6f5'))).toBeNull();
  });

  it('marks a tap off the shape wrong, with no confusion', () => {
    const p = tapPrompt();
    const off = { string: 1, fret: p.span.to + 2 };
    expect(d8NoteAt(p, off)).toBeUndefined();
    const result = d8Check(p, off);
    expect(result.correct).toBe(false);
    expect(result.confusedWith).toBeUndefined();
    expect(d8Explain(p, feedback(p, off))).toMatch(
      new RegExp(`fret ${off.fret} isn't in the shape`),
    );
  });

  it('grades a named degree, pairing ♭7 with 7', () => {
    const p = namePrompt();
    expect(d8Check(p, 'b7').correct).toBe(true);
    expect(d8Check(p, '7')).toMatchObject({ correct: false, concept: 'm7', confusedWith: 'M7' });
    expect(d8Explain(p, feedback(p, '7'))).toMatch(/the ♭7th, not the 7th/);
    expect(d8Explain(p, feedback(p, 'b7'))).toMatch(/^Yes: [A-G]7 here is R /);
  });

  it('describes answers for the review log', () => {
    expect(d8DescribeAnswer({ string: 3, fret: 5 })).toBe('s3f5');
    expect(d8DescribeAnswer('b3')).toBe('b3');
  });

  it('explains a wrong degree tapped in the shape', () => {
    const p = tapPrompt();
    const root = p.notes.find((n) => n.degree === '1')!;
    expect(d8Explain(p, feedback(p, root))).toMatch(/^You tapped the root, /);
  });

  it('sounds the chord, then the answer note, and the wrong note after it', () => {
    const p = tapPrompt();
    const target = d8Targets(p)[0]!;
    const right = d8Sounds(p, feedback(p, target));
    expect(right.expected).toHaveLength(p.notes.length + 1);
    expect(right.given).toBeUndefined();
    const root = p.notes.find((n) => n.degree === '1')!;
    const wrong = d8Sounds(p, feedback(p, root));
    expect(wrong.given).toHaveLength(1);
    const named = namePrompt();
    expect(d8Sounds(named, feedback(named, '7')).given).toBeUndefined();
  });

  it('marks the answer notes and a wrong tap on the neck', () => {
    const p = tapPrompt();
    const root = p.notes.find((n) => n.degree === '1')!;
    const pos = d8FeedbackPositions(p, feedback(p, root));
    expect(pos.expected).toEqual(d8Targets(p));
    expect(pos.given).toEqual([root]);
    const named = namePrompt();
    expect(d8FeedbackPositions(named, feedback(named, 'b7'))).toEqual({
      expected: [named.ringed],
      given: [],
    });
  });

  it('reads the shape low string first', () => {
    const p = d8MakePrompt(item('chord-tone:b3@m7'), ctx(seq(0, 0.75)));
    // Am7, A shape: x02010.
    expect(p.chord).toBe('Am7');
    expect(d8DegreeLine(p.notes)).toBe('R 5 ♭7 ♭3 5');
  });
});

describe('D8 guides and windows', () => {
  it('shows root squares from guide level 2, never when the root is the answer', () => {
    const third = d8MakePrompt(item('chord-tone:3@major'), ctx(seq(0)));
    const root = d8MakePrompt(item('chord-tone:1@major'), ctx(seq(0)));
    const nameRoot = d8MakePrompt(item('chord-tone-name:1@major'), ctx(seq(0)));
    expect(d8ShowsRoots(third, 2, false)).toBe(true);
    expect(d8ShowsRoots(third, 1, false)).toBe(false);
    expect(d8ShowsRoots(third, 0, true)).toBe(true);
    expect(d8ShowsRoots(root, 3, true)).toBe(false);
    expect(d8ShowsRoots(nameRoot, 3, false)).toBe(false);
    expect(d8ShowsRoots(nameRoot, 0, true)).toBe(false);
  });

  it('shows the whole neck on iPad landscape, and frames the shape elsewhere', () => {
    const p = d8MakePrompt(item('chord-tone:3@major'), ctx(seq(0)));
    expect(d8Window(p, 'regular-wide', 5)).toEqual(D8_REGION);
    expect(d8Window({ ...p, span: { from: 2, to: 5 } }, 'regular', 5)).toEqual({ from: 0, to: 12 });
    expect(d8Window({ ...p, span: { from: 11, to: 14 } }, 'regular', 5)).toEqual({
      from: 3,
      to: 15,
    });
    for (const span of [
      { from: 0, to: 3 },
      { from: 6, to: 8 },
      { from: 12, to: 15 },
    ]) {
      const w = d8Window({ ...p, span }, 'compact', 5);
      expect(w.to - w.from + 1).toBe(5);
      expect(w.from).toBeLessThanOrEqual(span.from);
      expect(w.to).toBeGreaterThanOrEqual(span.to);
      expect(w.from).toBeGreaterThanOrEqual(0);
      expect(w.to).toBeLessThanOrEqual(15);
    }
    expect(d8Window({ ...p, span: { from: 4, to: 6 } }, 'compact', 8)).toEqual({ from: 2, to: 9 });
  });
});
