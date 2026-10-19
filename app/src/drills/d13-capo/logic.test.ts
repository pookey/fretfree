import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine/skills';
import { STANDARD_TUNING, majorKey, minorKey, semitonesUp } from '../../theory';
import type { DrillFeedback } from '../types';
import drill from './drill';
import {
  D13_SCOPE,
  d13Answer,
  d13CanTest,
  d13CapoIgnored,
  d13Check,
  d13Choices,
  d13ConceptOf,
  d13DescribeAnswer,
  d13Explain,
  d13Guides,
  d13Hint,
  d13KeyName,
  d13Ladder,
  d13LadderText,
  d13MakePrompt,
  d13Pretty,
  d13Question,
  d13ShapeName,
  d13Sounds,
  d13Spoken,
  d13TypeKey,
  d13TypedHint,
  d13WorkedExample,
  d13WrongDirection,
  type D13Answer,
  type D13Prompt,
} from './logic';

/** Returns `values` in turn, then the last one for ever. */
const seq =
  (...values: number[]) =>
  () =>
    (values.length > 1 ? values.shift() : values[0]) ?? 0;

const item = (id: string) => ({ id, skillId: 'C10.capo-g-c-d' });
const make = (id: string, rng: () => number = () => 0, scopeLevel = 0) =>
  d13MakePrompt(item(id), {
    tuning: STANDARD_TUNING,
    accidentalPref: 'sharp',
    scopeLevel,
    rng,
  });
/** Capo `capo` at scope 1 (frets 1–7): the first rng value picks the fret. */
const at = (id: string, capo: number, scopeLevel = 1) =>
  make(id, seq((capo - 1) / 7 + 0.01, 0), scopeLevel);
const fb = (p: D13Prompt, answer: D13Answer): DrillFeedback<D13Answer> => ({
  answer,
  result: d13Check(p, answer),
});

describe('D13 items', () => {
  it('tests every C10 item and only the open-shape capo cards', () => {
    for (const s of SKILLS.filter((x) => x.topic === 'C10')) {
      for (const i of s.items()) expect(d13CanTest(i), i.id).toBe(true);
    }
    expect(d13CanTest(item('capo-sound:F'))).toBe(false);
    expect(d13CanTest(item('capo-sound:Gm'))).toBe(false);
    expect(d13CanTest(item('note@s6f5'))).toBe(false);
    expect(() => make('note@s6f5')).toThrow(/cannot test/);
  });

  it('registers as the capo drill for every C10 skill', () => {
    expect(drill.id).toBe('capo');
    expect(drill.skills).toEqual(['C10.capo-g-c-d', 'C10.capo-a-e', 'C10.capo-minor']);
    expect(drill.inputModes).toEqual(['choice', 'keyboard']);
    expect(drill.scope).toEqual(D13_SCOPE);
  });

  it('keys the directions as the confusable pair up / down', () => {
    expect(d13ConceptOf(item('capo-sound:G'))).toBe('capo:up');
    expect(d13ConceptOf(item('capo-fret:G'))).toBe('capo:up');
    expect(d13ConceptOf(item('capo-shape:G'))).toBe('capo:down');
    expect(d13ConceptOf(item('note@s6f5'))).toBeNull();
  });
});

