import { describe, expect, it } from 'vitest';
import {
  checkBar,
  fracAdd,
  fracEq,
  barLength,
  parseRhythm,
  parseTimeSignature,
  rhythmLength,
} from '../../theory';
import { FORMS } from './forms';
import { PICKUP_TUNE_BARS, RHYTHMS, ROAD_MAP_METERS, pickupTune, roadMapTune } from './tunes';

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

describe('form tunes', () => {
  it('writes full and last bars that fill their meter', () => {
    for (const table of [RHYTHMS.FULL, RHYTHMS.ENDS]) {
      for (const [meter, rows] of Object.entries(table)) {
        for (const r of rows)
          expect(checkBar(parseRhythm(r), parseTimeSignature(meter)).ok, `${meter} ${r}`).toBe(
            true,
          );
      }
    }
  });

  it('gives a pickup tune’s last bar what the pickup took', () => {
    for (const [key, pickups] of Object.entries(RHYTHMS.PICKUPS)) {
      const [meter, beats] = key.split(':') as [string, string];
      const ts = parseTimeSignature(meter);
      const ends = RHYTHMS.PICKUP_ENDS[key] ?? [];
      expect(ends.length, key).toBeGreaterThan(0);
      for (const p of pickups) {
        const length = rhythmLength(parseRhythm(p));
        expect(length.n * ts.bottom, `${key} ${p}`).toBe(Number(beats) * length.d);
        for (const e of ends) {
          expect(
            fracEq(fracAdd(length, rhythmLength(parseRhythm(e))), barLength(ts)),
            `${key} ${p} + ${e}`,
          ).toBe(true);
        }
      }
    }
  });

  it('builds a pickup tune: the pickup with no bass, then bars with one, ending on C', () => {
    const tune = pickupTune('4/4', 1, seq([0.1, 0.6, 0.3, 0.9]));
    expect(tune).toHaveLength(PICKUP_TUNE_BARS);
    expect(tune[0]!.bass).toBeNull();
    expect(tune[0]!.pitches.at(-1)).toBe('G4');
    for (const bar of tune.slice(1)) expect(bar.bass).not.toBeNull();
    expect(tune.at(-1)!.pitches.at(-1)).toBe('C4');
    for (const bar of tune) expect(bar.pitches).toHaveLength(parseRhythm(bar.rhythm).length);
  });

  it('builds a road map’s tune: a turn back ends on G, the last bar on C', () => {
    for (const meter of ROAD_MAP_METERS) {
      const tune = roadMapTune(FORMS.endings.bars, meter, seq([0.5, 0.2]));
      expect(tune).toHaveLength(5);
      expect(tune[3]!.pitches.at(-1)).toBe('G4');
      expect(tune[4]!.pitches.at(-1)).toBe('C4');
      expect(tune.every((b) => b.bass !== null)).toBe(true);
    }
    // A last bar with an end repeat still ends the tune on C.
    expect(
      roadMapTune(FORMS['repeat-all'].bars, '4/4', seq([0]))
        .at(-1)!
        .pitches.at(-1),
    ).toBe('C4');
  });

  it('refuses a meter or pickup it has no bars for', () => {
    expect(() => pickupTune('5/4', 1, seq([0]))).toThrow(RangeError);
    expect(() => roadMapTune(FORMS.endings.bars, '7/8', seq([0]))).toThrow(RangeError);
  });
});
