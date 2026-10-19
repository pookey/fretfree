import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../../../mic/tracker';
import type { PitchFrame } from '../../../mic/types';
import { DROP_D_TUNING } from '../../../theory';
import {
  advise,
  centsBetween,
  createPitchSmoother,
  formatCents,
  isVoiced,
  nearestString,
  pegAdvice,
  needleAngle,
  readPitch,
  stringOrdinal,
  tunerStrings,
} from './logic';

const STRINGS = tunerStrings();
/** The frequency of a MIDI note, detuned by `cents`. */
const hz = (midi: number, cents = 0) => midiToFrequency(midi + cents / 100);
const frame = (frequency: number, at: number, clarity = 0.98): PitchFrame => ({
  frequency,
  clarity,
  at,
});

describe('tunerStrings', () => {
  it('lists standard tuning low to high, E A D G B E, with string numbers and pitches', () => {
    expect(STRINGS.map((s) => [s.string, s.name])).toEqual([
      [6, 'E2'],
      [5, 'A2'],
      [4, 'D3'],
      [3, 'G3'],
      [2, 'B3'],
      [1, 'E4'],
    ]);
    expect(STRINGS[1]?.frequency).toBeCloseTo(110, 6);
    expect(STRINGS[0]?.frequency).toBeCloseTo(82.407, 3);
    expect(STRINGS[5]?.frequency).toBeCloseTo(329.628, 3);
  });

  it('follows another tuning, spelling and concert pitch', () => {
    const dropD = tunerStrings(DROP_D_TUNING);
    expect(dropD[0]).toMatchObject({ string: 6, name: 'D2', pc: 'D' });
    expect(tunerStrings(undefined, 'sharp', 442)[1]?.frequency).toBeCloseTo(110.5, 6);
  });
});

describe('cents', () => {
  it('measures signed cents between two frequencies', () => {
    expect(centsBetween(220, 110)).toBeCloseTo(1200);
    expect(centsBetween(110, 220)).toBeCloseTo(-1200);
    expect(centsBetween(hz(45, 12), 110)).toBeCloseTo(12);
  });

  it('reads in tune within ±5 cents, and says which way to turn the peg', () => {
    expect(advise(0)).toBe('in-tune');
    expect(advise(5)).toBe('in-tune');
    expect(advise(-5)).toBe('in-tune');
    expect(advise(-5.1)).toBe('tune-up');
    expect(advise(5.1)).toBe('tune-down');
    expect(advise(8, 10)).toBe('in-tune');
  });

  it('swings the needle in proportion, pinned at ±50 cents', () => {
    expect(needleAngle(0)).toBe(0);
    expect(needleAngle(25)).toBe(30);
    expect(needleAngle(-50)).toBe(-60);
    expect(needleAngle(-80)).toBe(-60);
    expect(needleAngle(120, 45)).toBe(45);
  });
});

describe('nearestString', () => {
  it('maps each open string to itself', () => {
    for (const s of STRINGS) {
      const { string, cents } = nearestString(s.frequency, STRINGS);
      expect(string.string).toBe(s.string);
      expect(cents).toBeCloseTo(0, 6);
    }
  });

  it('picks the closer string for a pitch between two', () => {
    // Between E2 (40) and A2 (45): G2 (43) is nearer A2, F#2 (42) nearer E2.
    expect(nearestString(hz(43), STRINGS)).toMatchObject({ string: { string: 5 } });
    expect(nearestString(hz(43), STRINGS).cents).toBeCloseTo(-200);
    expect(nearestString(hz(42), STRINGS)).toMatchObject({ string: { string: 6 } });
    expect(nearestString(hz(42), STRINGS).cents).toBeCloseTo(200);
  });

  it('takes the lowest string below the range and the highest above it', () => {
    expect(nearestString(60, STRINGS).string.name).toBe('E2');
    expect(nearestString(1200, STRINGS).string.name).toBe('E4');
  });

  it('needs strings', () => {
    expect(() => nearestString(110, [])).toThrow('No strings');
  });
});