describe('d13MakePrompt', () => {
  it('raises the shapes by a capo the rng picks: G shapes, capo 3 → B♭', () => {
    const p = at('capo-sound:G', 3);
    expect(p).toMatchObject({
      itemId: 'capo-sound:G',
      ask: 'sound',
      shape: majorKey('G'),
      capo: 3,
      sounding: majorKey('Bb'),
      level: 1,
    });
    expect(d13Answer(p)).toBe('Bb');
  });

  it('keeps the capo to frets 1–4 at scope 0 and 1–7 above', () => {
    const capos = (level: number) =>
      [0, 0.24, 0.26, 0.5, 0.74, 0.99].map((r) => make('capo-sound:G', () => r, level).capo);
    expect(Math.max(...capos(0))).toBe(4);
    expect(Math.min(...capos(0))).toBe(1);
    expect(Math.max(...capos(1))).toBe(7);
    expect(Math.max(...capos(2))).toBe(7);
    // Out-of-range levels clamp.
    expect(make('capo-sound:G', () => 0.99, 9).level).toBe(2);
    expect(make('capo-sound:G', () => 0.99, -3).level).toBe(0);
  });

  it('asks each direction of the same fact', () => {
    expect(d13Answer(at('capo-shape:G', 3))).toBe('G');
    expect(d13Answer(at('capo-fret:G', 3))).toBe('3');
    // Minor shapes stay minor: Am shapes, capo 3 → C minor.
    const minor = at('capo-sound:Am', 3);
    expect(minor.sounding).toEqual(minorKey('C'));
    expect(d13Answer(minor)).toBe('Cm');
  });

  it('spells sounding keys as the circle names them', () => {
    expect(d13Answer(at('capo-sound:E', 6))).toBe('Bb');
    expect(d13Answer(at('capo-sound:C', 1))).toBe('Db');
    expect(d13Answer(at('capo-sound:D', 4))).toBe('F#');
  });
});

