import { describe, expect, it } from 'vitest';
import { itemId, parseItemId, type ItemRef } from '../model';
import family, {
  BORROWED_NUMERALS,
  FUNCTION_NUMERALS,
  SECONDARY_TARGETS,
  functionItemId,
  parseFunctionItemId,
} from './function';

describe('function items', () => {
  it('formats each kind canonically', () => {
    expect(functionItemId({ kind: 'function', numeral: 'vi', mode: 'major' })).toBe(
      'function:vi@major',
    );
    expect(functionItemId({ kind: 'function', numeral: 'bVII', mode: 'minor' })).toBe(
      'function:bVII@minor',
    );
    expect(functionItemId({ kind: 'secondary', target: 'ii', key: 'C' })).toBe(
      'secondary:V7/ii@key=C',
    );
    expect(functionItemId({ kind: 'secondary-of', target: 'V', key: 'Bb' })).toBe(
      'secondary-of:V7/V@key=Bb',
    );
    expect(functionItemId({ kind: 'borrowed', numeral: 'iv', key: 'G' })).toBe('borrowed:iv@key=G');
    expect(functionItemId({ kind: 'tritone-sub', chord: 'F#7' })).toBe('tritone-sub:F#7');
  });

  it('owns every kind it builds', () => {
    expect(family.kinds).toEqual([
      'function',
      'secondary',
      'secondary-of',
      'borrowed',
      'tritone-sub',
    ]);
  });

  it('asks the function of every chord but the tonic', () => {
    expect(FUNCTION_NUMERALS.major).not.toContain('I');
    expect(FUNCTION_NUMERALS.minor).not.toContain('i');
    expect(FUNCTION_NUMERALS.minor).toContain('V');
    expect(SECONDARY_TARGETS).toEqual(['ii', 'iii', 'IV', 'V', 'vi']);
    expect(BORROWED_NUMERALS).toEqual(['bIII', 'iv', 'v', 'bVI', 'bVII']);
  });

  it.each([
    { kind: 'function', numeral: 'vii°', mode: 'major' },
    { kind: 'function', numeral: 'V', mode: 'minor' },
    { kind: 'secondary', target: 'iii', key: 'D' },
    { kind: 'secondary-of', target: 'vi', key: 'F' },
    { kind: 'borrowed', numeral: 'bVI', key: 'Eb' },
    { kind: 'tritone-sub', chord: 'Db7' },
  ] as ItemRef[])('round-trips $kind refs', (ref) => {
    const id = itemId(ref);
    expect(parseItemId(id)).toEqual(ref);
    expect(parseFunctionItemId(id)).toEqual(ref);
  });

  it.each([
    'function:I@major',
    'function:V@dorian',
    'function:V7@major',
    'secondary:V/ii@key=C',
    'secondary:V7/vii°@key=C',
    'secondary:V7/ii@key=Am',
    'secondary-of:V7/ii@key=c',
    'borrowed:IV@key=C',
    'borrowed:bVII@key=Cm',
    'tritone-sub:G',
    'tritone-sub:Gm7',
    'tritone-sub:H7',
  ])('rejects non-canonical %j', (id) => {
    expect(parseFunctionItemId(id)).toBeNull();
  });

  it('refuses to build IDs that would not parse', () => {
    expect(() => functionItemId({ kind: 'function', numeral: 'I', mode: 'major' })).toThrow(
      RangeError,
    );
    expect(() => functionItemId({ kind: 'secondary', target: 'vii°', key: 'C' })).toThrow(
      RangeError,
    );
    expect(() => functionItemId({ kind: 'secondary', target: 'ii', key: 'Am' })).toThrow(
      RangeError,
    );
    expect(() => functionItemId({ kind: 'borrowed', numeral: 'IV', key: 'C' })).toThrow(RangeError);
    expect(() => functionItemId({ kind: 'borrowed', numeral: 'iv', key: 'Q' })).toThrow(RangeError);
    expect(() => functionItemId({ kind: 'tritone-sub', chord: 'Gmaj7' })).toThrow(RangeError);
  });
});
