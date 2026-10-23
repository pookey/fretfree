import { describe, expect, it } from 'vitest';
import { METER_PRESETS } from '../timing/meter';
import {
  COMMON_TIME,
  CUT_TIME,
  NOTE_VALUES,
  ZERO,
  barLength,
  beamSpans,
  beatUnit,
  beats,
  clickMeter,
  defaultGroups,
  describeMeter,
  durationLength,
  durationName,
  feltBeats,
  frac,
  fracAdd,
  fracCmp,
  fracDiv,
  fracEq,
  fracMul,
  fracSub,
  fracSum,
  fracToNumber,
  fracToString,
  isCutTime,
  isDyadic,
  isNoteValue,
  meterKind,
  noteLength,
  parseTimeSignature,
  pulseLength,
  timeSignature,
  timeSignatureName,
  vexflowBeamGroups,
  type TimeSignature,
} from './meter';

const ts = parseTimeSignature;

describe('fractions', () => {
  it('reduces and normalises the sign', () => {
    expect(frac(2, 4)).toEqual({ n: 1, d: 2 });
    expect(frac(3, -6)).toEqual({ n: -1, d: 2 });
    expect(frac(0, 7)).toEqual({ n: 0, d: 1 });
    expect(frac(0, -7)).toEqual({ n: 0, d: 1 });
    expect(frac(5)).toEqual({ n: 5, d: 1 });
    expect(ZERO).toEqual({ n: 0, d: 1 });
  });

  it('rejects non-integers and zero denominators', () => {
    expect(() => frac(1, 0)).toThrow(RangeError);
    expect(() => frac(0.5, 2)).toThrow(RangeError);
    expect(() => frac(1, 1.5)).toThrow(RangeError);
  });

  it('does exact arithmetic', () => {
    expect(fracAdd(frac(1, 4), frac(1, 8))).toEqual(frac(3, 8));
    expect(fracSub(frac(1, 4), frac(3, 8))).toEqual(frac(-1, 8));
    expect(fracMul(frac(1, 8), frac(2, 3))).toEqual(frac(1, 12));
    expect(fracDiv(frac(3, 8), frac(1, 8))).toEqual(frac(3));
    expect(() => fracDiv(frac(1), ZERO)).toThrow(RangeError);
    expect(fracSum([frac(1, 12), frac(1, 12), frac(1, 12)])).toEqual(frac(1, 4));
    expect(fracSum([])).toEqual(ZERO);
  });

  it('compares, converts and prints', () => {
    expect(fracCmp(frac(1, 3), frac(1, 4))).toBeGreaterThan(0);
    expect(fracCmp(frac(1, 4), frac(2, 8))).toBe(0);
    expect(fracCmp(frac(-1, 4), ZERO)).toBeLessThan(0);
    expect(fracEq(frac(2, 8), frac(1, 4))).toBe(true);
    expect(fracEq(frac(1, 8), frac(1, 4))).toBe(false);
    expect(fracToNumber(frac(3, 8))).toBe(0.375);
    expect(fracToString(frac(3, 8))).toBe('3/8');
    expect(fracToString(frac(2))).toBe('2');
    expect(fracToString(frac(-1, 4))).toBe('-1/4');
  });

  it('knows which lengths plain values can spell', () => {
    expect(isDyadic(frac(3, 8))).toBe(true);
    expect(isDyadic(frac(1))).toBe(true);
    expect(isDyadic(frac(1, 12))).toBe(false);
    expect(isDyadic(frac(1, 6))).toBe(false);
  });
});

