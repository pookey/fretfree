import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import {
  buildChordItemId,
  itemId,
  parseBuildChordItemId,
  parseItemId,
  type Item,
} from '../../engine/model';
import { SKILLS } from '../../engine/skills';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  NATURAL_PCS,
  chromaOf,
  midiAt,
  noteAt,
  type ChordKind,
  type Position,
} from '../../theory';
import type { DrillContext, DrillFeedback } from '../types';
import {
  D38_SCOPES,
  d38CanTest,
  d38Check,
  d38Concept,
  d38ConceptOf,
  d38DegreeLabel,
  d38DegreeName,
  d38DegreeSpoken,
  d38DegreeStyle,
  d38DescribeAnswer,
  d38Display,
  d38Example,
  d38Expected,
  d38Explain,
  d38FeedbackPositions,
  d38Fingers,
  d38GradedResponseMs,
  d38IsLive,
  d38MakePrompt,
  d38Placed,
  d38PromptAt,
  d38RegularWindow,
  d38ScopeFor,
  d38ShowsFormula,
  d38ShowsNotes,
  d38Sounds,
  d38Span,
  d38Tab,
  d38Tap,
  d38Verdict,
  d38Window,
  type D38Answer,
  type D38Prompt,
} from './logic';

const ctx = (over: Partial<DrillContext> = {}): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel: 0,
  rng: () => 0,
  ...over,
});

const item = (kind: ChordKind, string: number): Item => ({
  id: buildChordItemId(kind, string),
  skillId: 'C5.build-triads',
});

/** A prompt on a fixed root, as `x02010` charts write frets low string first. */
function at(kind: ChordKind, root: string, string: number, fret: number, tuning = STANDARD_TUNING) {
  return d38PromptAt(
    buildChordItemId(kind, string),
    kind,
    root,
    { string, fret },
    'naturals',
    tuning,
    'sharp',
  );
}

/** Taps from a chart: `tab(p, 'x02010')` places every fret above the root's string. */
function tab(prompt: D38Prompt, chart: string): Position[] {
  const frets = chart.length === 6 ? [...chart] : chart.split(' ');
  return frets.flatMap((f, i) => {
    const string = 6 - i;
    if (f === 'x' || !prompt.strings.includes(string)) return [];
    return [{ string, fret: Number(f) }];
  });
}

const fb = (prompt: D38Prompt, answer: D38Answer): DrillFeedback<D38Answer> => ({
  answer,
  result: d38Check(prompt, answer),
});

describe('build-chord item IDs', () => {
  it('round-trips the canonical form', () => {
    expect(buildChordItemId('m7', 5)).toBe('build-chord:m7@s5');
    expect(parseBuildChordItemId('build-chord:m7b5@s4')).toEqual({ chord: 'm7b5', string: 4 });
    expect(parseItemId('build-chord:sus2@s6')).toEqual({
      kind: 'build-chord',
      chord: 'sus2',
      string: 6,
    });
    expect(itemId({ kind: 'build-chord', chord: 'major', string: 6 })).toBe('build-chord:major@s6');
  });

  it('rejects anything else', () => {
    for (const id of ['build-chord:m9@s5', 'build-chord:m7@s05', 'build-chord:m7@s0', 'm7@s5']) {
      expect(parseBuildChordItemId(id), id).toBeNull();
    }
    expect(() => buildChordItemId('nope' as ChordKind, 5)).toThrow(RangeError);
    expect(() => buildChordItemId('m7', 0)).toThrow(RangeError);
    expect(() => buildChordItemId('m7', 1.5)).toThrow(RangeError);
  });

  it('tests build-chord items with a string above the root', () => {
    expect(d38CanTest(item('m7', 5))).toBe(true);
    expect(d38CanTest({ id: 'build-chord:m7@s1', skillId: 'x' })).toBe(false);
    expect(d38CanTest({ id: 'chord-tone:b3@m7', skillId: 'x' })).toBe(false);
  });
});

