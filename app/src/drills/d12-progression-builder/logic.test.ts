import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING } from '../../theory';
import type { DrillContext } from '../types';
import {
  D12_SCOPE,
  clearSlot,
  d12CanTest,
  d12Check,
  d12Columns,
  d12ConceptOf,
  d12DescribeAnswer,
  d12Expected,
  d12Explain,
  d12GradedResponseMs,
  d12Guides,
  d12KeyAction,
  d12KeyChords,
  d12Keys,
  d12MakePrompt,
  d12Mix,
  d12MoveTarget,
  d12SlotNoun,
  d12Sounds,
  d12Subject,
  d12Task,
  d12Verdicts,
  d12WorkedExample,
  emptySlots,
  isFull,
  moveChord,
  nextEmpty,
  placeChord,
  pretty,
  progressionConcept,
  spokenChord,
  type D12Answer,
  type D12Prompt,
} from './logic';

const ctx = (rng = 0, scopeLevel = 0): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel,
  rng: () => rng,
});

const make = (id: string, rng = 0, scopeLevel = 0) =>
  d12MakePrompt({ id, skillId: 'C9.pop' }, ctx(rng, scopeLevel));

/** The prompt's chart rotated left by n. */
const rotated = (p: D12Prompt, n: number): D12Answer => ({
  chords: [...p.expected.slice(n), ...p.expected.slice(0, n)],
});

describe('D12 items', () => {
  it('tests progression items only', () => {
    expect(d12CanTest({ id: 'prog:I-V-vi-IV:build', skillId: 'C9.pop' })).toBe(true);
    expect(d12CanTest({ id: 'prog:12-bar-blues:transpose', skillId: 'C9.blues' })).toBe(true);
    expect(d12CanTest({ id: 'prog:nope:build', skillId: 'C9.pop' })).toBe(false);
    expect(d12CanTest({ id: 'note@s6f5', skillId: 'F2.string6-naturals' })).toBe(false);
    expect(() => make('note@s6f5')).toThrow(/cannot test/);
  });

  it('keys an item by its progression, the seed pair for the rotation misconception', () => {
    expect(d12ConceptOf({ id: 'prog:I-V-vi-IV:build', skillId: 'C9.pop' })).toBe('prog:I-V-vi-IV');
    expect(d12ConceptOf({ id: 'prog:vi-IV-I-V:transpose', skillId: 'C9.pop' })).toBe(
      'prog:vi-IV-I-V',
    );
    expect(d12ConceptOf({ id: 'note@s6f5', skillId: 'F2.string6-naturals' })).toBeNull();
    expect(progressionConcept('ii-V-I')).toBe('prog:ii-V-I');
  });
});

describe('d12Keys', () => {
  it('widens with scope, in the progression’s own mode', () => {
    expect(d12Keys('major', 0)).toEqual(['C', 'G', 'D', 'A', 'E']);
    expect(d12Keys('major', 1)).toEqual(['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb']);
    expect(d12Keys('major', 9)).toHaveLength(12);
    expect(d12Keys('minor', -1)).toEqual(['Am', 'Em', 'Dm']);
    expect(d12Keys('minor', D12_SCOPE.maxLevel)).toHaveLength(11);
  });
});

