import { describe, expect, it } from 'vitest';
import { displayPc } from './pitch-display';

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