describe('the C5 build skills', () => {
  const ids = (skillId: string) =>
    SKILLS.find((s) => s.id === skillId)!
      .items()
      .map((i) => i.id);

  it('mirrors D36: triads, then sevenths, then sus, root string 6 first', () => {
    expect(ids('C5.build-triads')).toEqual([
      'build-chord:major@s6',
      'build-chord:minor@s6',
      'build-chord:major@s5',
      'build-chord:minor@s5',
      'build-chord:major@s4',
      'build-chord:minor@s4',
    ]);
    expect(ids('C5.build-sevenths').slice(0, 4)).toEqual([
      'build-chord:7@s6',
      'build-chord:maj7@s6',
      'build-chord:m7@s6',
      'build-chord:m7b5@s6',
    ]);
    expect(ids('C5.build-sevenths')).toHaveLength(12);
    expect(ids('C5.build-sus')).toHaveLength(6);
  });

  it('gates each stage on finding the tones in a shape (rule 7)', () => {
    const skill = (id: string) => SKILLS.find((s) => s.id === id)!;
    expect(skill('C5.build-triads').prerequisites).toEqual(['C5.tones-fifths']);
    expect(skill('C5.build-sevenths').prerequisites).toContain('C5.tones-sevenths');
    expect(skill('C5.build-sus').prerequisites).toContain('C5.sus-add');
    expect(ENGINE_CONFIG.placement.skipSkills).toEqual(
      expect.arrayContaining(['C5.build-triads', 'C5.build-sevenths', 'C5.build-sus']),
    );
  });
});

describe('d38MakePrompt', () => {
  const all = SKILLS.filter((s) => s.drillTypes.includes('build-the-chord')).flatMap((s) =>
    s.items(),
  );

  it('places every item at every scope, with a voicing that works', () => {
    expect(all.length).toBeGreaterThan(0);
    for (const it of all) {
      for (let level = 0; level < D38_SCOPES.length; level++) {
        for (const r of [0, 0.37, 0.71, 0.999]) {
          const p = d38MakePrompt(it, ctx({ scopeLevel: level, rng: () => r }));
          const ref = parseBuildChordItemId(it.id)!;
          expect(p.anchor.string).toBe(ref.string);
          expect(p.strings).toEqual(
            Array.from({ length: ref.string - 1 }, (_, i) => ref.string - 1 - i),
          );
          expect(midiAt(p.anchor) % 12).toBe(chromaOf(p.root));
          expect(d38Verdict(p, p.example).correct, `${it.id} ${p.chord}`).toBe(true);
          expect(p.scope).toBe(D38_SCOPES[level]);
        }
      }
    }
  });

  it('roots on natural notes at their lowest fret at scope 0', () => {
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
      const p = d38MakePrompt(item('major', 5), ctx({ rng: () => r }));
      expect(NATURAL_PCS).toContain(p.root);
      expect(p.anchor.fret).toBeLessThan(12);
    }
    // rng 0 picks C first: C on string 5 is fret 3, the open C chord.
    const c = d38MakePrompt(item('major', 5), ctx());
    expect(c).toMatchObject({ root: 'C', chord: 'C', anchor: { string: 5, fret: 3 } });
    expect(d38Tab(c, c.example)).toBe('x 3 2 0 1 0');
  });

  it('reaches every root and both octaves at the top scope', () => {
    const roots = new Set<string>();
    let high = false;
    for (let i = 0; i < 40; i++) {
      const p = d38MakePrompt(item('m7', 6), ctx({ scopeLevel: 2, rng: () => i / 40 }));
      roots.add(p.root);
      if (p.anchor.fret >= 12) high = true;
    }
    expect(roots.size).toBe(12);
    expect(high).toBe(true);
  });

  it('spells the root per the preference unless the chord needs a double accidental', () => {
    const flat = d38MakePrompt(item('major', 6), ctx({ scopeLevel: 1, accidentalPref: 'flat' }));
    expect(flat.root).toBe('C');
    const roots = new Set(
      Array.from(
        { length: 12 },
        (_, i) =>
          d38MakePrompt(
            item('m7b5', 5),
            ctx({ scopeLevel: 1, accidentalPref: 'flat', rng: () => i / 12 }),
          ).root,
      ),
    );
    // E♭m7♭5 needs B𝄫, so it is spelled D♯m7♭5.
    expect(roots).toContain('D#');
    expect(roots).not.toContain('Eb');
  });

  it('builds in drop D, and refuses a root string the tuning lacks', () => {
    const d = d38MakePrompt(item('major', 6), ctx({ tuning: DROP_D_TUNING, rng: () => 0.2 }));
    expect(noteAt(d.anchor, DROP_D_TUNING).pc).toBe(d.root);
    expect(d38Verdict(d, d.example).correct).toBe(true);
    expect(() => d38MakePrompt({ id: 'build-chord:major@s7', skillId: 'x' }, ctx())).toThrow();
    expect(() => d38MakePrompt({ id: 'chord-tone:b3@m7', skillId: 'x' }, ctx())).toThrow();
  });

  it('picks the scope from the level, clamped', () => {
    expect(d38ScopeFor(-1)).toBe('naturals');
    expect(d38ScopeFor(1)).toBe('all-roots');
    expect(d38ScopeFor(9)).toBe('anywhere');
  });
});

