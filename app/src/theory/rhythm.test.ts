import { describe, expect, it } from 'vitest';
import { alignOnsets } from '../timing/grade';
import { tempoMap, timeAtPulse } from '../timing/tempo';
import { barLength, frac, fracToString, parseTimeSignature, pulseLength } from './meter';
import {
  RHYTHM_CELLS,
  TRIPLET,
  barFromCells,
  beamGroups,
  cellBar,
  cellLength,
  cellsFor,
  checkBar,
  countSyllables,
  durationCode,
  eventLength,
  eventStarts,
  formatRhythm,
  onsetPulses,
  onsetTimesMs,
  onsets,
  parseRhythm,
  rhythmCell,
  rhythmCellId,
  rhythmLength,
  type RhythmEvent,
} from './rhythm';

const ts = parseTimeSignature;
const r = parseRhythm;
const len = (text: string) => fracToString(rhythmLength(r(text)));

describe('the text form', () => {
  it('reads values, dots, rests and ties', () => {
    expect(r('4 8. r16 2~ 2')).toEqual<RhythmEvent[]>([
      { value: 4 },
      { value: 8, dots: 1 },
      { value: 16, rest: true },
      { value: 2, tie: true },
      { value: 2 },
    ]);
    expect(r('1..')).toEqual([{ value: 1, dots: 2 }]);
  });

  it('reads tuplets, with or without what they are in', () => {
    expect(r('3[8 8 8]')).toEqual(Array(3).fill({ value: 8, tuplet: TRIPLET }));
    expect(r('3:2[ 8 8 8 ]')).toEqual(r('3[8 8 8]'));
    expect(r('5[16 16 16 16 16]')[0]!.tuplet).toEqual({ num: 5, inSpaceOf: 4 });
    expect(r('6[16 16 16 16 16 16]')[0]!.tuplet).toEqual({ num: 6, inSpaceOf: 4 });
    expect(r('7[16 16 16 16 16 16 16]')[0]!.tuplet).toEqual({ num: 7, inSpaceOf: 4 });
    expect(r('2:3[8 8]')[0]!.tuplet).toEqual({ num: 2, inSpaceOf: 3 });
    expect(r('3[8]')).toEqual([{ value: 8, tuplet: TRIPLET }]);
    expect(r('4 3[8 r8 8] 4')).toEqual([
      { value: 4 },
      { value: 8, tuplet: TRIPLET },
      { value: 8, rest: true, tuplet: TRIPLET },
      { value: 8, tuplet: TRIPLET },
      { value: 4 },
    ]);
  });

  it('rejects bad tokens and tuplets', () => {
    for (const bad of [
      '',
      '   ',
      '3',
      '12',
      '4...',
      'q',
      'r4~',
      '8]',
      '3[8 8 8',
      '3[3[8 8 8] 8 8]',
      '2[8 8]',
      '4[8 8 8 8]',
      '1[4]',
      '3:3[8 8 8]',
      '3:0[8 8 8]',
      '3[]',
    ])
      expect(() => r(bad), bad).toThrow(RangeError);
  });

  it('round-trips through formatRhythm', () => {
    for (const text of [
      '4 8. 16 r4 4~ 4',
      '3[8 8 8] 2:3[8 8] 5[16 16 16 16 16]',
      '4:3[8 8 8 8]',
      '3[8 8 8] 4 3[4 8]',
      '1..',
    ]) {
      expect(formatRhythm(r(text)), text).toBe(text);
      expect(r(formatRhythm(r(text)))).toEqual(r(text));
    }
    expect(formatRhythm(r('3:2[8 8 8]'))).toBe('3[8 8 8]');
  });

  it('gives VexFlow duration codes', () => {
    expect([1, 2, 4, 8, 16, 32, 64].map((v) => durationCode(v as 1))).toEqual([
      'w',
      'h',
      'q',
      '8',
      '16',
      '32',
      '64',
    ]);
  });
});

