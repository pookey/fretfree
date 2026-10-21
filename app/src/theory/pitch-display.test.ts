import { describe, expect, it } from 'vitest';
import { displayPc, spokenDegree, spokenPc } from './pitch-display';

describe('displayPc', () => {
  it('spells sharps and flats with the music glyphs', () => {
    expect(displayPc('F#')).toBe('F♯');
    expect(displayPc('Bb')).toBe('B♭');
    expect(displayPc('C##')).toBe('C𝄪');
    expect(displayPc('Ebb')).toBe('E𝄫');
  });

  it('leaves naturals alone', () => {
    for (const pc of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) expect(displayPc(pc)).toBe(pc);
  });

  it('keeps a note name’s octave', () => {
    expect(displayPc('F#3')).toBe('F♯3');
    expect(displayPc('Bb2')).toBe('B♭2');
  });

  it('spells chord names, root and altered degrees', () => {
    expect(displayPc('F#m7')).toBe('F♯m7');
    expect(displayPc('Bbmaj7')).toBe('B♭maj7');
    expect(displayPc('Bbm7b5')).toBe('B♭m7♭5');
    expect(displayPc('C7#9')).toBe('C7♯9');
    expect(displayPc('G7b9')).toBe('G7♭9');
    expect(displayPc('C/Bb')).toBe('C/B♭');
  });

  it('never reads a quality’s letters as a flat', () => {
    expect(displayPc('Bdim')).toBe('Bdim');
    expect(displayPc('Bm')).toBe('Bm');
    expect(displayPc('Cmaj7')).toBe('Cmaj7');
    expect(displayPc('Bsus2')).toBe('Bsus2');
  });

  it('spells key names', () => {
    expect(displayPc('Eb major')).toBe('E♭ major');
    expect(displayPc('F# minor')).toBe('F♯ minor');
    expect(displayPc('B major')).toBe('B major');
  });

  it('is idempotent', () => {
    for (const s of ['F♯', 'B♭m7♭5', 'C𝄪', '']) expect(displayPc(s)).toBe(s);
  });
});

describe('spokenPc', () => {
  it('says sharps and flats, from either spelling', () => {
    expect(spokenPc('F#')).toBe('F sharp');
    expect(spokenPc('F♯')).toBe('F sharp');
    expect(spokenPc('Bb')).toBe('B flat');
    expect(spokenPc('C##')).toBe('C double sharp');
    expect(spokenPc('E𝄫')).toBe('E double flat');
  });

  it('leaves naturals and anything else alone', () => {
    expect(spokenPc('E')).toBe('E');
    expect(spokenPc('Bm')).toBe('Bm');
    expect(spokenPc('')).toBe('');
  });
});

describe('spokenDegree', () => {
  it('says a degree’s accidental in words, glyph or ASCII', () => {
    expect(spokenDegree('♭3')).toBe('flat 3');
    expect(spokenDegree('b7')).toBe('flat 7');
    expect(spokenDegree('♯4')).toBe('sharp 4');
    expect(spokenDegree('#11')).toBe('sharp 11');
    expect(spokenDegree('♭♭7')).toBe('double flat 7');
    expect(spokenDegree('bb7')).toBe('double flat 7');
    expect(spokenDegree('𝄪5')).toBe('double sharp 5');
  });

  it('leaves plain degrees and other labels alone', () => {
    expect(spokenDegree('5')).toBe('5');
    expect(spokenDegree('R')).toBe('R');
  });
});