describe('readPitch', () => {
  it('names the note, its cents and the string it is', () => {
    const r = readPitch(hz(45, -12), STRINGS);
    expect(r).toMatchObject({ midi: 45, name: 'A2', pc: 'A', octave: 2, advice: 'tune-up' });
    expect(r.cents).toBeCloseTo(-12);
    expect(r.string.name).toBe('A2');
    expect(r.stringCents).toBeCloseTo(-12);
    expect(r.stringAdvice).toBe('tune-up');
  });

  it('reads an in-tune string as in tune', () => {
    const r = readPitch(hz(40, 3), STRINGS);
    expect(r).toMatchObject({ name: 'E2', advice: 'in-tune', stringAdvice: 'in-tune' });
  });

  it('tells a string a semitone flat to tune up, though the note itself is in tune', () => {
    const r = readPitch(hz(44), STRINGS, { pref: 'flat' });
    expect(r).toMatchObject({ name: 'Ab2', advice: 'in-tune', stringAdvice: 'tune-up' });
    expect(r.string.name).toBe('A2');
    expect(r.stringCents).toBeCloseTo(-100);
  });

  it('rounds to the nearest note at the half-way point', () => {
    expect(readPitch(hz(45, 49), STRINGS)).toMatchObject({ name: 'A2', advice: 'tune-down' });
    expect(readPitch(hz(45, 51), STRINGS).name).toBe('A#2');
    expect(readPitch(hz(45, 51), STRINGS).cents).toBeCloseTo(-49);
  });

  it('honours concert pitch and the in-tune band', () => {
    const r = readPitch(110.5, tunerStrings(undefined, 'sharp', 442), { a4: 442, inTuneCents: 1 });
    expect(r.cents).toBeCloseTo(0);
    expect(r.advice).toBe('in-tune');
    expect(readPitch(hz(45, 3), STRINGS, { inTuneCents: 1 }).advice).toBe('tune-down');
  });
});

describe('isVoiced', () => {
  it('ignores unvoiced, unclear and out-of-range frames', () => {
    expect(isVoiced(frame(110, 0))).toBe(true);
    expect(isVoiced(frame(0, 0, 0))).toBe(false);
    expect(isVoiced(frame(110, 0, 0.5))).toBe(false);
    expect(isVoiced(frame(40, 0))).toBe(false);
    expect(isVoiced(frame(2000, 0))).toBe(false);
    expect(
      isVoiced(frame(110, 0, 0.5), { minClarity: 0.4, minFrequency: 50, maxFrequency: 200 }),
    ).toBe(true);
  });
});

describe('createPitchSmoother', () => {
  it('reads nothing until it hears a note, then the median of recent frames', () => {
    const s = createPitchSmoother({ smoothingMs: 40 });
    expect(s.push(frame(0, 0, 0))).toBeNull();
    expect(s.push(frame(110, 20))).toBe(110);
    expect(s.push(frame(112, 40))).toBe(111);
    expect(s.push(frame(111, 60))).toBe(111);
    // The frame at 20 has aged out of the 40ms window.
    expect(s.push(frame(113, 80))).toBe(112);
  });

  it('holds a single octave glitch back, but follows a new note once two frames agree', () => {
    const s = createPitchSmoother();
    s.push(frame(110, 0));
    s.push(frame(110, 20));
    expect(s.push(frame(220, 40))).toBe(110);
    expect(s.push(frame(110, 60))).toBe(110);
    expect(s.push(frame(147, 80))).toBe(110);
    expect(s.push(frame(146, 100))).toBe(146.5);
    // The old note no longer counts.
    expect(s.push(frame(147, 120))).toBe(147);
  });

  it('replaces a held-back frame that a second frame does not confirm', () => {
    const s = createPitchSmoother();
    s.push(frame(110, 0));
    expect(s.push(frame(220, 20))).toBe(110);
    expect(s.push(frame(330, 40))).toBe(110);
    expect(s.push(frame(331, 60))).toBe(330.5);
  });

  it('keeps the reading through a short silence, then clears it', () => {
    const s = createPitchSmoother({ holdMs: 100 });
    s.push(frame(110, 0));
    expect(s.push(frame(0, 60, 0))).toBe(110);
    expect(s.push(frame(0, 100, 0))).toBe(110);
    expect(s.push(frame(0, 120, 0))).toBeNull();
    // A fresh note after the silence starts clean, glitch guard and all.
    expect(s.push(frame(220, 140))).toBe(220);
  });

  it('forgets everything on reset', () => {
    const s = createPitchSmoother();
    s.push(frame(110, 0));
    s.push(frame(220, 20));
    s.reset();
    expect(s.push(frame(0, 40, 0))).toBeNull();
    expect(s.push(frame(330, 60))).toBe(330);
  });
});

describe('readout words', () => {
  it('formats whole cents with a sign', () => {
    expect(formatCents(12.4)).toBe('+12 cents');
    expect(formatCents(-3.2)).toBe('−3 cents');
    expect(formatCents(-0.4)).toBe('0 cents');
    expect(formatCents(1)).toBe('+1 cent');
    expect(formatCents(-1.2)).toBe('−1 cent');
  });

  it('names strings as guitarists do', () => {
    expect([1, 2, 3, 4, 5, 6].map(stringOrdinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '5th',
      '6th',
    ]);
  });

  it('says which way to turn the peg, and how far', () => {
    expect(pegAdvice(4)).toBe('In tune');
    expect(pegAdvice(-12.2)).toBe('Tune up 12 cents');
    expect(pegAdvice(30)).toBe('Tune down 30 cents');
    expect(pegAdvice(-98)).toBe('Tune up about 1 semitone');
    expect(pegAdvice(210)).toBe('Tune down about 2 semitones');
  });
});