describe('lengths', () => {
  it('measures dots, tuplets and ties', () => {
    expect(fracToString(eventLength({ value: 8, tuplet: TRIPLET }))).toBe('1/12');
    expect(fracToString(eventLength({ value: 8, dots: 1 }))).toBe('3/16');
    expect(fracToString(eventLength({ value: 8, tuplet: { num: 2, inSpaceOf: 3 } }))).toBe('3/16');
    expect(len('8. 16')).toBe('1/4');
    expect(len('3[8 8 8]')).toBe('1/4');
    expect(len('3[4 4 4]')).toBe('1/2');
    expect(len('5[16 16 16 16 16]')).toBe('1/4');
    expect(len('2:3[8 8]')).toBe('3/8');
    expect(len('4~ 4')).toBe('1/2');
    expect(len('4. 8 2')).toBe('1');
  });

  it('places each event', () => {
    expect(eventStarts(r('8. 16 3[8 8 8] 4')).map(fracToString)).toEqual([
      '0',
      '3/16',
      '1/4',
      '1/3',
      '5/12',
      '1/2',
    ]);
  });
});

describe('bar fill', () => {
  it('says whether a bar is full, short or over', () => {
    const exact = checkBar(r('4 4 4 4'), ts('4/4'));
    expect(exact).toMatchObject({ fill: 'exact', ok: true });
    expect(fracToString(exact.remaining)).toBe('0');

    const short = checkBar(r('4 4 4'), ts('4/4'));
    expect(short).toMatchObject({ fill: 'short', ok: false });
    expect(fracToString(short.remaining)).toBe('1/4');

    const over = checkBar(r('2 2 4'), ts('3/4'));
    expect(over).toMatchObject({ fill: 'over', ok: false });
    expect(fracToString(over.remaining)).toBe('-1/2');
    expect(fracToString(over.length)).toBe('5/4');
    expect(fracToString(over.bar)).toBe('3/4');
  });

  it('fills compound, odd and cut-time bars', () => {
    expect(checkBar(r('4. 4.'), ts('6/8')).ok).toBe(true);
    expect(checkBar(r('8 8 8 4 8'), ts('6/8')).ok).toBe(true);
    expect(checkBar(r('4 4 4.'), ts('7/8')).ok).toBe(true);
    expect(checkBar(r('4. 4 4'), ts('7/8 (3+2+2)')).ok).toBe(true);
    expect(checkBar(r('2 2'), ts('¢')).ok).toBe(true);
    expect(checkBar(r('4. 4. 4. 4.'), ts('12/8')).ok).toBe(true);
    expect(checkBar(r('3[8 8 8] 3[8 8 8] 2'), ts('4/4')).ok).toBe(true);
  });

  it('flags a 3/4 rhythm written in 6/8', () => {
    const c = checkBar(r('4 4 4'), ts('6/8'));
    expect(c.fill).toBe('exact');
    expect(c.hiddenBeats).toEqual([1]);
    expect(c.ok).toBe(false);
    expect(checkBar(r('4 4 4'), ts('3/4')).ok).toBe(true);
  });

  it('flags a 6/8 rhythm written in 3/4', () => {
    expect(checkBar(r('4. 4.'), ts('3/4')).hiddenBeats).toEqual([1]);
  });

  it('allows the syncopation but not across the middle of 4/4', () => {
    expect(checkBar(r('8 4 8 2'), ts('4/4')).ok).toBe(true);
    expect(checkBar(r('8 4 8 8 4 8'), ts('4/4')).ok).toBe(true);
    expect(checkBar(r('8 4 4 4 8'), ts('4/4')).hiddenBeats).toEqual([2]);
    expect(checkBar(r('4 8 4 8 4'), ts('4/4')).hiddenBeats).toEqual([2]);
    expect(checkBar(r('8 4 4 8'), ts('3/4')).ok).toBe(true);
    // Longer than a beat from off the beat hides one.
    expect(checkBar(r('8 4. 4 4'), ts('4/4')).hiddenBeats).toEqual([1]);
    // A note from a beat may last whole beats, across the middle too.
    expect(checkBar(r('4 2 4'), ts('4/4')).ok).toBe(true);
    // In 6/8, 8 4 | 4 8 keeps both beats in view.
    expect(checkBar(r('8 4 4 8'), ts('6/8')).ok).toBe(true);
  });

  it('flags rests that hide the beat too', () => {
    expect(checkBar(r('8 r4 8 2'), ts('4/4')).ok).toBe(true);
    expect(checkBar(r('8 r4. 4 4'), ts('4/4')).hiddenBeats).toEqual([1]);
  });

  it('flags tuplets that do not add up', () => {
    const c = checkBar(r('4 3[8 8] 8 2'), ts('4/4'));
    expect(c.brokenTuplets).toEqual([1]);
    expect(c.ok).toBe(false);
    expect(checkBar(r('3[8 8 8 8 8 8] 2'), ts('4/4')).brokenTuplets).toEqual([]);
    expect(checkBar(r('3[4 8] 4 2'), ts('4/4')).ok).toBe(true);
    expect(checkBar(r('2:3[8 8] 4.'), ts('6/8')).ok).toBe(true);
    // Two runs side by side, one broken.
    const tuplets = [...r('3[8 8 8]'), ...r('5[16 16 16 16]'), ...r('16 2')];
    expect(checkBar(tuplets, ts('4/4')).brokenTuplets).toEqual([3]);
  });

  it('flags ties into and out of rests', () => {
    const rest: RhythmEvent = { value: 4, rest: true, tie: true };
    expect(checkBar([rest, ...r('4 2')], ts('4/4')).badTies).toEqual([0]);
    expect(checkBar(r('4~ r4 2'), ts('4/4')).badTies).toEqual([0]);
    expect(checkBar(r('4~ 4 2'), ts('4/4')).badTies).toEqual([]);
    // A tie over the barline is fine.
    expect(checkBar(r('2 2~'), ts('4/4')).ok).toBe(true);
  });
});