describe('voicing validation', () => {
  const am7 = at('m7', 'A', 5, 0);

  it('accepts the open Am7, and names every degree', () => {
    const v = d38Verdict(am7, tab(am7, 'x02010'));
    expect(v.correct).toBe(true);
    expect(v.notes.map((n) => n.degree)).toEqual(['1', '5', 'b7', 'b3', '5']);
    expect(v.notes.map((n) => n.name)).toEqual(['A', 'E', 'G', 'C', 'E']);
    expect(d38Check(am7, tab(am7, 'x02010'))).toEqual({
      correct: true,
      expected: 'Am7 (A C E G)',
      concept: 'chord:m7',
    });
  });

  it('accepts any voicing with the tones: muted strings, other positions, no 5th', () => {
    expect(d38Verdict(am7, tab(am7, 'x0201x')).correct).toBe(true);
    // A barre-style Am7 from the open root: x 0 5 5 5 3? Too wide (3–5 is 3 frets, fine).
    expect(d38Verdict(am7, tab(am7, 'x0x553')).correct).toBe(true);
    // The 5th of a four-note chord may go: A G C.
    expect(d38Verdict(am7, tab(am7, 'x0x01x')).correct).toBe(true);
  });

  it('flags missing tones, and notes the chord lacks by their degree', () => {
    const v = d38Verdict(am7, tab(am7, 'x02000'));
    expect(v.correct).toBe(false);
    expect(v.missing.map((t) => t.degree)).toEqual(['b3']);
    expect(v.extras).toEqual([
      expect.objectContaining({ string: 2, fret: 0, degree: '2', inChord: false, name: 'B' }),
    ]);
    // A triad must sound all three: A and C♯ alone lack the 5th.
    const a = at('major', 'A', 5, 0);
    expect(d38Verdict(a, tab(a, 'x0xx2x')).missing.map((t) => t.degree)).toEqual(['5']);
  });

  it('rejects a voicing wider than the span', () => {
    const f = at('major', 'F', 6, 1);
    const v = d38Verdict(f, tab(f, '1 x 3 2 1 5'));
    expect(v).toMatchObject({ span: 5, tooWide: true, correct: false });
  });

  it('rejects a voicing that needs more fingers than a hand has', () => {
    const g = at('major', 'G', 6, 3);
    const v = d38Verdict(g, tab(g, '3 2 5 4 3 3'));
    expect(v).toMatchObject({ span: 4, tooWide: false, fingers: 6, tooManyFingers: true });
  });

  it('counts a barre on the lowest fret as one finger, unless an open string breaks it', () => {
    const fMaj = [6, 5, 4, 3, 2, 1].map((string, i) => ({ string, fret: [1, 3, 3, 2, 1, 1][i]! }));
    expect(d38Fingers(fMaj)).toBe(4);
    const broken = [
      { string: 6, fret: 1 },
      { string: 3, fret: 0 },
      { string: 1, fret: 1 },
      { string: 4, fret: 2 },
    ];
    expect(d38Fingers(broken)).toBe(3);
    expect(d38Fingers([{ string: 1, fret: 0 }])).toBe(0);
    expect(d38Span([{ string: 1, fret: 0 }])).toBe(0);
  });

  it('logs building the confusable chord as that confusion (rule 6)', () => {
    const amaj7 = at('maj7', 'A', 5, 0);
    // x02020 is A7: the ♭7 (G) where Amaj7 has the 7 (G♯).
    expect(d38Check(amaj7, tab(amaj7, 'x02020'))).toEqual({
      correct: false,
      expected: 'Amaj7 (A C♯ E G♯)',
      concept: 'chord:maj7',
      confusedWith: 'chord:7',
    });
    const a = at('major', 'A', 5, 0);
    expect(d38Check(a, tab(a, 'x02210')).confusedWith).toBe('triad:min');
    // Wrong, but no other chord: no confusion.
    expect(d38Check(am7, tab(am7, 'x02000')).confusedWith).toBeUndefined();
  });
});

