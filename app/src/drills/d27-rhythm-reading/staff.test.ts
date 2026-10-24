import { describe, expect, it } from 'vitest';
import { parseRhythm } from '../../theory';
import { eventAtPulse, spokenMeter, staffTuplets } from './staff';

describe('D27 staff helpers', () => {
  it('draws one bracket per tuplet group', () => {
    expect(staffTuplets(parseRhythm('4 4 4 4'))).toEqual([]);
    expect(staffTuplets(parseRhythm('3[8 8 8] 3[8 8 8] 4'))).toEqual([
      { from: 0, count: 3, inSpaceOf: 2 },
      { from: 3, count: 3, inSpaceOf: 2 },
    ]);
    expect(staffTuplets(parseRhythm('4 8 2:3[8 8]'))).toEqual([
      { from: 2, count: 2, inSpaceOf: 3 },
    ]);
    // Built by hand, without starts: one run of one ratio is one bracket.
    const [a, b] = parseRhythm('3[4 4]');
    expect(
      staffTuplets([a!, { ...b!, tupletStart: false }, { ...b!, tupletStart: false }]),
    ).toEqual([{ from: 0, count: 3, inSpaceOf: 2 }]);
  });

  it('finds the note the click is on, rests included', () => {
    const bar = parseRhythm('8. 16 r4 3[8 8 8] 4');
    expect(eventAtPulse(bar, '4/4', 0)).toBe(0);
    expect(eventAtPulse(bar, '4/4', 0.5)).toBe(0);
    expect(eventAtPulse(bar, '4/4', 0.75)).toBe(1);
    expect(eventAtPulse(bar, '4/4', 1)).toBe(2);
    expect(eventAtPulse(bar, '4/4', 2 + 1 / 3)).toBe(4);
    expect(eventAtPulse(bar, '4/4', 3.5)).toBe(6);
    expect(eventAtPulse(parseRhythm('4. 8 4'), '6/8', 3)).toBe(1);
  });

  it('says the meter', () => {
    expect(spokenMeter('6/8')).toBe('6 8 time');
  });
});