describe('beaming', () => {
  it('beams eighths by the beat in simple time', () => {
    expect(beamGroups(r('8 8 8 8 8 8 8 8'), ts('4/4'))).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ]);
    expect(beamGroups(r('8. 16 16 16 16 16 4 4'), ts('4/4'))).toEqual([
      [0, 1],
      [2, 3, 4, 5],
    ]);
    expect(beamGroups(r('8 8 8 8'), ts('2/2'))).toEqual([[0, 1, 2, 3]]);
  });

  it('beams in dotted quarters in compound time and by group in odd meters', () => {
    expect(beamGroups(r('8 8 8 8 8 8'), ts('6/8'))).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(beamGroups(r('8 8 8 8 8 8'), ts('3/4'))).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
    expect(beamGroups(r('8 8 8 8 8 8 8'), ts('7/8'))).toEqual([
      [0, 1],
      [2, 3],
      [4, 5, 6],
    ]);
    expect(beamGroups(r('8 8 8 8 8 8 8'), ts('7/8 (3+2+2)'))).toEqual([
      [0, 1, 2],
      [3, 4],
      [5, 6],
    ]);
    expect(beamGroups(r('8 8 8'), ts('3/8'))).toEqual([[0, 1, 2]]);
  });

  it('breaks beams at rests, long notes, spans and tuplet changes', () => {
    expect(beamGroups(r('8 r8 8 8 4 8 8'), ts('4/4'))).toEqual([
      [2, 3],
      [5, 6],
    ]);
    expect(beamGroups(r('3[8 8 8] 8 8 2'), ts('4/4'))).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    expect(beamGroups(r('4 4 4 4'), ts('4/4'))).toEqual([]);
    // The eighth running across beat 2 beams with nothing.
    expect(beamGroups(r('16 8 8 16 2'), ts('4/4'))).toEqual([[0, 1]]);
    // Past the end of the bar nothing beams.
    expect(beamGroups(r('2 2 8 8'), ts('4/4'))).toEqual([]);
    expect(beamGroups(r('2:3[8 8] 8 8 8'), ts('6/8'))).toEqual([
      [0, 1],
      [2, 3, 4],
    ]);
  });
});