describe('note values', () => {
  it('lists the values and checks them', () => {
    expect(NOTE_VALUES).toEqual([1, 2, 4, 8, 16, 32, 64]);
    expect(isNoteValue(16)).toBe(true);
    expect(isNoteValue(12)).toBe(false);
  });

  it('adds half for a dot and a quarter more for a second', () => {
    expect(noteLength(4)).toEqual(frac(1, 4));
    expect(noteLength(4, 1)).toEqual(frac(3, 8));
    expect(noteLength(4, 2)).toEqual(frac(7, 16));
    expect(noteLength(2, 1)).toEqual(frac(3, 4));
    expect(noteLength(8, 1)).toEqual(frac(3, 16));
    expect(noteLength(1)).toEqual(frac(1));
    for (const v of NOTE_VALUES) {
      expect(fracEq(noteLength(v, 1), fracMul(noteLength(v), frac(3, 2)))).toBe(true);
      expect(fracEq(noteLength(v, 2), fracMul(noteLength(v), frac(7, 4)))).toBe(true);
    }
  });

  it('names durations', () => {
    expect(durationName({ value: 4, dots: 1 })).toBe('dotted quarter');
    expect(durationName({ value: 2, dots: 2 })).toBe('double-dotted half');
    expect(durationName({ value: 16, dots: 0 })).toBe('sixteenth');
    expect(durationName({ value: 1, dots: 0 })).toBe('whole');
    expect(durationName({ value: 32, dots: 0 })).toBe('thirty-second');
    expect(durationName({ value: 64, dots: 0 })).toBe('sixty-fourth');
    expect(durationName({ value: 8, dots: 0 })).toBe('eighth');
    expect(durationLength({ value: 4, dots: 1 })).toEqual(frac(3, 8));
  });
});

describe('time signatures', () => {
  it('parses plain, symbol and grouped forms', () => {
    expect(ts('4/4')).toEqual({ top: 4, bottom: 4, groups: [1, 1, 1, 1] });
    expect(ts(' 6/8 ')).toEqual({ top: 6, bottom: 8, groups: [3, 3] });
    expect(ts('7/8 (3+2+2)')).toEqual({ top: 7, bottom: 8, groups: [3, 2, 2] });
    expect(ts('7/8(3+2+2)')).toEqual(ts('7/8 (3+2+2)'));
    expect(ts('3+2+2/8')).toEqual(ts('7/8 (3+2+2)'));
    expect(ts('C')).toBe(COMMON_TIME);
    expect(ts('common')).toBe(COMMON_TIME);
    expect(ts('¢')).toBe(CUT_TIME);
    expect(ts('cut')).toBe(CUT_TIME);
    expect(COMMON_TIME).toEqual({ top: 4, bottom: 4, groups: [1, 1, 1, 1], symbol: 'common' });
    expect(CUT_TIME).toEqual({ top: 2, bottom: 2, groups: [1, 1], symbol: 'cut' });
  });

  it('rejects malformed and impossible signatures', () => {
    for (const bad of [
      '',
      '4',
      '4/',
      '/4',
      '4/3',
      '4/1',
      '4/64',
      '0/4',
      '33/8',
      'x/4',
      '3+2/8 (3+2)',
      '6/8 (2+2)',
    ])
      expect(() => ts(bad), bad).toThrow(RangeError);
    expect(() => timeSignature(7, 8, [2, 2, 2])).toThrow(/add up/);
    expect(() => timeSignature(4, 4, [])).toThrow(RangeError);
    expect(() => timeSignature(4, 4, [2, 2.5, -0.5])).toThrow(RangeError);
    expect(() => timeSignature(4, 4, [0, 4])).toThrow(RangeError);
    expect(() => timeSignature(2.5, 4)).toThrow(RangeError);
  });

  it('allows equal groups only as ones (up to four) or threes', () => {
    expect(() => ts('4/8 (2+2)')).toThrow(RangeError);
    expect(() => ts('6/8 (1+1+1+1+1+1)')).toThrow(RangeError);
    expect(() => timeSignature(3, 8, [3])).toThrow(RangeError);
    expect(() => timeSignature(4, 4, [4])).toThrow(RangeError);
    expect(timeSignature(3, 8, [1, 1, 1])).toEqual(ts('3/8'));
    expect(timeSignature(6, 8, [3, 3])).toEqual(ts('6/8'));
  });

  it('checks the symbols', () => {
    expect(() => timeSignature(3, 4, undefined, 'common')).toThrow(RangeError);
    expect(() => timeSignature(4, 4, undefined, 'cut')).toThrow(RangeError);
  });

  it('groups each top number the usual way', () => {
    expect(defaultGroups(1)).toEqual([1]);
    expect(defaultGroups(3)).toEqual([1, 1, 1]);
    expect(defaultGroups(4)).toEqual([1, 1, 1, 1]);
    expect(defaultGroups(5)).toEqual([3, 2]);
    expect(defaultGroups(6)).toEqual([3, 3]);
    expect(defaultGroups(7)).toEqual([2, 2, 3]);
    expect(defaultGroups(8)).toEqual([3, 3, 2]);
    expect(defaultGroups(9)).toEqual([3, 3, 3]);
    expect(defaultGroups(10)).toEqual([3, 3, 2, 2]);
    expect(defaultGroups(11)).toEqual([3, 3, 3, 2]);
    expect(defaultGroups(12)).toEqual([3, 3, 3, 3]);
    expect(defaultGroups(13)).toEqual([3, 3, 3, 2, 2]);
    for (let top = 1; top <= 32; top += 1) {
      const g = defaultGroups(top);
      expect(
        g.reduce((s, n) => s + n, 0),
        String(top),
      ).toBe(top);
      expect(() => timeSignature(top, 8), String(top)).not.toThrow();
    }
  });

  it('names signatures, with the grouping for odd meters', () => {
    expect(timeSignatureName(ts('4/4'))).toBe('4/4');
    expect(timeSignatureName(CUT_TIME)).toBe('2/2');
    expect(timeSignatureName(ts('12/8'))).toBe('12/8');
    expect(timeSignatureName(ts('7/8'))).toBe('7/8 (2+2+3)');
    expect(timeSignatureName(ts('5/4'))).toBe('5/4 (3+2)');
    expect(timeSignatureName(ts('3+3+2/8'))).toBe('8/8 (3+3+2)');
  });

  it('round-trips every name', () => {
    for (const t of [
      '2/4',
      '3/4',
      '4/4',
      '2/2',
      '3/8',
      '6/8',
      '9/8',
      '12/8',
      '6/4',
      '5/4',
      '7/8',
      '5/8 (2+3)',
      '7/8 (3+2+2)',
      '11/8',
    ])
      expect(ts(timeSignatureName(ts(t))), t).toEqual(ts(t));
  });
});