describe('tapping', () => {
  const am7 = at('m7', 'A', 5, 0);

  it('places one note per string above the root, and a second tap mutes it', () => {
    let taps = d38Tap(am7, [], { string: 4, fret: 2 });
    taps = d38Tap(am7, taps, { string: 2, fret: 1 });
    expect(taps).toEqual([
      { string: 4, fret: 2 },
      { string: 2, fret: 1 },
    ]);
    taps = d38Tap(am7, taps, { string: 4, fret: 3 });
    expect(taps).toContainEqual({ string: 4, fret: 3 });
    expect(taps).not.toContainEqual({ string: 4, fret: 2 });
    taps = d38Tap(am7, taps, { string: 4, fret: 3 });
    expect(taps).toEqual([{ string: 2, fret: 1 }]);
  });

  it('ignores the root string, the strings below it, and frets off the neck', () => {
    expect(d38IsLive(am7, { string: 6, fret: 0 })).toBe(false);
    expect(d38IsLive(am7, { string: 5, fret: 2 })).toBe(false);
    expect(d38IsLive(am7, { string: 1, fret: 16 })).toBe(false);
    expect(d38Tap(am7, [{ string: 3, fret: 0 }], { string: 6, fret: 3 })).toEqual([
      { string: 3, fret: 0 },
    ]);
  });

  it('counts the last tap on each string', () => {
    expect(
      d38Placed(am7, [
        { string: 2, fret: 1 },
        { string: 6, fret: 0 },
        { string: 2, fret: 3 },
      ]),
    ).toEqual([{ string: 2, fret: 3 }]);
  });
});

describe('feedback', () => {
  const am7 = at('m7', 'A', 5, 0);

  it('shows the closest voicing that works, or the learner’s own when right', () => {
    const near = d38Example(am7, tab(am7, 'x02000'));
    expect(d38Verdict(am7, near).correct).toBe(true);
    expect(near).toEqual(
      expect.arrayContaining([
        { string: 4, fret: 2 },
        { string: 3, fret: 0 },
      ]),
    );
    const own = tab(am7, 'x0x01x');
    expect(d38Example(am7, own)).toEqual(d38Placed(am7, own));
    expect(d38Tab(am7, d38Example(am7))).toBe('x 0 2 0 1 0');
  });

  it('explains a right answer by degree', () => {
    expect(d38Explain(am7, fb(am7, tab(am7, 'x02010')))).toEqual([
      "Yes: that's Am7, R 5 ♭7 ♭3 5 from string 5 (x 0 2 0 1 0).",
    ]);
  });

  it('explains what is missing, what is extra and what is out of reach', () => {
    expect(d38Explain(am7, fb(am7, tab(am7, 'x02000')))).toEqual([
      'You built R 5 ♭7 2 5 from string 5 (x 0 2 0 0 0).',
      'Missing the ♭3rd (C).',
      'B on string 2 is the 2nd: not in Am7.',
      'One that works: x 0 2 0 1 0.',
    ]);
    const f = at('major', 'F', 6, 1);
    const lines = d38Explain(f, fb(f, tab(f, '1 x 3 2 1 5')));
    expect(lines).toContain('It spans 5 frets: keep it within 4.');
    const g = at('major', 'G', 6, 3);
    expect(d38Explain(g, fb(g, tab(g, '3 2 5 4 3 3')))).toContain(
      'It needs 6 fingers: keep it to 4.',
    );
    const empty = d38Explain(am7, fb(am7, []));
    expect(empty[0]).toBe('You built R from string 5 (x 0 x x x x).');
    expect(empty[1]).toBe('Missing the ♭3rd (C) and the ♭7th (G).');
  });

  it('names the deciding tone of a confusion', () => {
    const amaj7 = at('maj7', 'A', 5, 0);
    expect(d38Explain(amaj7, fb(amaj7, tab(amaj7, 'x02020')))[1]).toBe(
      "That's A7: Amaj7 has the 7th (G♯) where A7 has the ♭7th (G).",
    );
    // A G C E is Am7: m7 and m7♭5 differ in their 5ths.
    const am7b5 = at('m7b5', 'A', 5, 0);
    expect(d38Explain(am7b5, fb(am7b5, tab(am7b5, 'x0x010')))[1]).toBe(
      "That's Am7: Am7♭5 has the ♭5th (E♭) where Am7 has the 5th (E).",
    );
  });

  it('plays the voicing, and a voicing that works before a wrong one', () => {
    const right = d38Sounds(am7, fb(am7, tab(am7, 'x02010')));
    expect(right).toEqual({ expected: ['A2', 'E3', 'G3', 'C4', 'E4'] });
    const wrong = d38Sounds(am7, fb(am7, tab(am7, 'x02000')));
    expect(wrong.given).toEqual(['A2', 'E3', 'G3', 'B3', 'E4']);
    expect(wrong.expected).toEqual(['A2', 'E3', 'G3', 'C4', 'E4']);
  });

  it('marks the voicing that works and the notes the chord lacks', () => {
    const pos = d38FeedbackPositions(am7, fb(am7, tab(am7, 'x02000')));
    expect(pos.expected).toContainEqual({ string: 5, fret: 0 });
    expect(pos.expected).toContainEqual({ string: 2, fret: 1 });
    expect(pos.given).toEqual([{ string: 2, fret: 0 }]);
  });

  it('logs, grades and keys the answer', () => {
    expect(d38DescribeAnswer(tab(am7, 'x02010'))).toBe('s4f2 s3f0 s2f1 s1f0');
    expect(d38DescribeAnswer([])).toBe('none');
    expect(d38GradedResponseMs(am7, [], 8000)).toBe(2000);
    expect(d38ConceptOf(item('major', 5))).toBe('triad:maj');
    expect(d38ConceptOf(item('minor', 5))).toBe('triad:min');
    expect(d38ConceptOf({ id: 'note@s6f0', skillId: 'x' })).toBeNull();
    expect(d38Concept('m7b5')).toBe('chord:m7b5');
    expect(d38Expected(at('m7b5', 'F#', 6, 2))).toBe('F♯m7♭5 (F♯ A C E)');
  });
});

