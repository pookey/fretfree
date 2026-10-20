import { describe, expect, it } from 'vitest';
import { SEED_CONFUSIONS } from '../../engine/confusions';
import {
  chordNameItemId,
  itemId,
  parseChordNameItemId,
  parseItemId,
  type Item,
} from '../../engine/model';
import { getSkill } from '../../engine/skills';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  chromaOf,
  midiAt,
  type CagedShapeName,
  type ChordKind,
  type Position,
} from '../../theory';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { D36View } from './D36View';
import nameTheChord from './drill';
import {
  D36_QUALITIES,
  D36_REGION,
  d36CanTest,
  d36ChordName,
  d36Check,
  d36Concept,
  d36ConceptOf,
  d36Deciding,
  d36DegreeLabel,
  d36DegreeStyle,
  d36DescribeAnswer,
  d36Display,
  d36Explain,
  d36GradedResponseMs,
  d36KeyToQuality,
  d36KeyToRoot,
  d36MakePrompt,
  d36QualityKeyFor,
  d36QualityLabel,
  d36QualityName,
  d36RootLine,
  d36SameNotes,
  d36ScopeFor,
  d36Sharpen,
  d36Sounds,
  d36SpellRoot,
  d36VoicingLine,
  d36Window,
  type D36Answer,
  type D36Prompt,
} from './logic';

const SKILL_IDS = ['C5.name-triads', 'C5.name-sevenths', 'C5.name-sus'];
const ITEM_IDS = SKILL_IDS.flatMap((id) =>
  getSkill(id)!
    .items()
    .map((i) => i.id),
);

const item = (id: string): Item => ({ id, skillId: 'C5.name-triads' });

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

/** Naturals scope: 0.75 roots on A (C D E F G A B); the second value picks the display. */
const prompt = (id: string, rng = seq(0.75, 0.9), scopeLevel = 0) =>
  d36MakePrompt(item(id), ctx(rng, scopeLevel));

/** Chord-book notation, low string first: `x02010`. */
function grip(p: D36Prompt): string {
  return [6, 5, 4, 3, 2, 1].map((s) => p.notes.find((n) => n.string === s)?.fret ?? 'x').join('');
}

function semitonesAbove(root: string, pos: Position, tuning = STANDARD_TUNING): number {
  return (((midiAt(pos, tuning) - chromaOf(root)) % 12) + 12) % 12;
}

const fb = (p: D36Prompt, answer: D36Answer): DrillFeedback<D36Answer> => ({
  answer,
  result: d36Check(p, answer),
});

describe('chord-name item IDs', () => {
  it('formats, parses and round-trips', () => {
    expect(chordNameItemId('A', 'm7')).toBe('chord-name:A-shape@m7');
    expect(parseChordNameItemId('chord-name:E-shape@m7b5')).toEqual({ shape: 'E', chord: 'm7b5' });
    for (const id of ['chord-name:C-shape@major', 'chord-name:D-shape@sus2']) {
      expect(parseItemId(id)).toEqual({ kind: 'chord-name', ...parseChordNameItemId(id)! });
      expect(itemId(parseItemId(id)!)).toBe(id);
    }
  });

  it('rejects unknown shapes and kinds', () => {
    for (const id of [
      'chord-name:X-shape@major',
      'chord-name:A-shape@m9',
      'chord-name:A@major',
      'chord-names:A-shape@major',
    ]) {
      expect(parseItemId(id), id).toBeNull();
    }
    expect(() => chordNameItemId('X' as CagedShapeName, 'major')).toThrow(RangeError);
    expect(() => chordNameItemId('A', 'm9' as ChordKind)).toThrow(RangeError);
  });
});

