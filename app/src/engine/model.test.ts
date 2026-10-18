import { describe, expect, it } from 'vitest';
import {
  findItemId,
  findMarkerItemId,
  intervalItemId,
  itemId,
  letterItemId,
  markerItemId,
  noteItemId,
  parseFindItemId,
  parseIntervalItemId,
  parseItemId,
  parseLetterItemId,
  parseMarkerItemId,
  parseNoteItemId,
  parseRepeatItemId,
  parseStepItemId,
  repeatItemId,
  stepItemId,
  type ItemRef,
} from './model';

describe('item IDs', () => {
  it('formats each kind canonically', () => {
    expect(noteItemId({ string: 6, fret: 5 })).toBe('note@s6f5');
    expect(findItemId('G', 5)).toBe('find:G@s5');
    expect(findItemId('C#', 3)).toBe('find:C#@s3');
    expect(stepItemId(2, 'E')).toBe('step:+2@E');
    expect(stepItemId(-1, 'C')).toBe('step:-1@C');
    expect(letterItemId(1, 'G')).toBe('letter:+1@G');
    expect(markerItemId(7)).toBe('marker:f7');
    expect(findMarkerItemId(12)).toBe('find-marker:f12');
    expect(repeatItemId(12, 3)).toBe('repeat:+12@f3');
    expect(repeatItemId(-12, 15)).toBe('repeat:-12@f15');
    expect(intervalItemId('interval', 'M3', 6, 5)).toBe('interval:M3@s6→s5');
    expect(intervalItemId('interval-name', 'TT', 3, 1)).toBe('interval-name:TT@s3→s1');
    expect(() => intervalItemId('interval', 'X9' as 'M3', 6, 5)).toThrow(RangeError);
  });

  it('parses each kind', () => {
    expect(parseNoteItemId('note@s6f5')).toEqual({ string: 6, fret: 5 });
    expect(parseFindItemId('find:Bb@s2')).toEqual({ pc: 'Bb', string: 2 });
    expect(parseStepItemId('step:+2@E')).toEqual({ semitones: 2, from: 'E' });
    expect(parseLetterItemId('letter:-1@A')).toEqual({ steps: -1, from: 'A' });
    expect(parseMarkerItemId('marker:f0')).toEqual({ kind: 'marker', fret: 0 });
    expect(parseMarkerItemId('find-marker:f9')).toEqual({ kind: 'find-marker', fret: 9 });
    expect(parseRepeatItemId('repeat:-12@f17')).toEqual({ frets: -12, from: 17 });
    expect(parseIntervalItemId('interval:b7@s5→s3')).toBeNull();
  });

  const refs: ItemRef[] = [
    { kind: 'note', position: { string: 1, fret: 12 } },
    { kind: 'find', pc: 'F#', string: 4 },
    { kind: 'step', semitones: -2, from: 'C' },
    { kind: 'letter', steps: 1, from: 'B' },
    { kind: 'marker', fret: 3 },
    { kind: 'find-marker', fret: 5 },
    { kind: 'repeat', frets: 12, from: 0 },
    { kind: 'interval', interval: 'm7', from: 5, to: 3 },
    { kind: 'interval-name', interval: 'M3', from: 3, to: 2 },
  ];

  it.each(refs)('round-trips $kind refs', (ref) => {
    const id = itemId(ref);
    expect(parseItemId(id)).toEqual(ref);
    expect(itemId(parseItemId(id)!)).toBe(id);
  });

  it.each([
    '',
    'note@s06f5',
    'note@s6f05',
    'note@s6',
    'find:H@s5',
    'find:G@s',
    'find:g@s5',
    'step:2@E',
    'step:+0@E',
    'step:+02@E',
    'step:+2@E#x',
    'letter:+1@C#',
    'marker:7',
    'marker:f-1',
    'repeat:12@f3',
    'interval:M9@s6→s5',
    'interval:M3@s06→s5',
    'interval:M3@s6-s5',
    'interval-name:M3@s6',
    'nope:G',
  ])('rejects non-canonical %j', (id) => {
    expect(parseItemId(id)).toBeNull();
  });

  it('refuses to build IDs that would not parse', () => {
    expect(() => noteItemId({ string: 6, fret: -1 })).toThrow(RangeError);
    expect(() => noteItemId({ string: 1.5, fret: 0 })).toThrow(RangeError);
    expect(() => findItemId('H', 5)).toThrow(RangeError);
    expect(() => stepItemId(0, 'E')).toThrow(RangeError);
    expect(() => stepItemId(1.5, 'E')).toThrow(RangeError);
    expect(() => letterItemId(1, 'C#')).toThrow(RangeError);
    expect(() => markerItemId(-3)).toThrow(RangeError);
    expect(() => repeatItemId(12, -1)).toThrow(RangeError);
  });
});