describe('text and guides', () => {
  it('labels and names degrees', () => {
    expect(['1', 'b3', '#5', '9'].map(d38DegreeLabel)).toEqual(['R', '♭3', '♯5', '9']);
    expect(['1', 'b3', '2', '#5', 'b7'].map(d38DegreeName)).toEqual([
      'the root',
      'the ♭3rd',
      'the 2nd',
      'the ♯5th',
      'the ♭7th',
    ]);
    expect(['1', 'b3', '#5'].map(d38DegreeSpoken)).toEqual(['root', 'flat 3rd', 'sharp 5th']);
    expect(d38Display('Bbm7b5')).toBe('B♭m7♭5');
    expect(['1', '3', 'b5', '7', '9'].map(d38DegreeStyle)).toEqual([
      'root',
      'third',
      'fifth',
      'seventh',
      'third',
    ]);
  });

  it('fades the formula, then the notes (rule 9)', () => {
    expect(d38ShowsFormula(1, false)).toBe(false);
    expect(d38ShowsFormula(2, false)).toBe(true);
    expect(d38ShowsFormula(0, true)).toBe(true);
    expect(d38ShowsNotes(2, false)).toBe(false);
    expect(d38ShowsNotes(3, false)).toBe(true);
    expect(d38ShowsNotes(0, true)).toBe(true);
  });

  it('writes high frets in the chart', () => {
    const p = at('m7', 'C', 5, 15);
    expect(d38Tab(p, [{ string: 4, fret: 13 }])).toBe('x 15 13 x x x');
  });
});

describe('windows', () => {
  it('centres the compact window on the root, wide enough either side', () => {
    expect(d38Window(at('m7', 'A', 5, 0), 5)).toEqual({ from: 0, to: 6 });
    expect(d38Window(at('m7', 'D', 5, 5), 5)).toEqual({ from: 2, to: 8 });
    expect(d38Window(at('m7', 'C', 5, 15), 9)).toEqual({ from: 7, to: 15 });
    // Widened to draw an open string in a worked example or feedback.
    expect(d38Window(at('m7', 'D', 5, 5), 5, [{ string: 1, fret: 0 }])).toEqual({ from: 0, to: 8 });
  });

  it('slides the 12-fret neck up for a high root', () => {
    expect(d38RegularWindow(at('m7', 'A', 5, 0))).toEqual({ from: 0, to: 12 });
    expect(d38RegularWindow(at('m7', 'A', 5, 12))).toEqual({ from: 3, to: 15 });
  });
});
