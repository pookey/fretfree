import { describe, expect, it } from 'vitest';
import { SKILLS, getSkill } from '../../engine';
import { MODULES } from '../../engine/frontier';
import { INLAY_FRETS, inRange, noteAt } from '../../theory';
import { INTROS, introFor, wordCount, type ConceptIntro } from './index';

const byId = (id: string) => INTROS.find((i) => i.id === id)!;

/** The package's ten, plus F4 and the first I6 sets now that M4-07 and M6-08 have merged. */
const SHIPPED = [
  'F1.alphabet',
  'F1.b-c-e-f',
  'F1.half-steps',
  'F1.whole-steps',
  'F2.string6-naturals',
  'F2.string5-naturals',
  'F3.markers',
  'F3.repeat-12',
  'C1.octaves',
  'C3.thirds',
  'F4.pulse',
  'I6.intervals-fourths-fifths',
  'I6.chords-major-minor',
];

describe('concept-intro registry', () => {
  it('loads every intro file, one ID each', () => {
    const ids = INTROS.map((i) => i.id);
    expect(ids.length).toBeGreaterThanOrEqual(SHIPPED.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('targets real skills or research/03 topics', () => {
    const topics = new Set(MODULES.flatMap((m) => m.topics));
    for (const i of INTROS) {
      expect(i.for.length, i.id).toBeGreaterThan(0);
      for (const target of i.for) {
        expect(getSkill(target) !== undefined || topics.has(target), `${i.id} → ${target}`).toBe(
          true,
        );
      }
    }
  });

  it('gives each shipped skill its own intro', () => {
    for (const id of SHIPPED) {
      const intro = introFor(getSkill(id)!);
      expect(intro?.for, id).toContain(id);
    }
    // No intro rather than a misleading one: the G–B octave shift is its own idea.
    expect(introFor(getSkill('C1.octaves-gb-shift')!)).toBeUndefined();
    expect(SKILLS.length).toBeGreaterThan(SHIPPED.length);
  });

  it('prefers a skill-ID match over a topic match', () => {
    const topic: ConceptIntro = { ...byId('f1-alphabet'), id: 'topic', for: ['C2'] };
    const skill: ConceptIntro = { ...topic, id: 'skill', for: ['C2.all-notes'] };
    expect(introFor({ id: 'C2.all-notes', topic: 'C2' }, [topic, skill])?.id).toBe('skill');
    expect(introFor({ id: 'C2.other', topic: 'C2' }, [topic, skill])?.id).toBe('topic');
    expect(introFor({ id: 'X.none', topic: 'X' }, [topic, skill])).toBeUndefined();
  });

  it('counts words the way a reader would', () => {
    expect(wordCount('B–C and E–F')).toBe(5);
    expect(wordCount('C# and Db are one note.')).toBe(6);
    expect(wordCount('You’ll hear 3rds: G at string 6, fret 3 → G')).toBe(10);
    expect(wordCount('')).toBe(0);
  });
});

describe('intro content', () => {
  it('keeps every intro to 40 words and a title', () => {
    for (const i of INTROS) {
      expect(wordCount(i.text), i.id).toBeLessThanOrEqual(40);
      expect(i.title.length, i.id).toBeGreaterThan(0);
    }
  });

  it('says what each term it uses means', () => {
    // A term needs defining unless the intro says what it is ("X is …", "(…)").
    const terms: Record<string, RegExp> = {
      'half step': /half step is|half step \(/i,
      'whole step': /whole step is/i,
      interval: /interval\b[^.]*\bis the distance|is an interval/i,
      octave:
        /octave is|octave (higher|higher in pitch)?[,:]? the same letter|sounds like the same note/i,
      sharp: /sharp \(#\)/i,
      flat: /flat \(b\)/i,
      chord: /chord: three or more notes/i,
      pulse: /pulse is/i,
    };
    for (const i of INTROS) {
      for (const [term, defined] of Object.entries(terms)) {
        if (!new RegExp(`\\b${term}`, 'i').test(i.text)) continue;
        expect(defined.test(i.text), `${i.id} uses "${term}" without saying what it is`).toBe(true);
      }
    }
  });

  it('names every neck note correctly and keeps it inside its window', () => {
    for (const i of INTROS) {
      if (i.diagram?.kind !== 'neck') continue;
      for (const m of i.diagram.markers) {
        expect(inRange(m.fret, i.diagram.range), `${i.id} ${m.string}:${m.fret}`).toBe(true);
        expect(m.label, i.id).toBe(noteAt(m).pc);
        expect(m.forceLabel, i.id).toBe(true);
      }
      expect(i.diagram.label.length, i.id).toBeGreaterThan(0);
    }
  });

  it('draws the letters the F2 intros list, in their order', () => {
    const letters = (id: string) => {
      const d = byId(id).diagram!;
      return d.kind === 'neck' ? d.markers.map((m) => `${m.label}${m.fret}`) : [];
    };
    expect(letters('f2-string6-naturals')).toEqual([
      'E0',
      'F1',
      'G3',
      'A5',
      'B7',
      'C8',
      'D10',
      'E12',
    ]);
    expect(letters('f2-string5-naturals')).toEqual([
      'A0',
      'B2',
      'C3',
      'D5',
      'E7',
      'F8',
      'G10',
      'A12',
    ]);
    for (const id of ['f2-string6-naturals', 'f2-string5-naturals']) {
      for (const label of letters(id)) {
        const [, pc, fret] = label.match(/^([A-G])(\d+)$/)!;
        if (fret === '0') continue;
        expect(byId(id).text, label).toMatch(new RegExp(`${pc} at (fret )?${fret}\\b`));
      }
    }
  });

  it('shows the octave and 3rd shapes the text describes', () => {
    const octave = byId('c1-octaves').diagram!;
    if (octave.kind !== 'neck') throw new Error('c1-octaves has a neck');
    const [root, top] = octave.markers;
    expect(noteAt(top!).midi - noteAt(root!).midi).toBe(12);
    expect([root!.string - top!.string, top!.fret - root!.fret]).toEqual([2, 2]);

    const thirds = byId('c3-thirds').diagram!;
    if (thirds.kind !== 'neck') throw new Error('c3-thirds has a neck');
    const pairs = [thirds.markers.slice(0, 2), thirds.markers.slice(2, 4)];
    for (const [r, t] of pairs) expect(noteAt(t!).midi - noteAt(r!).midi).toBe(4);
    // One fret back off the G–B pair, the same fret across it.
    expect(pairs.map(([r, t]) => t!.fret - r!.fret)).toEqual([-1, 0]);
    expect(pairs[1]!.map((m) => m.string)).toEqual([3, 2]);
  });

  it('marks the inlay frets the F3 intro names', () => {
    const d = byId('f3-markers').diagram!;
    if (d.kind !== 'neck') throw new Error('f3-markers has a neck');
    const shown = INLAY_FRETS.filter((f) => inRange(f, d.range));
    expect(shown).toEqual([3, 5, 7, 9, 12]);
    for (const f of shown) expect(byId('f3-markers').text).toContain(String(f));
  });

  it('repeats at fret 12 in the F3 diagram', () => {
    const d = byId('f3-repeat-12').diagram!;
    if (d.kind !== 'neck') throw new Error('f3-repeat-12 has a neck');
    const at = (fret: number) => d.markers.find((m) => m.fret === fret)!.label;
    expect(at(12)).toBe(at(0));
    expect(at(15)).toBe(at(3));
  });

  it('fades the wheel to what each F1 intro has defined', () => {
    const level = (id: string) => {
      const d = byId(id).diagram!;
      return d.kind === 'wheel' ? d.guideLevel : null;
    };
    // Letters only before sharps exist; sharps unnamed once "a note between"
    // is said; every name once sharps and flats are.
    expect(level('f1-alphabet')).toBe(1);
    expect(level('f1-b-c-e-f')).toBe(2);
    expect(level('f1-half-steps')).toBe(3);
    expect(level('f1-whole-steps')).toBe(3);
  });
});