describe('meter classification (T1, T2, T7)', () => {
  const table: [string, string, number, string | null][] = [
    // signature, kind, felt beats, beat unit
    ['2/4', 'simple', 2, 'quarter'],
    ['3/4', 'simple', 3, 'quarter'],
    ['4/4', 'simple', 4, 'quarter'],
    ['C', 'simple', 4, 'quarter'],
    ['2/2', 'simple', 2, 'half'],
    ['¢', 'simple', 2, 'half'],
    ['3/2', 'simple', 3, 'half'],
    ['3/8', 'simple', 3, 'eighth'],
    ['2/8', 'simple', 2, 'eighth'],
    ['6/8', 'compound', 2, 'dotted quarter'],
    ['9/8', 'compound', 3, 'dotted quarter'],
    ['12/8', 'compound', 4, 'dotted quarter'],
    ['6/4', 'compound', 2, 'dotted half'],
    ['6/16', 'compound', 2, 'dotted eighth'],
    ['5/4', 'odd', 5, 'quarter'],
    ['7/4', 'odd', 7, 'quarter'],
    ['5/8', 'odd', 2, null],
    ['7/8', 'odd', 3, null],
    ['7/8 (3+2+2)', 'odd', 3, null],
    ['3+3+2/8', 'odd', 3, null],
    ['2+2+2+3/8', 'odd', 4, null],
  ];

  it.each(table)('%s is %s with %i felt beats of %s', (text, kind, felt, unit) => {
    const t = ts(text);
    expect(meterKind(t)).toBe(kind);
    expect(feltBeats(t)).toBe(felt);
    const u = beatUnit(t);
    expect(u && durationName(u)).toBe(unit);
    expect(beats(t)).toHaveLength(felt);
  });

  it('spells the felt beats of a bar', () => {
    expect(beats(ts('6/8'))).toEqual([
      { start: ZERO, length: frac(3, 8), pulses: 3 },
      { start: frac(3, 8), length: frac(3, 8), pulses: 3 },
    ]);
    expect(beats(ts('7/8')).map((b) => [fracToString(b.start), fracToString(b.length)])).toEqual([
      ['0', '1/4'],
      ['1/4', '1/4'],
      ['1/2', '3/8'],
    ]);
    expect(beats(ts('5/4')).map((b) => b.pulses)).toEqual([1, 1, 1, 1, 1]);
  });

  it('makes the beats fill the bar', () => {
    for (const text of table.map(([t]) => t)) {
      const t = ts(text);
      const bs = beats(t);
      expect(fracSum(bs.map((b) => b.length)), text).toEqual(barLength(t));
      expect(
        bs.reduce((s, b) => s + b.pulses, 0),
        text,
      ).toBe(t.top);
    }
  });

  it('tells 6/8 from 3/4: the same bar, different beats', () => {
    const six = ts('6/8');
    const three = ts('3/4');
    expect(barLength(six)).toEqual(barLength(three));
    expect(feltBeats(six)).not.toBe(feltBeats(three));
    expect(beatUnit(six)).not.toEqual(beatUnit(three));
  });

  it('gives bar and pulse lengths', () => {
    expect(barLength(ts('4/4'))).toEqual(frac(1));
    expect(barLength(ts('6/8'))).toEqual(frac(3, 4));
    expect(barLength(ts('7/8'))).toEqual(frac(7, 8));
    expect(pulseLength(ts('6/8'))).toEqual(frac(1, 8));
    expect(pulseLength(CUT_TIME)).toEqual(frac(1, 2));
  });

  it('knows cut time', () => {
    expect(isCutTime(CUT_TIME)).toBe(true);
    expect(isCutTime(ts('2/2'))).toBe(true);
    expect(isCutTime(ts('2/4'))).toBe(false);
    expect(isCutTime(COMMON_TIME)).toBe(false);
  });

  it('describes meters for feedback', () => {
    expect(describeMeter(ts('6/8'))).toBe(
      'Compound duple: 2 dotted-quarter beats, each split in 3',
    );
    expect(describeMeter(ts('4/4'))).toBe('Simple quadruple: 4 quarter beats, each split in 2');
    expect(describeMeter(ts('3/4'))).toBe('Simple triple: 3 quarter beats, each split in 2');
    expect(describeMeter(CUT_TIME)).toBe('Simple duple: 2 half beats, each split in 2');
    expect(describeMeter(ts('7/8'))).toBe('Odd meter: 3 uneven beats, grouped 2+2+3');
    expect(describeMeter(ts('5/4'))).toBe('Odd meter: 5 quarter beats, grouped 3+2');
    expect(describeMeter(ts('15/8'))).toBe(
      'Compound 5-beat: 5 dotted-quarter beats, each split in 3',
    );
  });
});