describe('d12MakePrompt', () => {
  it('builds a progression in a key, with its chords among the tiles', () => {
    const p = make('prog:I-V-vi-IV:build');
    expect(p).toMatchObject({
      task: 'build',
      progressionId: 'I-V-vi-IV',
      name: 'I–V–vi–IV',
      key: 'C',
      keyName: 'C major',
      numerals: ['I', 'V', 'vi', 'IV'],
      expected: ['C', 'G', 'Am', 'F'],
      from: null,
      rotations: ['vi–IV–I–V'],
    });
    // Its four chords and two distractors, in letter order, never numeral order.
    expect(p.palette.map((t) => t.symbol)).toEqual(['Am', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(p.palette.find((t) => t.symbol === 'Dm')?.roman).toBe('ii');
  });

  it('shares one palette between rotations, so only the order tells them apart', () => {
    const a = make('prog:I-V-vi-IV:build', 0.5);
    const b = make('prog:vi-IV-I-V:build', 0.5);
    expect(a.palette).toEqual(b.palette);
    expect(b.rotations).toEqual(['I–V–vi–IV']);
  });

  it('varies the key with the rng and widens the palette with scope', () => {
    expect(make('prog:I-IV-V:build', 0.99).key).toBe('E');
    expect(make('prog:I-IV-V:build', 0.99, 2).key).toBe('F#');
    expect(make('prog:I-IV-V:build', 0, 0).palette).toHaveLength(5);
    expect(make('prog:I-IV-V:build', 0, 1).palette).toHaveLength(7);
    // The last level offers the whole key, however many that is.
    expect(make('prog:I-IV-V:build', 0, 2).palette).toHaveLength(7);
  });

  it('spells chords in the key and sorts flats before naturals', () => {
    const p = make('prog:I-V-vi-IV:build', 0.8, 1);
    expect(p.key).toBe('Bb');
    expect(p.expected).toEqual(['Bb', 'F', 'Gm', 'Eb']);
    const symbols = p.palette.map((t) => t.symbol);
    expect(symbols.indexOf('Bb')).toBeLessThan(symbols.indexOf('Cm'));
    expect(symbols.indexOf('Eb')).toBeLessThan(symbols.indexOf('F'));
  });

  it('keeps a minor progression in minor keys', () => {
    const p = make('prog:i-bVII-bVI-bVII:build', 0.4);
    expect(p).toMatchObject({ key: 'Em', keyName: 'E minor', expected: ['Em', 'D', 'C', 'D'] });
    expect(p.name).toBe('i–♭VII–♭VI–♭VII');
    expect(p.palette.map((t) => t.roman)).toEqual(expect.arrayContaining(['iv', 'v']));
    expect(p.rotations).toEqual([]);
  });

  it('offers the blues dominant 7 chords, not triads', () => {
    const p = make('prog:12-bar-blues:build');
    expect(p.expected).toEqual([
      'C7',
      'C7',
      'C7',
      'C7',
      'F7',
      'F7',
      'C7',
      'C7',
      'G7',
      'F7',
      'C7',
      'G7',
    ]);
    expect(p.palette.map((t) => t.symbol)).toEqual(['C7', 'D7', 'F7', 'G7', 'A7'].sort());
    expect(p.palette.every((t) => t.symbol.endsWith('7'))).toBe(true);
  });

  it('transposes a chart between two different keys of one mode', () => {
    for (const rng of [0, 0.2, 0.5, 0.99]) {
      const p = make('prog:ii-V-I:transpose', rng);
      expect(p.from).not.toBeNull();
      expect(p.from?.key).not.toBe(p.key);
    }
    const p = make('prog:ii-V-I:transpose', 0);
    expect(p).toMatchObject({
      task: 'transpose',
      key: 'G',
      expected: ['Am', 'D', 'G'],
      from: { key: 'C', keyName: 'C major', chords: ['Dm', 'G', 'C'] },
    });
    const minor = make('prog:i-bVII-bVI-bVII:transpose', 0);
    expect(minor.from?.key).toBe('Am');
    expect(minor.key).toBe('Em');
  });
});

describe('d12Check', () => {
  const p = make('prog:I-V-vi-IV:build');

  it('is correct only when every slot is right', () => {
    expect(d12Check(p, { chords: ['C', 'G', 'Am', 'F'] })).toEqual({
      correct: true,
      expected: 'C G Am F',
      concept: 'prog:I-V-vi-IV',
    });
    expect(d12Check(p, { chords: ['C', 'G', 'Am', 'Dm'] })).toEqual({
      correct: false,
      expected: 'C G Am F',
      concept: 'prog:I-V-vi-IV',
    });
    expect(d12Check(p, { chords: ['C', 'G', 'Am'] }).correct).toBe(false);
    expect(d12Verdicts(p, { chords: ['C', 'Em'] })).toEqual([true, false, false, false]);
  });

  it('logs building the catalogue rotation as that confusion', () => {
    expect(d12Check(p, rotated(p, 2))).toEqual({
      correct: false,
      expected: 'C G Am F',
      concept: 'prog:I-V-vi-IV',
      confusedWith: 'prog:vi-IV-I-V',
    });
    const back = make('prog:vi-IV-I-V:build');
    expect(d12Check(back, rotated(back, 2)).confusedWith).toBe('prog:I-V-vi-IV');
  });

  it('logs another catalogue progression, but not a rotation outside it', () => {
    expect(d12Check(p, { chords: ['C', 'Am', 'F', 'G'] }).confusedWith).toBe('prog:I-vi-IV-V');
    expect(d12Check(p, rotated(p, 1)).confusedWith).toBeUndefined();
    expect(d12Mix(p, rotated(p, 1))).toEqual({ rotation: 1, other: null });
    expect(d12Mix(p, { chords: ['C'] })).toEqual({ rotation: null, other: null });
  });

  it('tells the blues from its quick change', () => {
    const blues = make('prog:12-bar-blues:build');
    const quick = [...blues.expected];
    quick[1] = 'F7';
    expect(d12Check(blues, { chords: quick }).confusedWith).toBe('prog:12-bar-blues-quick-change');
  });

  it('shows the expected chart with accidentals', () => {
    expect(d12Expected(make('prog:I-IV-V:build', 0.8, 1))).toBe('B♭ E♭ F');
  });
});

describe('d12Explain', () => {
  const p = make('prog:I-V-vi-IV:build');

  it('says nothing for a right answer', () => {
    expect(d12Explain(p, { chords: [...p.expected] })).toEqual([]);
  });

  it('explains a rotation as the same chords from another start', () => {
    expect(d12Explain(p, rotated(p, 2))).toEqual([
      'You built vi–IV–I–V: the same chords as I–V–vi–IV, started from the vi.',
      'I–V–vi–IV starts on its I, C. Same chords, different starting point, different feel.',
    ]);
    expect(d12Explain(p, rotated(p, 1))[0]).toBe(
      'You built V–vi–IV–I: the same chords as I–V–vi–IV, started from the V.',
    );
  });

  it('names another catalogue progression, then each wrong chord', () => {
    expect(d12Explain(p, { chords: ['C', 'Am', 'F', 'G'] })).toEqual([
      "That's I–vi–IV–V, not I–V–vi–IV.",
      'Chord 2 is the V in C major: G, not Am.',
      'Chord 3 is the vi in C major: Am, not F.',
      'Chord 4 is the IV in C major: F, not G.',
    ]);
  });

  it('explains a transposition through the source chart', () => {
    const t = make('prog:ii-V-I:transpose');
    expect(d12Explain(t, { chords: ['Am', 'D', 'C'] })).toEqual([
      'Chord 3 is the I: C in C major, G in G major, not C.',
    ]);
    expect(d12Explain(t, { chords: ['Am', 'D'] })).toEqual([
      'Chord 3 is the I: C in C major, G in G major.',
    ]);
  });

  it('counts bars past the first few', () => {
    const blues = make('prog:12-bar-blues:build');
    const lines = d12Explain(blues, { chords: blues.expected.map(() => 'D7') });
    expect(lines[0]).toBe('Bar 1 is the I7 in C major: C7, not D7.');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe('…and 9 more.');
  });
});

describe('D12 words', () => {
  it('prettifies chords, keys and numerals', () => {
    expect(pretty('F#m')).toBe('F♯m');
    expect(pretty('Bb7')).toBe('B♭7');
    expect(pretty('Eb major')).toBe('E♭ major');
    expect(pretty('bVII')).toBe('♭VII');
    expect(pretty('i–bVII–bVI–bVII')).toBe('i–♭VII–♭VI–♭VII');
    expect(pretty('vi')).toBe('vi');
  });

  it('speaks chords', () => {
    expect(spokenChord('F#m')).toBe('F sharp minor');
    expect(spokenChord('Bb7')).toBe('B flat 7');
    expect(spokenChord('C')).toBe('C');
    expect(spokenChord('Bdim')).toBe('B diminished');
  });

  it('calls a blues slot a bar', () => {
    expect(d12SlotNoun(make('prog:12-bar-blues:build'))).toBe('bar');
    expect(d12SlotNoun(make('prog:I-IV-V:build'))).toBe('chord');
  });

  it('names a transposition’s progression only when asked to', () => {
    const b = make('prog:I-IV-V:build');
    const t = make('prog:I-IV-V:transpose');
    expect(d12Subject(b, false)).toBe('I–IV–V');
    expect(d12Subject(t, false)).toBe('Transpose the chart');
    expect(d12Subject(t, true)).toBe('I–IV–V');
    expect(d12Task(b)).toBe('Build it in C major');
    expect(d12Task(t)).toBe('Move it from C major to G major');
  });

  it('works the example for the first rep', () => {
    expect(d12WorkedExample(make('prog:I-IV-V:build'))).toBe('In C major, I–IV–V is C F G.');
    expect(d12WorkedExample(make('prog:I-IV-V:transpose'))).toBe(
      'In C major this is I–IV–V. Each chord keeps its numeral, so in G major it is G C D.',
    );
  });

  it('lists the key’s chords for the panel', () => {
    expect(d12KeyChords(make('prog:i-bVII-bVI-bVII:build')).map((c) => c.symbol)).toEqual([
      'Am',
      'Bdim',
      'C',
      'Dm',
      'Em',
      'F',
      'G',
    ]);
    // A blues lists its own dominant 7s, not the key's triads.
    expect(d12KeyChords(make('prog:12-bar-blues:build'))).toEqual([
      { symbol: 'C7', roman: 'I7' },
      { symbol: 'F7', roman: 'IV7' },
      { symbol: 'G7', roman: 'V7' },
    ]);
  });
});

describe('d12Guides', () => {
  it('fades numerals from the tiles, then the source chart, then the slots', () => {
    expect(d12Guides(3)).toEqual({ slotNumerals: true, tileNumerals: true, sourceNumerals: true });
    expect(d12Guides(2)).toEqual({
      slotNumerals: true,
      tileNumerals: false,
      sourceNumerals: true,
    });
    expect(d12Guides(1)).toEqual({
      slotNumerals: true,
      tileNumerals: false,
      sourceNumerals: false,
    });
    expect(d12Guides(0).slotNumerals).toBe(false);
  });
});

describe('D12 grading, sounds and logging', () => {
  const p = make('prog:I-V-vi-IV:build');
  const fb = (answer: D12Answer) => ({ answer, result: d12Check(p, answer) });

  it('grades time per slot', () => {
    expect(d12GradedResponseMs(p, { chords: [] }, 8000)).toBe(2000);
    expect(d12GradedResponseMs(make('prog:12-bar-blues:build'), { chords: [] }, 12_000)).toBe(1000);
  });

  it('plays the roots, and the learner’s when a short chart is wrong', () => {
    expect(d12Sounds(p, fb({ chords: [...p.expected] }))).toEqual({
      expected: ['C3', 'G3', 'A3', 'F3'],
    });
    expect(d12Sounds(p, fb(rotated(p, 2)))).toEqual({
      expected: ['C3', 'G3', 'A3', 'F3'],
      given: ['A3', 'F3', 'C3', 'G3'],
    });
    expect(d12Sounds(p, fb({ chords: ['C'] }))).toEqual({ expected: ['C3', 'G3', 'A3', 'F3'] });
    const blues = make('prog:12-bar-blues:build');
    const wrong = { chords: blues.expected.map(() => 'C7') };
    expect(d12Sounds(blues, { answer: wrong, result: d12Check(blues, wrong) }).given).toBe(
      undefined,
    );
  });

  it('logs the chart as chord symbols', () => {
    expect(d12DescribeAnswer({ chords: ['C', 'G', 'Am', 'F'] })).toBe('C G Am F');
  });
});

describe('editing the chart', () => {
  const p = make('prog:I-V-vi-IV:build');

  it('places, moves (swapping) and clears chords', () => {
    let s = emptySlots(p);
    expect(s).toEqual([null, null, null, null]);
    s = placeChord(s, 0, 'C');
    s = placeChord(s, 2, 'Am');
    expect(s).toEqual(['C', null, 'Am', null]);
    expect(moveChord(s, 0, 2)).toEqual(['Am', null, 'C', null]);
    expect(moveChord(s, 0, 1)).toEqual([null, 'C', 'Am', null]);
    expect(moveChord(s, 2, 2)).toEqual(s);
    expect(clearSlot(s, 0)).toEqual([null, null, 'Am', null]);
  });

  it('finds the next empty slot, wrapping round', () => {
    expect(nextEmpty(['C', null, 'Am', null], 2)).toBe(3);
    expect(nextEmpty(['C', null, 'Am', 'F'], 3)).toBe(1);
    expect(nextEmpty(['C', 'G', 'Am', 'F'], 4)).toBe(3);
    expect(nextEmpty(['C', 'G', 'Am', 'F'], 1)).toBe(1);
    expect(isFull(['C', 'G'])).toBe(true);
    expect(isFull(['C', null])).toBe(false);
  });

  it('maps keys to tiles, undo and check', () => {
    expect(d12KeyAction('1', 6)).toEqual({ type: 'tile', index: 0 });
    expect(d12KeyAction('7', 6)).toBeNull();
    expect(d12KeyAction('Backspace', 6)).toEqual({ type: 'undo' });
    expect(d12KeyAction('Enter', 6)).toEqual({ type: 'check' });
    expect(d12KeyAction('x', 6)).toBeNull();
  });

  it('moves a keyboard drag’s target across rows of four', () => {
    expect(d12MoveTarget('ArrowRight', 0, 4, 4)).toBe(1);
    expect(d12MoveTarget('ArrowRight', 3, 4, 4)).toBe(3);
    expect(d12MoveTarget('ArrowLeft', 0, 4, 4)).toBe(0);
    expect(d12MoveTarget('ArrowDown', 1, 12, 4)).toBe(5);
    expect(d12MoveTarget('ArrowDown', 9, 12, 4)).toBe(9);
    expect(d12MoveTarget('ArrowUp', 5, 12, 4)).toBe(1);
    expect(d12MoveTarget('ArrowUp', 1, 12, 4)).toBe(1);
    expect(d12MoveTarget('Home', 7, 12, 4)).toBe(0);
    expect(d12MoveTarget('End', 0, 12, 4)).toBe(11);
    expect(d12MoveTarget('a', 0, 12, 4)).toBeNull();
    expect(d12Columns(3)).toBe(3);
    expect(d12Columns(12)).toBe(4);
  });
});