describe('C5 naming skills', () => {
  it('brings in each shape’s confusable qualities side by side, barre families first', () => {
    expect(
      getSkill('C5.name-triads')!
        .items()
        .map((i) => i.id),
    ).toEqual(
      ['E', 'A', 'D', 'C', 'G'].flatMap((s) => [
        `chord-name:${s}-shape@major`,
        `chord-name:${s}-shape@minor`,
      ]),
    );
    expect(
      getSkill('C5.name-sevenths')!
        .items()
        .map((i) => i.id)
        .slice(0, 4),
    ).toEqual([
      'chord-name:E-shape@7',
      'chord-name:E-shape@maj7',
      'chord-name:E-shape@m7',
      'chord-name:E-shape@m7b5',
    ]);
    expect(getSkill('C5.name-sevenths')!.items()).toHaveLength(16);
    expect(
      getSkill('C5.name-sus')!
        .items()
        .map((i) => i.id),
    ).toEqual([
      'chord-name:E-shape@sus4',
      'chord-name:A-shape@sus4',
      'chord-name:A-shape@sus2',
      'chord-name:D-shape@sus4',
      'chord-name:D-shape@sus2',
    ]);
  });

  it('gates each stage on finding the tones and spelling the chords (rule 7)', () => {
    expect(getSkill('C5.name-triads')!.prerequisites).toEqual(['C5.tones-thirds']);
    expect(getSkill('C5.name-sevenths')!.prerequisites).toContain('C5.tones-sevenths');
    expect(getSkill('C5.name-sus')!.prerequisites).toContain('C5.sus-add');
    for (const id of SKILL_IDS) {
      expect(getSkill(id)!.topic).toBe('C5');
      expect(getSkill(id)!.skipPlacement).toBe(true);
    }
  });
});