describe('onsets', () => {
  it('skips rests and tied continuations', () => {
    const os = onsets(r('4 r8 8 4~ 8 8'));
    expect(os.map((o) => o.index)).toEqual([0, 2, 3, 5]);
    expect(os.map((o) => fracToString(o.at))).toEqual(['0', '3/8', '1/2', '7/8']);
    expect(os.map((o) => fracToString(o.length))).toEqual(['1/4', '1/8', '3/8', '1/8']);
  });

  it('chains ties and starts again after a rest', () => {
    const os = onsets(r('4~ 4~ 4 4'));
    expect(os.map((o) => [o.index, fracToString(o.length)])).toEqual([
      [0, '3/4'],
      [3, '1/4'],
    ]);
    const afterRest = onsets([{ value: 4, rest: true, tie: true }, ...r('4 2')]);
    expect(afterRest.map((o) => o.index)).toEqual([1, 2]);
  });

  it('counts attacks in pulses', () => {
    const pulses = onsetPulses(r('8. 16 3[8 8 8] 2'), pulseLength(ts('4/4')));
    expect(pulses.map((p) => +p.toFixed(9))).toEqual([0, 0.75, 1, 1.333333333, 1.666666667, 2]);
    expect(onsetPulses(r('4. 8 4'), pulseLength(ts('6/8')))).toEqual([0, 3, 4]);
  });

  it('times attacks at a tempo', () => {
    expect(onsetTimesMs(r('8. 16 4 2'), { bpm: 120 })).toEqual([0, 375, 500, 1000]);
    expect(onsetTimesMs(r('4. 4.'), { bpm: 180, pulse: frac(1, 8), startMs: 1000 })).toEqual([
      1000, 2000,
    ]);
    expect(() => onsetTimesMs(r('4'), { bpm: 0 })).toThrow(RangeError);
    expect(() => onsetTimesMs(r('4'), { bpm: Number.NaN })).toThrow(RangeError);
  });

  it('feeds the timing engine through its tempo map', () => {
    const t = ts('6/8');
    const map = tempoMap(180, 5000);
    const barStart = 6; // the second bar
    const targets = onsetPulses(r('8. 16 8 4.'), pulseLength(t)).map((p) =>
      timeAtPulse(map, barStart + p),
    );
    expect(targets.map(Math.round)).toEqual([7000, 7500, 7667, 8000]);
    const { offsets } = alignOnsets(targets, [7010, 7490, 7670, 8005]);
    expect(offsets.map((o) => o && Math.round(o))).toEqual([10, -10, 3, 5]);
  });
});

describe('counting syllables (T3)', () => {
  it('counts simple time in 1 e & a', () => {
    expect(countSyllables(r('8. 16 16 16 16 16 3[8 8 8] 4'), ts('4/4'))).toEqual([
      '1',
      'a',
      '2',
      'e',
      '&',
      'a',
      '3',
      'trip',
      'let',
      '4',
    ]);
  });

  it('counts compound time in 1 la li', () => {
    expect(countSyllables(r('8 8 8 16 16 16 16 16 16'), ts('6/8'))).toEqual([
      '1',
      'la',
      'li',
      '2',
      'ta',
      'la',
      'ta',
      'li',
      'ta',
    ]);
  });

  it('counts odd groups by their size, and later bars like the first', () => {
    expect(countSyllables(r('8 8 8 8 8 8 8'), ts('7/8'))).toEqual([
      '1',
      '&',
      '2',
      '&',
      '3',
      'la',
      'li',
    ]);
    expect(countSyllables(r('2 2 4 4 4 4'), ts('4/4'))).toEqual(['1', '3', '1', '2', '3', '4']);
  });

  it('leaves odd positions blank', () => {
    expect(countSyllables(r('5[16 16 16 16 16]'), ts('2/4'))).toEqual(['1', '', '', '', '']);
  });
});

describe('the rhythm-cell catalogue', () => {
  it('has the design’s example and unique, well-formed IDs', () => {
    expect(rhythmCell('rhythm:dotted-8th-16th').notation).toBe('8. 16');
    const ids = RHYTHM_CELLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of RHYTHM_CELLS) {
      expect(c.id).toBe(rhythmCellId(c.slug));
      expect(c.id).toMatch(/^rhythm:[a-z0-9-]+$/);
      expect(rhythmCell(c.slug)).toBe(c);
      expect(rhythmCell(c.id)).toBe(c);
    }
    expect(() => rhythmCell('rhythm:waltz')).toThrow(RangeError);
  });

  it('is in teaching order', () => {
    const stages = RHYTHM_CELLS.map((c) => c.stage);
    expect(stages).toEqual([...stages].sort((a, b) => a - b));
    expect(RHYTHM_CELLS[0]!.slug).toBe('quarter');
  });

  it('makes every cell last whole beats of its feel and pass the bar rules', () => {
    for (const c of RHYTHM_CELLS) {
      const beat = c.feel === 'simple' ? frac(1, 4) : frac(3, 8);
      expect(cellLength(c), c.slug).toEqual(frac(beat.n * c.beats, beat.d));
      expect(formatRhythm(c.rhythm), c.slug).toBe(c.notation);
      const host = ts(c.feel === 'simple' ? '4/4' : '12/8');
      const bar = checkBar(c.rhythm, host);
      expect(bar.hiddenBeats, c.slug).toEqual([]);
      expect(bar.brokenTuplets, c.slug).toEqual([]);
    }
  });

  it('pairs confusables with cells of the same feel that exist', () => {
    for (const c of RHYTHM_CELLS) {
      if (!c.confusable) continue;
      const other = rhythmCell(c.confusable);
      expect(other.slug).not.toBe(c.slug);
      if (c.slug !== 'three-8ths') expect(other.feel, c.slug).toBe(c.feel);
    }
    // Interleave dotted against straight (design §12).
    expect(rhythmCell('dotted-8th-16th').confusable).toBe('two-8ths');
    // And triplets against compound eighths.
    expect(rhythmCell('three-8ths').confusable).toBe('8th-triplet');
  });
});

