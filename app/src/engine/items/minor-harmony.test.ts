import { describe, expect, it } from 'vitest';
import { itemId, parseItemId, type ItemRef } from '../model';
import family, {
  MINOR_CHORD_NUMERALS,
  MINOR_SOURCE_NUMERALS,
  minorHarmonyItemId,
  parseMinorHarmonyItemId,
  twoFiveItemId,
} from './minor-harmony';

describe('minor-harmony items', () => {
  it('formats each kind canonically', () => {
    expect(minorHarmonyItemId('minor-chord', 'V7', 'Am')).toBe('minor-chord:V7@key=Am');
    expect(minorHarmonyItemId('minor-source', 'bVII', 'F#m')).toBe('minor-source:bVII@key=F#m');
    expect(minorHarmonyItemId('minor-chord', 'vii°', 'Cm')).toBe('minor-chord:vii°@key=Cm');
    expect(twoFiveItemId('Bbm')).toBe('two-five:Bbm');
  });

  it('owns every kind it builds', () => {
    expect(family.kinds).toEqual(['minor-chord', 'minor-source', 'two-five']);
    expect(MINOR_CHORD_NUMERALS.every((n) => MINOR_SOURCE_NUMERALS.includes(n))).toBe(true);
  });

  it.each([
    { kind: 'minor-chord', numeral: 'V', key: 'Em' },
    { kind: 'minor-source', numeral: 'IV', key: 'C#m' },
    { kind: 'minor-source', numeral: 'ii°', key: 'Dm' },
    { kind: 'two-five', key: 'Gm' },
  ] as ItemRef[])('round-trips $kind refs', (ref) => {
    const id = itemId(ref);
    expect(parseItemId(id)).toEqual(ref);
    expect(parseMinorHarmonyItemId(id)).toEqual(ref);
  });

  it.each([
    'minor-chord:v@key=Am',
    'minor-chord:V7@key=A',
    'minor-chord:V7@key=am',
    'minor-chord:V7@key=Hm',
    'minor-source:VI@key=Am',
    'minor-source:viio@key=Am',
    'two-five:A',
    'two-five:Amin',
    'two-five:Am ',
  ])('rejects non-canonical %j', (id) => {
    expect(parseMinorHarmonyItemId(id)).toBeNull();
  });

  it('refuses to build IDs that would not parse', () => {
    expect(() => minorHarmonyItemId('minor-chord', 'v', 'Am')).toThrow(RangeError);
    expect(() => minorHarmonyItemId('minor-source', 'V', 'C')).toThrow(RangeError);
    expect(() => minorHarmonyItemId('minor-source', 'V', 'Xm')).toThrow(RangeError);
    expect(() => twoFiveItemId('A minor')).toThrow(RangeError);
  });
});