describe('beaming per meter', () => {
  const cases: [string, string[]][] = [
    ['4/4', ['1/4', '1/4', '1/4', '1/4']],
    ['3/4', ['1/4', '1/4', '1/4']],
    ['2/2', ['1/2', '1/2']],
    ['6/8', ['3/8', '3/8']],
    ['12/8', ['3/8', '3/8', '3/8', '3/8']],
    ['7/8', ['2/8', '2/8', '3/8']],
    ['7/8 (3+2+2)', ['3/8', '2/8', '2/8']],
    ['5/4', ['1/4', '1/4', '1/4', '1/4', '1/4']],
    ['3/8', ['3/8']],
    ['2/8', ['2/8']],
    ['4/8', ['2/8', '2/8']],
    ['1/8', ['1/8']],
    ['6/16', ['3/16', '3/16']],
  ];

  it.each(cases)('%s beams in %j', (text, groups) => {
    const t = ts(text);
    expect(vexflowBeamGroups(t)).toEqual(groups);
    expect(fracSum(beamSpans(t))).toEqual(barLength(t));
  });
});

describe('the click meter', () => {
  it('matches every timing preset', () => {
    for (const [name, preset] of Object.entries(METER_PRESETS)) {
      const t: TimeSignature = ts(name);
      expect(clickMeter(t), name).toEqual({ groups: [...preset.groups], unit: preset.unit });
      expect(timeSignatureName(t)).toBe(name);
    }
  });

  it('accents only the downbeat of a simple meter', () => {
    expect(clickMeter(CUT_TIME)).toEqual({ groups: [2], unit: 2 });
  });
});