describe('d13Choices', () => {
  const base = (ask: D13Prompt['ask'], capo = 3) => {
    const p = at(`capo-${ask}:G`, capo);
    return { ask: p.ask, shape: p.shape, capo: p.capo, sounding: p.sounding };
  };

  it('always offers the answer and both misconceptions at scope 0', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const sound = d13Choices(base('sound'), 0, () => r);
      expect(sound).toHaveLength(4);
      // B♭ (answer), E (the wrong way), G (capo ignored).
      expect(sound).toEqual(expect.arrayContaining(['Bb', 'E', 'G']));
      const shape = d13Choices(base('shape'), 0, () => r);
      // G (answer), D♭ (the wrong way), B♭ (capo ignored).
      expect(shape).toEqual(expect.arrayContaining(['G', 'Db', 'Bb']));
      const fret = d13Choices(base('fret'), 0, () => r);
      expect(fret).toHaveLength(4);
      expect(fret).toEqual(expect.arrayContaining(['3', '9']));
    }
  });

  it('shows keys in order from C and frets in order, so place gives nothing away', () => {
    const order = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const sound = d13Choices(base('sound'), 1, () => 0.4);
    expect(sound).toHaveLength(6);
    expect(sound).toEqual([...sound].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    const fret = d13Choices(base('fret'), 1, () => 0.4);
    expect(fret).toEqual([...fret].sort((a, b) => Number(a) - Number(b)));
  });

  it('varies the near misses with the rng', () => {
    const seen = new Set(
      [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((r) => d13Choices(base('sound'), 0, () => r).join()),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('offers every key, or frets 1–11, at the top level', () => {
    expect(d13Choices(base('sound'), 2, () => 0)).toEqual([
      'C',
      'Db',
      'D',
      'Eb',
      'E',
      'F',
      'F#',
      'G',
      'Ab',
      'A',
      'Bb',
      'B',
    ]);
    expect(d13Choices(base('fret'), 2, () => 0)).toEqual(
      Array.from({ length: 11 }, (_, i) => String(i + 1)),
    );
    const minor = at('capo-shape:Em', 2, 2);
    expect(minor.choices).toEqual(expect.arrayContaining(['Em', 'Cm']));
    expect(d13Choices(minor, 2, () => 0).every((c) => c.endsWith('m'))).toBe(true);
  });

  it('fills from near misses when the wrong way is the answer (capo 6)', () => {
    const p = base('fret', 6);
    expect(d13WrongDirection(p)).toBe('6');
    const fret = d13Choices(p, 0, () => 0.5);
    expect(fret).toHaveLength(4);
    expect(new Set(fret).size).toBe(4);
    // Near misses never leave frets 1–11.
    const low = d13Choices(base('fret', 1), 1, () => 0);
    expect(low.every((f) => Number(f) >= 1 && Number(f) <= 11)).toBe(true);
    expect(low).toContain('11');
  });
});

describe('d13Check', () => {
  it('grades the answer and logs the wrong way as the confusable direction', () => {
    const sound = at('capo-sound:G', 3);
    expect(d13Check(sound, 'Bb')).toEqual({ correct: true, expected: 'B♭', concept: 'capo:up' });
    expect(d13Check(sound, 'E')).toEqual({
      correct: false,
      expected: 'B♭',
      concept: 'capo:up',
      confusedWith: 'capo:down',
    });
    // Ignoring the capo is wrong, but not the direction confusion.
    expect(d13Check(sound, 'G')).toEqual({ correct: false, expected: 'B♭', concept: 'capo:up' });

    const shape = at('capo-shape:G', 3);
    expect(d13Check(shape, 'Db').confusedWith).toBe('capo:up');
    expect(d13Check(shape, 'Db').concept).toBe('capo:down');
    const fret = at('capo-fret:G', 3);
    expect(d13Check(fret, '3').correct).toBe(true);
    expect(d13Check(fret, '9').confusedWith).toBe('capo:down');
    expect(d13Check(fret, '4').confusedWith).toBeUndefined();
  });

  it('describes the answer as given', async () => {
    expect(d13DescribeAnswer('Bb')).toBe('Bb');
    expect((await drill.logic.preload()).describeAnswer('3')).toBe('3');
  });
});

describe('wording', () => {
  it('asks each direction in words, naming only what is given', () => {
    expect(d13Question(at('capo-sound:G', 3))).toBe(
      'You play G shapes with a capo on fret 3. Which key sounds?',
    );
    expect(d13Question(at('capo-shape:G', 3))).toBe(
      'The song is in B♭ major. With a capo on fret 3, which shapes do you play?',
    );
    expect(d13Question(at('capo-fret:G', 3))).toBe(
      'The song is in B♭ major. You play it with G shapes. Which fret for the capo?',
    );
    expect(d13Question(at('capo-sound:Am', 2))).toContain('Am shapes');
  });

  it('names keys and shapes for display and for screen readers', () => {
    expect(d13Pretty('Bb')).toBe('B♭');
    expect(d13Pretty('F#m')).toBe('F♯m');
    expect(d13Pretty('11')).toBe('11');
    expect(d13KeyName(minorKey('Bb'))).toBe('B♭ minor');
    expect(d13ShapeName(minorKey('E'))).toBe('Em shapes');
    expect(d13Spoken({ ask: 'sound', shape: majorKey('G') }, 'Bb')).toBe('B flat major');
    expect(d13Spoken({ ask: 'shape', shape: minorKey('A') }, 'F#m')).toBe('F sharp minor shapes');
    expect(d13Spoken({ ask: 'fret', shape: majorKey('G') }, '3')).toBe('fret 3');
  });

  it('climbs the ladder one half step per fret, toward the sounding key’s accidentals', () => {
    const p = at('capo-sound:G', 3);
    expect(d13Ladder(p)).toEqual([
      { fret: 0, note: 'G' },
      { fret: 1, note: 'Ab' },
      { fret: 2, note: 'A' },
      { fret: 3, note: 'Bb' },
    ]);
    expect(d13LadderText(at('capo-sound:C', 2))).toBe('C → C♯ → D');
    expect(d13WorkedExample(p)).toBe(
      'A capo on fret 3 raises G shapes 3 half steps: G → A♭ → A → B♭. They sound in B♭ major.',
    );
    expect(d13WorkedExample(at('capo-sound:C', 1))).toContain('1 half step:');
    expect(d13WorkedExample(at('capo-shape:G', 3))).toBe(
      'For a song in B♭ major with a capo on fret 3, count down 3 half steps: B♭ → A → A♭ → G. Play G shapes.',
    );
    expect(d13WorkedExample(at('capo-fret:G', 3))).toBe(
      'From G shapes up to B♭ major is 3 half steps: G → A♭ → A → B♭. Put the capo on fret 3.',
    );
  });

  it('explains the wrong way, the ignored capo and other slips', () => {
    const sound = at('capo-sound:G', 3);
    expect(d13Explain(sound, 'Bb')).toBe('');
    expect(d13Explain(sound, 'E')).toBe(
      'E is 3 half steps below G. A capo shortens the strings, so it raises the pitch: count up.',
    );
    expect(d13Explain(sound, 'G')).toBe(
      'G is the shape you finger. With the capo on fret 3 it sounds 3 half steps higher.',
    );
    expect(d13Explain(sound, 'B')).toBe('B is 4 half steps above G, not 3.');

    const shape = at('capo-shape:G', 3);
    expect(d13Explain(shape, 'Db')).toContain('D♭ is 3 half steps above B♭');
    expect(d13Explain(shape, 'Db')).toContain('count down');
    expect(d13Explain(shape, 'Bb')).toBe(
      'B♭ is the key that sounds. Under a capo on fret 3 you finger shapes 3 half steps lower.',
    );
    expect(d13Explain(shape, 'Ab')).toBe('A♭ shapes with a capo on fret 3 sound in B major.');

    const fret = at('capo-fret:G', 3);
    expect(d13Explain(fret, '9')).toBe(
      'Capo 9 counts up from B♭ to G, from the song to the shapes. Count up from the shapes to the song: G to B♭ is 3 half steps.',
    );
    expect(d13Explain(fret, '2')).toBe('A capo on fret 2 makes G shapes sound in A major.');
    expect(d13CapoIgnored(fret)).toBeNull();
  });

  it('hints the method by direction, never the answer', () => {
    expect(d13Hint({ ask: 'sound' })).toMatch(/count up/);
    expect(d13Hint({ ask: 'shape' })).toMatch(/count down/);
    expect(d13Hint({ ask: 'fret' })).toMatch(/up from the shapes/);
  });

  it('fades guides by level (rule 9)', () => {
    expect(d13Guides(0)).toEqual({ hint: false, fretNumbers: false });
    expect(d13Guides(1)).toEqual({ hint: true, fretNumbers: false });
    expect(d13Guides(2)).toEqual({ hint: true, fretNumbers: true });
  });
});

describe('d13Sounds', () => {
  it('plays the shapes’ tonic, then the key a capo higher', () => {
    const p = at('capo-sound:G', 3);
    expect(d13Sounds(p, fb(p, 'Bb'))).toEqual({ expected: ['G3', 'Bb3'] });
    const high = at('capo-sound:A', 5);
    expect(d13Sounds(high, fb(high, 'D'))).toEqual({ expected: ['A3', 'D4'] });
  });

  it('adds a wrong answer where it puts the key', () => {
    const sound = at('capo-sound:G', 3);
    // The wrong way sounds below the shapes; another key above them.
    expect(d13Sounds(sound, fb(sound, 'E')).given).toEqual(['E3']);
    expect(d13Sounds(sound, fb(sound, 'G')).given).toEqual(['G3']);
    expect(d13Sounds(sound, fb(sound, 'B')).given).toEqual(['B3']);
    const shape = at('capo-shape:G', 3);
    expect(d13Sounds(shape, fb(shape, 'Ab')).given).toEqual(['Ab3']);
    const fret = at('capo-fret:G', 3);
    expect(d13Sounds(fret, fb(fret, '5')).given).toEqual(['C4']);
    // Nothing to add for an answer that names no key or fret.
    expect(d13Sounds(fret, fb(fret, 'x')).given).toBeUndefined();
    expect(d13Sounds(sound, fb(sound, 'H')).given).toBeUndefined();
    expect(semitonesUp('G', 'C')).toBe(5);
  });
});

describe('d13TypeKey', () => {
  const keys = ['E', 'G', 'A', 'Bb'];

  it('answers a natural at once when nothing else starts on that pitch', () => {
    expect(d13TypeKey('', 'e', 'sound', keys)).toEqual({ typed: '', answer: 'E' });
    expect(d13TypeKey('', 'G', 'sound', keys)).toEqual({ typed: '', answer: 'G' });
  });

  it('waits on a letter with an altered button, then takes # or - by pitch', () => {
    expect(d13TypeKey('', 'A', 'sound', keys)).toEqual({ typed: 'A', answer: null });
    expect(d13TypeKey('A', '#', 'sound', keys)).toEqual({ typed: '', answer: 'Bb' });
    expect(d13TypeKey('', 'B', 'sound', keys)).toEqual({ typed: 'B', answer: null });
    expect(d13TypeKey('B', '-', 'sound', keys)).toEqual({ typed: '', answer: 'Bb' });
    expect(d13TypeKey('A', 'Enter', 'sound', keys)).toEqual({ typed: '', answer: 'A' });
    // A pitch with no button, or Enter on nothing, does nothing.
    expect(d13TypeKey('E', '-', 'sound', keys)).toEqual({ typed: 'E', answer: null });
    expect(d13TypeKey('', 'Enter', 'sound', keys)).toEqual({ typed: '', answer: null });
    expect(d13TypeKey('', 'x', 'sound', keys)).toEqual({ typed: '', answer: null });
    expect(d13TypeKey('B', 'Escape', 'sound', keys)).toEqual({ typed: '', answer: null });
    // A letter no button starts on is dropped, not kept waiting.
    expect(d13TypeKey('', 'D', 'sound', keys)).toEqual({ typed: '', answer: null });
    expect(d13TypeKey('A', 'c', 'sound', keys)).toEqual({ typed: '', answer: null });
  });

  it('offers Enter only when Enter would answer', () => {
    expect(d13TypedHint('A', 'sound', keys)).toBe('Typed A. Press Enter to answer.');
    expect(d13TypedHint('B', 'sound', keys)).toBe('Typed B. Type # or - next.');
    expect(d13TypedHint('1', 'fret', ['1', '10', '11'])).toBe('Typed 1. Press Enter to answer.');
    expect(d13TypedHint('1', 'fret', ['3', '10', '11'])).toBe('Typed 1. Type the next digit.');
  });

  it('matches minor key buttons by their tonic', () => {
    expect(d13TypeKey('', 'c', 'shape', ['Am', 'Cm', 'Em'])).toEqual({ typed: '', answer: 'Cm' });
  });

  it('builds fret numbers, waiting on 1 for 10 and 11', () => {
    const frets = Array.from({ length: 11 }, (_, i) => String(i + 1));
    expect(d13TypeKey('', '3', 'fret', frets)).toEqual({ typed: '', answer: '3' });
    expect(d13TypeKey('', '1', 'fret', frets)).toEqual({ typed: '1', answer: null });
    expect(d13TypeKey('1', '1', 'fret', frets)).toEqual({ typed: '', answer: '11' });
    expect(d13TypeKey('1', 'Enter', 'fret', frets)).toEqual({ typed: '', answer: '1' });
    expect(d13TypeKey('', 'Enter', 'fret', frets)).toEqual({ typed: '', answer: null });
    // A digit that leads nowhere from what's typed starts a new number.
    expect(d13TypeKey('1', '5', 'fret', frets)).toEqual({ typed: '', answer: '5' });
    expect(d13TypeKey('', '0', 'fret', frets)).toEqual({ typed: '', answer: null });
    expect(d13TypeKey('', 'a', 'fret', frets)).toEqual({ typed: '', answer: null });
    expect(d13TypeKey('1', 'Backspace', 'fret', frets)).toEqual({ typed: '', answer: null });
  });
});