describe('cells as bars', () => {
  it('repeats a cell to fill a bar', () => {
    expect(formatRhythm(cellBar(rhythmCell('dotted-8th-16th'), ts('4/4')))).toBe(
      '8. 16 8. 16 8. 16 8. 16',
    );
    expect(formatRhythm(cellBar(rhythmCell('three-8ths'), ts('6/8')))).toBe('8 8 8 8 8 8');
    expect(formatRhythm(cellBar(rhythmCell('half'), ts('¢')))).toBe('2 2');
    expect(formatRhythm(cellBar(rhythmCell('8th-quarter-8th'), ts('4/4')))).toBe('8 4 8 8 4 8');
    expect(formatRhythm(cellBar(rhythmCell('two-8ths'), ts('5/4')))).toBe('8 8 8 8 8 8 8 8 8 8');
  });

  it('refuses cells that do not fit the meter', () => {
    expect(() => cellBar(rhythmCell('two-8ths'), ts('6/8'))).toThrow(/doesn't fit/);
    expect(() => cellBar(rhythmCell('three-8ths'), ts('4/4'))).toThrow(/doesn't divide/);
    expect(() => cellBar(rhythmCell('dotted-quarter-8th'), ts('12/8'))).toThrow(/doesn't fit/);
    expect(() => cellBar(rhythmCell('half'), ts('3/4'))).toThrow(/doesn't divide/);
    expect(() => cellBar(rhythmCell('quarter'), ts('3/8'))).toThrow(/doesn't/);
    expect(() => cellBar(rhythmCell('two-8ths'), ts('7/8'))).toThrow(/doesn't/);
  });

  it('builds odd bars beat by beat', () => {
    const bar = barFromCells(
      ['two-8ths', 'dotted-8th-16th', 'three-8ths'].map(rhythmCell),
      ts('7/8'),
    );
    expect(formatRhythm(bar)).toBe('8 8 8. 16 8 8 8');
    expect(checkBar(bar, ts('7/8')).ok).toBe(true);
    expect(() =>
      barFromCells(['three-8ths', 'two-8ths', 'two-8ths'].map(rhythmCell), ts('7/8')),
    ).toThrow(/doesn't fit beat 1/);
  });

  it('refuses bars that are short, over or hide the middle', () => {
    expect(() => barFromCells([rhythmCell('half')], ts('4/4'))).toThrow(/short/);
    expect(() => barFromCells(['half', 'half', 'quarter'].map(rhythmCell), ts('4/4'))).toThrow(
      /past the barline/,
    );
    expect(() =>
      barFromCells(['quarter', 'half', 'quarter'].map(rhythmCell), ts('4/4')),
    ).not.toThrow();
    expect(() =>
      barFromCells(['quarter', '8th-quarter-8th', 'quarter'].map(rhythmCell), ts('4/4')),
    ).toThrow(/hide a beat/);
  });

  it('lists the cells each meter takes', () => {
    const simple = cellsFor(ts('4/4'));
    expect(simple.length).toBeGreaterThan(10);
    expect(simple.every((c) => c.feel === 'simple')).toBe(true);
    expect(cellsFor(ts('3/4')).some((c) => c.beats === 2)).toBe(false);
    const compound = cellsFor(ts('6/8'));
    expect(compound.map((c) => c.slug)).toContain('siciliano');
    expect(compound.every((c) => c.feel === 'compound')).toBe(true);
    expect(cellsFor(ts('7/8'))).toEqual([]);
    expect(cellsFor(ts('3/8'))).toEqual([]);
    for (const c of compound)
      expect(barLength(ts('6/8'))).toEqual(rhythmLength(cellBar(c, ts('6/8'))));
  });
});
