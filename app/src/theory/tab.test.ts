import { describe, expect, it } from 'vitest';
import { DROP_D_TUNING, MAX_FRET, STANDARD_TUNING, allStrings, type Tuning } from './fretboard';
import {
  TabParseError,
  formatFretToken,
  formatTab,
  lineToString,
  parseFretToken,
  parseTab,
  stringToLine,
  tabEventLabel,
  tabLineName,
  tabLines,
  validatePhrase,
  type TabEvent,
} from './tab';

const SEVEN_STRING: Tuning = {
  id: 'seven',
  name: 'Seven-string (BEADGBE)',
  notes: ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
};

describe('tab lines ↔ strings', () => {
  it('puts string 1 (high E) on the top line', () => {
    expect(lineToString(0)).toBe(1);
    expect(lineToString(5)).toBe(6);
    expect(stringToLine(1)).toBe(0);
    expect(stringToLine(6)).toBe(5);
  });

  it('round-trips every line and string', () => {
    for (const tuning of [STANDARD_TUNING, DROP_D_TUNING, SEVEN_STRING]) {
      for (const string of allStrings(tuning)) {
        expect(lineToString(stringToLine(string, tuning), tuning)).toBe(string);
      }
    }
  });

  it('rejects lines and strings off the staff', () => {
    for (const line of [-1, 6, 0.5, Number.NaN])
      expect(() => lineToString(line)).toThrow(RangeError);
    for (const string of [0, 7, 1.5]) expect(() => stringToLine(string)).toThrow(RangeError);
    expect(lineToString(6, SEVEN_STRING)).toBe(7);
  });

  it('names the lines e B G D A E in standard tuning, top first', () => {
    expect(tabLines().map((l) => l.name)).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
    expect(tabLines().map((l) => l.string)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tabLines().map((l) => l.line)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('names the lines from the tuning', () => {
    expect(tabLines(DROP_D_TUNING).map((l) => l.name)).toEqual(['e', 'B', 'G', 'D', 'A', 'D']);
    expect(tabLines(SEVEN_STRING).map((l) => l.name)).toEqual(['e', 'B', 'G', 'D', 'A', 'E', 'B']);
    const eFlat: Tuning = {
      id: 'eb',
      name: 'Eb',
      notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
    };
    expect(tabLineName(1, eFlat)).toBe('eb');
    expect(tabLineName(6, eFlat)).toBe('Eb');
    expect(() => tabLineName(7)).toThrow(RangeError);
  });
});

describe('fret tokens', () => {
  it('reads every fret on the neck and formats it back', () => {
    for (let fret = 0; fret <= MAX_FRET; fret++) {
      const token = formatFretToken(fret);
      expect(token).toBe(String(fret));
      expect(parseFretToken(token)).toBe(fret);
    }
  });

  it('rejects tokens that are not frets', () => {
    for (const token of ['', '-', '25', '99', '100', '05', '00', '-1', '3h5', 'x', ' 3', '1.5']) {
      expect(parseFretToken(token)).toBeNull();
    }
  });

  it('refuses to format frets off the neck', () => {
    for (const fret of [-1, 25, 2.5]) expect(() => formatFretToken(fret)).toThrow(RangeError);
  });
});

describe('formatTab', () => {
  it('writes a single note as e|--3--|', () => {
    expect(formatTab([{ string: 1, fret: 3 }]).split('\n')).toEqual([
      'e|--3--|',
      'B|-----|',
      'G|-----|',
      'D|-----|',
      'A|-----|',
      'E|-----|',
    ]);
  });

  it('gives each event its own column, widened for two-digit frets', () => {
    const phrase: TabEvent[] = [
      { string: 3, fret: 5 },
      { string: 2, fret: 12 },
      { string: 3, fret: 7 },
    ];
    expect(formatTab(phrase)).toBe(
      [
        'e|------------|',
        'B|-----12-----|',
        'G|--5------7--|',
        'D|------------|',
        'A|------------|',
        'E|------------|',
      ].join('\n'),
    );
  });

  it('keeps every line the same length', () => {
    const phrase: TabEvent[] = allStrings().flatMap((string) => [
      { string, fret: 0 },
      { string, fret: 24 },
    ]);
    const lines = formatTab(phrase).split('\n');
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
  });

  it('writes an empty phrase as bare lines', () => {
    expect(formatTab([]).split('\n')[0]).toBe('e|--|');
  });

  it('pads names to one width for other tunings', () => {
    const eFlat: Tuning = {
      id: 'eb',
      name: 'Eb',
      notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
    };
    const lines = formatTab([{ string: 6, fret: 0 }], eFlat).split('\n');
    expect(lines[0]).toBe('eb|-----|');
    expect(lines[5]).toBe('Eb|--0--|');
    expect(formatTab([{ string: 7, fret: 2 }], SEVEN_STRING).split('\n')).toHaveLength(7);
  });

  it('rejects events off the neck or the tuning', () => {
    expect(() => formatTab([{ string: 7, fret: 0 }])).toThrow(RangeError);
    expect(() => formatTab([{ string: 1, fret: 25 }])).toThrow(RangeError);
    expect(() => validatePhrase([{ string: 0, fret: 1 }])).toThrow(RangeError);
    const ok: TabEvent[] = [{ string: 6, fret: 3 }];
    expect(validatePhrase(ok)).toBe(ok);
  });
});

describe('parseTab', () => {
  it('reads e|--3--|', () => {
    const tab = ['e|--3--|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|', 'E|-----|'].join('\n');
    expect(parseTab(tab)).toEqual([{ string: 1, fret: 3 }]);
  });

  it('reads notes left to right, whatever line they are on', () => {
    const tab = `
      e|-------0-----|
      B|-----1-------|
      G|---2---------|
      D|-------------|
      A|-3-------10--|
      E|-------------|`;
    expect(parseTab(tab)).toEqual([
      { string: 5, fret: 3 },
      { string: 3, fret: 2 },
      { string: 2, fret: 1 },
      { string: 1, fret: 0 },
      { string: 5, fret: 10 },
    ]);
  });

  it('round-trips formatTab for every string and fret', () => {
    for (const tuning of [STANDARD_TUNING, DROP_D_TUNING, SEVEN_STRING]) {
      const phrase: TabEvent[] = [];
      for (const string of allStrings(tuning)) {
        for (let fret = 0; fret <= MAX_FRET; fret++) phrase.push({ string, fret });
      }
      expect(parseTab(formatTab(phrase, tuning), tuning)).toEqual(phrase);
    }
  });

  it('accepts unnamed lines, mid-line bar lines, spaces and missing end bars', () => {
    const tab = [
      '|--3--|--5-',
      '|-----|----',
      '|-----|----',
      '|-----|----',
      '|-----|----',
      '|-----|----',
    ];
    expect(parseTab(tab.join('\n'))).toEqual([
      { string: 1, fret: 3 },
      { string: 1, fret: 5 },
    ]);
    const spaced = ['e |- 3 -|', 'B |-----|', 'G |-----|', 'D |-----|', 'A |-----|', 'E |-----|'];
    expect(parseTab(spaced.join('\r\n'))).toEqual([{ string: 1, fret: 3 }]);
  });

  it('accepts upper-case and enharmonic line names', () => {
    const tab = ['E|-3-|', 'B|---|', 'G|---|', 'D|---|', 'A|---|', 'Fb|-1-|'];
    // Fb names the low E line; both notes are in one column, so they sound together.
    expect(() => parseTab(tab.join('\n'))).toThrow(/sound together/);
    const apart = ['E|-3---|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|', 'Fb|---1-|'];
    expect(parseTab(apart.join('\n'))).toEqual([
      { string: 1, fret: 3 },
      { string: 6, fret: 1 },
    ]);
  });

  it('joins blocks (systems) in order, with text between them', () => {
    const block = (fret: number) =>
      [`e|--${fret}--|`, 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|', 'E|-----|'].join('\n');
    const tab = `Riff, part 1\n${block(1)}\n\nPart 2\n${block(2)}`;
    expect(parseTab(tab)).toEqual([
      { string: 1, fret: 1 },
      { string: 1, fret: 2 },
    ]);
  });

  it('reads nothing from text without tab', () => {
    expect(parseTab('')).toEqual([]);
    expect(parseTab('just some words\nand more')).toEqual([]);
  });

  it('reads drop-D tab and checks names against the tuning', () => {
    const dropD = ['e|-----|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|', 'D|--0--|'];
    expect(parseTab(dropD.join('\n'), DROP_D_TUNING)).toEqual([{ string: 6, fret: 0 }]);
    expect(() => parseTab(dropD.join('\n'))).toThrow(TabParseError);
  });

  it('reports a block with the wrong number of lines', () => {
    const five = ['e|--3--|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|'].join('\n');
    expect(() => parseTab(`intro\n${five}`)).toThrow(
      new TabParseError('A tab block needs 6 lines, one per string, not 5', { line: 2 }),
    );
    const seven = ['e|-|', 'B|-|', 'G|-|', 'D|-|', 'A|-|', 'E|-|', 'B|-|'].join('\n');
    expect(parseTab(seven, SEVEN_STRING)).toEqual([]);
    expect(() => parseTab(seven)).toThrow(/not 7/);
  });

  it('reports a misnamed line with its position', () => {
    const tab = ['e|--3--|', 'B|-----|', 'A|-----|', 'D|-----|', 'A|-----|', 'E|-----|'];
    try {
      parseTab(tab.join('\n'));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TabParseError);
      const err = e as TabParseError;
      expect(err.line).toBe(3);
      expect(err.column).toBe(1);
      expect(err.message).toBe('Line "A" is in the place of string 3 (G) (line 3, column 1)');
    }
  });

  it('reports frets off the neck', () => {
    const tab = ['e|--25--|', 'B|------|', 'G|------|', 'D|------|', 'A|------|', 'E|------|'];
    expect(() => parseTab(tab.join('\n'))).toThrow(
      new TabParseError('"25" is not a fret from 0 to 24', { line: 1, column: 5 }),
    );
    tab[0] = 'e|--05--|';
    expect(() => parseTab(tab.join('\n'))).toThrow(/"05" is not a fret/);
  });

  it('reports technique symbols it does not read', () => {
    for (const sym of ['h', 'p', '/', '\\', 'b', 'x', '~']) {
      const tab = [
        `e|--5${sym}7--|`,
        'B|--------|',
        'G|--------|',
        'D|--------|',
        'A|--------|',
        'E|--------|',
      ];
      expect(() => parseTab(tab.join('\n'))).toThrow(
        new TabParseError(`Unsupported tab symbol "${sym}"`, { line: 1, column: 6 }),
      );
    }
  });

  it('refuses chords and overlapping two-digit frets', () => {
    const chord = ['e|--0--|', 'B|--1--|', 'G|-----|', 'D|-----|', 'A|-----|', 'E|-----|'];
    expect(() => parseTab(chord.join('\n'))).toThrow(
      new TabParseError('Strings 1 and 2 sound together; a phrase is one note at a time', {
        line: 2,
        column: 5,
      }),
    );
    const overlap = ['e|--12--|', 'B|---3--|', 'G|------|', 'D|------|', 'A|------|', 'E|------|'];
    expect(() => parseTab(overlap.join('\n'))).toThrow(/Strings 1 and 2/);
  });

  it('counts columns from the bar line, so name widths may differ', () => {
    const tab = ['e |--3---|', 'B|------|', 'G|------|', 'D|------|', 'A|------|', 'Eb|---1--|'];
    expect(() => parseTab(tab.join('\n'))).toThrow(TabParseError);
    tab[5] = 'E  |---1--|';
    expect(parseTab(tab.join('\n'))).toEqual([
      { string: 1, fret: 3 },
      { string: 6, fret: 1 },
    ]);
  });
});

describe('TabParseError', () => {
  it('carries an optional position', () => {
    const bare = new TabParseError('nope');
    expect(bare.message).toBe('nope');
    expect(bare.line).toBeUndefined();
    expect(bare.name).toBe('TabParseError');
    expect(new TabParseError('nope', { line: 4 }).message).toBe('nope (line 4)');
  });
});

describe('tabEventLabel', () => {
  it('reads "string 3, fret 5"', () => {
    expect(tabEventLabel({ string: 3, fret: 5 })).toBe('string 3, fret 5');
  });
});
