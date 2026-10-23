import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING } from '../../theory';
import { cellName, neckText, spokenNeckText } from './labels';

describe('neckText', () => {
  it('shows pitch names with ♯/♭ glyphs', () => {
    expect(neckText('F#')).toBe('F♯');
    expect(neckText('Bb')).toBe('B♭');
    expect(neckText('C##')).toBe('C𝄪');
    expect(neckText('F# / Gb')).toBe('F♯ / G♭');
  });

  it('shows altered degrees with glyphs, double flats too', () => {
    expect(neckText('b3')).toBe('♭3');
    expect(neckText('#4')).toBe('♯4');
    expect(neckText('bb7')).toBe('𝄫7');
    expect(neckText('##5')).toBe('𝄪5');
  });

  it('leaves naturals, plain degrees, fingers and glyph text alone', () => {
    for (const label of ['E', 'R', '3', '1', 'T', 'F♯', '♭7', 'Bdim', 'IV']) {
      expect(neckText(label)).toBe(label);
    }
  });
});

describe('spokenNeckText', () => {
  it('says glyphs in words', () => {
    expect(spokenNeckText('F♯')).toBe('F sharp');
    expect(spokenNeckText('B♭')).toBe('B flat');
    expect(spokenNeckText('♭3')).toBe('flat 3');
    expect(spokenNeckText('𝄫7')).toBe('double flat 7');
    expect(spokenNeckText('F♯ / G♭')).toBe('F sharp / G flat');
  });

  it('is undefined when the text reads as written', () => {
    expect(spokenNeckText('E')).toBeUndefined();
    expect(spokenNeckText('R')).toBeUndefined();
    expect(spokenNeckText('5')).toBeUndefined();
  });
});

describe('cellName', () => {
  it('names the cell, and its pitch in words when notes are revealed', () => {
    const pos = { string: 1, fret: 2 };
    expect(cellName(pos)).toBe('string 1, fret 2');
    expect(cellName(pos, { revealNote: true })).toBe('string 1, fret 2, F sharp');
    expect(cellName(pos, { revealNote: true, pref: 'flat', tuning: STANDARD_TUNING })).toBe(
      'string 1, fret 2, G flat',
    );
    expect(cellName({ string: 5, fret: 7 }, { revealNote: true })).toBe('string 5, fret 7, E');
  });
});