describe('the D36 plugin', () => {
  it('is registered, serves the naming skills and loads its view lazily', async () => {
    expect(getDrill('name-the-chord')).toBe(nameTheChord);
    expect(nameTheChord.skills).toEqual(SKILL_IDS);
    expect(await resolveView(nameTheChord.render)).toBe(D36View);
    expect(nameTheChord.contextPanel).toBeUndefined();
  });

  it('serves every naming item, and nothing else', () => {
    expect(ITEM_IDS).toHaveLength(31);
    for (const id of ITEM_IDS) expect(d36CanTest(item(id)), id).toBe(true);
    expect(d36CanTest(item('chord-name:G-shape@m7'))).toBe(false);
    expect(d36CanTest(item('chord-name:A-shape@dim7'))).toBe(false);
    expect(d36CanTest(item('chord-tone:3@major'))).toBe(false);
    expect(() => prompt('chord-name:G-shape@m7')).toThrow(/cannot test/);
    expect(() =>
      d36MakePrompt(item('chord-name:A-shape@major'), {
        ...ctx(seq(0)),
        tuning: { id: 'seven', name: 'Seven', notes: ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
      }),
    ).toThrow(/cannot test/);
  });
});

describe('D36 prompts', () => {
  it('draws the open chords at natural roots', () => {
    const am7 = prompt('chord-name:A-shape@m7');
    expect(am7).toMatchObject({ root: 'A', chord: 'Am7', kind: 'm7', voicing: 'open' });
    expect(grip(am7)).toBe('x02010');
    expect(am7.display).toBe('neck');
    expect(am7.notes.map((n) => n.name)).toEqual(['A', 'E', 'G', 'C', 'E']);
    expect(am7.roots).toEqual(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
    // 0.0: root C, then the chart view.
    const c = prompt('chord-name:C-shape@major', seq(0, 0.1));
    expect(grip(c)).toBe('x32010');
    expect(c.display).toBe('diagram');
  });

  it('places barre chords and moved shapes, and names their voicing', () => {
    const f = prompt('chord-name:E-shape@m7', seq(3 / 7 + 0.01, 0.9));
    expect(f.root).toBe('F');
    expect(grip(f)).toBe('131111');
    expect(d36VoicingLine(f)).toBe('E-shape barre at fret 1');
    const g = prompt('chord-name:D-shape@major', seq(4 / 7 + 0.01, 0.9));
    expect(d36VoicingLine(g)).toBe('D shape, frets 5–8');
    expect(d36VoicingLine(prompt('chord-name:A-shape@minor'))).toBe('Open chord, A shape');
    expect(f.barre).toEqual({ fret: 1, from: 1, to: 6 });
    expect(g.barre).toBeNull();
  });

  it('calls a moved shape a barre only when it is barred, anchored on the root', () => {
    // Bm7♭5 7x776x: the ♭5 sits a fret below the root, and nothing is barred.
    const bm7b5 = prompt('chord-name:E-shape@m7b5', seq(6 / 7 + 0.01, 0.9));
    expect(grip(bm7b5)).toBe('7x776x');
    expect(bm7b5).toMatchObject({ voicing: 'shape', barre: null });
    expect(d36VoicingLine(bm7b5)).toBe('E shape, frets 6–7');
    // Bm7♭5 x2323x is fingered without a barre too.
    const a = prompt('chord-name:A-shape@m7b5', seq(6 / 7 + 0.01, 0.9));
    expect(grip(a)).toBe('x2323x');
    expect(a.barre).toBeNull();
    // Bsus2 x24422: barred at the root's fret, from string 5.
    const sus = prompt('chord-name:A-shape@sus2', seq(6 / 7 + 0.01, 0.9));
    expect(grip(sus)).toBe('x24422');
    expect(sus.barre).toEqual({ fret: 2, from: 1, to: 5 });
    expect(d36VoicingLine(sus)).toBe('A-shape barre at fret 2');
  });

  it('draws a true voicing of its quality for every item, scope and rng', () => {
    const values = [0.01, 0.2, 0.4, 0.6, 0.8, 0.99];
    for (const id of ITEM_IDS) {
      for (const scope of [0, 1, 2]) {
        for (const v of values) {
          const p = d36MakePrompt(item(id), ctx(seq(v, 1 - v, v), scope));
          expect(p.notes[0]!.degree, id).toBe('1');
          for (const n of p.notes) {
            expect(n.fret).toBeGreaterThanOrEqual(D36_REGION.from);
            expect(n.fret).toBeLessThanOrEqual(D36_REGION.to);
            expect(chromaOf(n.name)).toBe(midiAt(n) % 12);
          }
          if (scope === 0) expect(p.root).toMatch(/^[A-G]$/);
          expect(d36Check(p, { root: p.root, kind: p.kind }).correct).toBe(true);
        }
      }
    }
  });

  it('roots on any pitch class from scope 1, and anywhere on the neck at scope 2', () => {
    expect(d36ScopeFor(-1)).toBe('naturals');
    expect(d36ScopeFor(1)).toBe('all-roots');
    expect(d36ScopeFor(9)).toBe('anywhere');
    const roots = new Set(
      Array.from(
        { length: 12 },
        (_, i) => prompt('chord-name:E-shape@major', seq(i / 12 + 0.01, 0.9), 1).root,
      ),
    );
    expect(roots.size).toBe(12);
    // A at scope 2: the open A shape, or the same shape at fret 12.
    const frets = new Set(
      [0.01, 0.99].map(
        (v) => prompt('chord-name:A-shape@major', seq(9 / 12 + 0.01, v, 0.9), 2).span.from,
      ),
    );
    expect(frets).toEqual(new Set([0, 12]));
  });

  it('spells roots by preference, unless the chord would need a double accidental', () => {
    expect(d36SpellRoot(10, 'minor', 'sharp')).toBe('A#');
    expect(d36SpellRoot(6, 'minor', 'flat')).toBe('F#');
    expect(d36SpellRoot(3, 'major', 'sharp')).toBe('Eb');
    const flat = d36MakePrompt(item('chord-name:A-shape@minor'), {
      ...ctx(seq(10 / 12 + 0.01, 0.9), 1),
      accidentalPref: 'flat',
    });
    expect(flat.root).toBe('Bb');
    expect(flat.roots[10]).toBe('Bb');
    // A♯7 would need C𝄪, so the sharp preference gives way to B♭7.
    expect(d36MakePrompt(item('chord-name:A-shape@7'), ctx(seq(10 / 12 + 0.01, 0.9), 1)).root).toBe(
      'Bb',
    );
  });

  it('keeps each pitch in drop D', () => {
    const p = d36MakePrompt(
      item('chord-name:E-shape@major'),
      ctx(seq(4 / 7 + 0.01, 0.9), 0, DROP_D_TUNING),
    );
    expect(p.root).toBe('G');
    expect(p.notes.find((n) => n.string === 6)!.fret).toBe(5);
    for (const n of p.notes) expect(chromaOf(n.name)).toBe(midiAt(n, DROP_D_TUNING) % 12);
  });

  it('names notes by their degree from the root', () => {
    for (const id of ITEM_IDS) {
      const p = prompt(id, seq(0.3, 0.9), 1);
      for (const n of p.notes) {
        const label = d36DegreeLabel(n.degree);
        const semis = semitonesAbove(p.root, n);
        const expected: Record<string, number> = {
          R: 0,
          '2': 2,
          '♭3': 3,
          '3': 4,
          '4': 5,
          '♭5': 6,
          '5': 7,
          '♭7': 10,
          '7': 11,
        };
        expect(semis, `${id} ${label}`).toBe(expected[label]);
      }
    }
  });
});

describe('D36 grading', () => {
  it('needs the root and the quality, in any spelling of the root', () => {
    const p = d36MakePrompt(item('chord-name:A-shape@minor'), ctx(seq(10 / 12 + 0.01, 0.9), 1));
    expect(p.root).toBe('A#');
    expect(d36Check(p, { root: 'Bb', kind: 'minor' })).toEqual({
      correct: true,
      expected: 'A♯m (A♯ minor)',
      concept: 'triad:min',
    });
    expect(d36Check(p, { root: 'A#', kind: 'minor' }).correct).toBe(true);
  });

  it('logs a wrong quality as that confusion, keyed as D7 keys it', () => {
    const p = prompt('chord-name:A-shape@minor');
    expect(d36Check(p, { root: 'A', kind: 'major' })).toEqual({
      correct: false,
      expected: 'Am (A minor)',
      concept: 'triad:min',
      confusedWith: 'triad:maj',
    });
    const maj7 = prompt('chord-name:E-shape@maj7');
    expect(d36Check(maj7, { root: 'A', kind: '7' })).toMatchObject({
      concept: 'chord:maj7',
      confusedWith: 'chord:7',
    });
    // The seed pairs apply without new seeds.
    const seeds = SEED_CONFUSIONS.map(([a, b]) => `${a}|${b}`);
    expect(seeds).toContain('triad:maj|triad:min');
    expect(seeds).toContain('chord:7|chord:maj7');
    expect(seeds).toContain('chord:m7|chord:m7b5');
  });

  it('logs a misread root with the right quality as no confusion', () => {
    const p = prompt('chord-name:A-shape@minor');
    expect(d36Check(p, { root: 'E', kind: 'minor' })).toEqual({
      correct: false,
      expected: 'Am (A minor)',
      concept: 'triad:min',
    });
  });

  it('accepts another name for exactly the same notes', () => {
    // Asus2 x02200 is A B E: Esus4's notes.
    const p = prompt('chord-name:A-shape@sus2');
    expect(d36SameNotes(p, { root: 'E', kind: 'sus4' })).toBe(true);
    expect(d36Check(p, { root: 'E', kind: 'sus4' }).correct).toBe(true);
    expect(d36SameNotes(p, { root: 'A', kind: 'sus2' })).toBe(false);
    expect(d36Check(p, { root: 'A', kind: 'sus4' }).correct).toBe(false);
    // C7 x32310 drops its 5th, so nothing else spells it.
    const c7 = prompt('chord-name:C-shape@7', seq(0.01, 0.9));
    expect(d36SameNotes(c7, { root: 'C', kind: 'maj7' })).toBe(false);
  });

  it('keys concepts from items and describes answers as symbols', () => {
    expect(d36ConceptOf(item('chord-name:E-shape@major'))).toBe('triad:maj');
    expect(d36ConceptOf(item('chord-name:E-shape@m7b5'))).toBe('chord:m7b5');
    expect(d36ConceptOf(item('note@s6f0'))).toBeNull();
    expect(d36Concept('sus4')).toBe('chord:sus4');
    expect(d36DescribeAnswer({ root: 'F#', kind: 'm7b5' })).toBe('F#m7b5');
    expect(d36DescribeAnswer({ root: 'A', kind: 'major' })).toBe('A');
  });

  it('grades the time per choice', () => {
    const p = prompt('chord-name:A-shape@minor');
    expect(d36GradedResponseMs(p, { root: 'A', kind: 'minor' }, 3000)).toBe(1500);
  });

  it('sounds the voicing, and the named chord when wrong', () => {
    const p = prompt('chord-name:A-shape@minor');
    const right = d36Sounds(p, fb(p, { root: 'A', kind: 'minor' }));
    expect(right).toEqual({ expected: ['A2', 'E3', 'A3', 'C4', 'E4'] });
    const wrong = d36Sounds(p, fb(p, { root: 'A', kind: 'major' }));
    expect(wrong.given).toEqual(['A3', 'C#4', 'E4']);
    expect(d36Sounds(p, fb(p, { root: 'B', kind: '7' })).given).toEqual(['B3', 'D#4', 'F#4', 'A4']);
  });
});

describe('D36 feedback', () => {
  it('says which notes decided the quality', () => {
    expect(d36Deciding(prompt('chord-name:A-shape@minor'))).toBe(
      'The 3rd is C, a minor 3rd above A.',
    );
    expect(d36Deciding(prompt('chord-name:A-shape@major'))).toBe(
      'The 3rd is C♯, a major 3rd above A.',
    );
    expect(d36Deciding(prompt('chord-name:A-shape@7'))).toBe(
      'The 3rd is C♯, a major 3rd above A; the 7th is G, a minor 7th.',
    );
    expect(d36Deciding(prompt('chord-name:A-shape@maj7'))).toBe(
      'The 3rd is C♯, a major 3rd above A; the 7th is G♯, a major 7th.',
    );
    expect(d36Deciding(prompt('chord-name:A-shape@m7b5'))).toBe(
      'The 3rd is C, a minor 3rd above A; the 5th is E♭, a diminished 5th; the 7th is G, a minor 7th.',
    );
    expect(d36Deciding(prompt('chord-name:A-shape@sus4'))).toBe(
      "There's no 3rd: D, a perfect 4th above A, takes its place.",
    );
    expect(d36Deciding(prompt('chord-name:A-shape@sus2'))).toBe(
      "There's no 3rd: B, a major 2nd above A, takes its place.",
    );
  });

  it('explains a wrong quality, a wrong root and a right answer', () => {
    const p = prompt('chord-name:A-shape@minor');
    expect(d36Explain(p, fb(p, { root: 'A', kind: 'major' }))).toBe(
      "It's Am, not A. The 3rd is C, a minor 3rd above A. Open chord, A shape.",
    );
    expect(d36Explain(p, fb(p, { root: 'C', kind: 'major' }))).toBe(
      "It's Am, not C. The root is A, the lowest note (string 5, open). The 3rd is C, a minor 3rd above A. Open chord, A shape.",
    );
    expect(d36Explain(p, fb(p, { root: 'A', kind: 'minor' }))).toBe(
      'Yes: Am. The 3rd is C, a minor 3rd above A. Open chord, A shape.',
    );
    const sus = prompt('chord-name:A-shape@sus2');
    expect(d36Explain(sus, fb(sus, { root: 'E', kind: 'sus4' }))).toBe(
      "Yes: Esus4 has the same notes. Named from its lowest note, it's Asus2. Open chord, A shape.",
    );
    const barre = prompt('chord-name:E-shape@m7', seq(3 / 7 + 0.01, 0.9));
    expect(d36RootLine(barre)).toBe('The root is F, the lowest note (string 6, fret 1).');
  });

  it('labels and styles every degree, by shape as well as colour', () => {
    expect(
      ['1', 'b3', '3', 'b5', '5', 'b7', '7', '2', '4'].map((d) => d36DegreeLabel(d as never)),
    ).toEqual(['R', '♭3', '3', '♭5', '5', '♭7', '7', '2', '4']);
    expect(d36DegreeStyle('1')).toBe('root');
    expect(d36DegreeStyle('b3')).toBe('third');
    expect(d36DegreeStyle('b5')).toBe('fifth');
    expect(d36DegreeStyle('7')).toBe('seventh');
    expect(d36DegreeStyle('4')).toBe('tone');
  });

  it('labels the qualities and chords for buttons, screen readers and the feedback bar', () => {
    expect(D36_QUALITIES.map(d36QualityLabel)).toEqual([
      'major',
      'minor',
      '7',
      'maj7',
      'm7',
      'm7♭5',
      'sus2',
      'sus4',
    ]);
    expect(d36QualityName('m7b5')).toBe('half-diminished seventh');
    expect(d36ChordName('F#', 'm7b5')).toBe('F♯m7♭5 (F♯ half-diminished seventh)');
    expect(d36Display('Bbmaj7')).toBe('B♭maj7');
  });
});

describe('D36 input', () => {
  it('maps the number row to qualities and A–G to natural roots', () => {
    expect(d36KeyToQuality('1')).toBe('major');
    expect(d36KeyToQuality('8')).toBe('sus4');
    expect(d36KeyToQuality('9')).toBeNull();
    expect(d36QualityKeyFor(5)).toBe('6');
    expect(d36KeyToRoot('a')).toBe('A');
    expect(d36KeyToRoot('G')).toBe('G');
    expect(d36KeyToRoot('h')).toBeNull();
    expect(d36KeyToRoot('Enter')).toBeNull();
    expect(d36Sharpen('F', 'sharp')).toBe('F#');
    expect(d36Sharpen('B', 'flat')).toBe('C');
    expect(d36Sharpen('A', 'flat')).toBe('Bb');
  });
});

describe('d36Window', () => {
  it('shows the whole neck on iPad landscape and 12 frets on portrait', () => {
    const p = prompt('chord-name:A-shape@minor');
    expect(d36Window(p, 'regular-wide', 5)).toEqual(D36_REGION);
    expect(d36Window(p, 'regular', 5)).toEqual({ from: 0, to: 12 });
    const high = prompt('chord-name:A-shape@major', seq(9 / 12 + 0.01, 0.99, 0.9), 2);
    expect(high.span.to).toBeGreaterThan(12);
    expect(d36Window(high, 'regular', 5)).toEqual({ from: 3, to: 15 });
  });

  it('frames the voicing on compact screens, inside the neck', () => {
    const p = prompt('chord-name:A-shape@minor');
    expect(d36Window(p, 'compact', 5)).toEqual({ from: 0, to: 4 });
    const high = prompt('chord-name:A-shape@major', seq(9 / 12 + 0.01, 0.99, 0.9), 2);
    const w = d36Window(high, 'compact', 7);
    expect(w.to - w.from + 1).toBe(7);
    expect(w.from).toBeLessThanOrEqual(high.span.from);
    expect(w.to).toBe(D36_REGION.to);
  });
});
