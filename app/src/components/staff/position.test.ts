import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING } from '../../theory';
import {
  isLine,
  ledgerLines,
  naturalAt,
  positionName,
  positionOf,
  spokenPitch,
  writtenKey,
} from './position';

describe('staff positions on treble 8vb', () => {
  it('puts sounding E3 on the bottom line and F4 on the top line', () => {
    expect(positionOf('E3')).toBe(0);
    expect(positionOf('F4')).toBe(8);
    expect(positionOf('B3')).toBe(4); // the middle line
  });

  it('hangs open low E under three ledger lines', () => {
    expect(positionOf('E2')).toBe(-7);
    expect(ledgerLines(-7)).toEqual([-2, -4, -6]);
  });

  it('places every open string', () => {
    expect(STANDARD_TUNING.notes.map(positionOf)).toEqual([-7, -4, -1, 2, 4, 7]);
  });

  it('ignores accidentals', () => {
    expect(positionOf('F#3')).toBe(positionOf('F3'));
    expect(positionOf('Bb2')).toBe(positionOf('B2'));
    expect(positionOf('Cb4')).toBe(positionOf('C4'));
  });

  it('crosses octave boundaries at C', () => {
    expect(positionOf('B2')).toBe(-3);
    expect(positionOf('C3')).toBe(-2);
  });

  it('round-trips naturals from E2 to B5', () => {
    for (let p = -7; p <= 18; p++) expect(positionOf(naturalAt(p))).toBe(p);
    expect(naturalAt(0)).toBe('E3');
    expect(naturalAt(-2)).toBe('C3');
    expect(naturalAt(12)).toBe('C5');
  });

  it('rejects pitches without an octave', () => {
    expect(() => positionOf('E')).toThrow(/octave/);
    expect(() => positionOf('nope')).toThrow();
  });

  it('tells lines from spaces, below the staff too', () => {
    expect([0, 2, 8, -2, 10].every(isLine)).toBe(true);
    expect([1, 7, -1, -3, 9].some(isLine)).toBe(false);
  });

  it('needs no ledger lines on or just outside the staff', () => {
    for (let p = -1; p <= 9; p++) expect(ledgerLines(p)).toEqual([]);
    expect(ledgerLines(-2)).toEqual([-2]);
    expect(ledgerLines(-3)).toEqual([-2]);
    expect(ledgerLines(10)).toEqual([10]);
    expect(ledgerLines(13)).toEqual([10, 12]);
  });

  it('writes VexFlow keys an octave up', () => {
    expect(writtenKey('E2')).toBe('e/3');
    expect(writtenKey('F#3')).toBe('f#/4');
    expect(writtenKey('Bb3')).toBe('bb/4');
  });
});

describe('position names', () => {
  it('counts lines and spaces up from the bottom', () => {
    expect([0, 2, 4, 6, 8].map(positionName)).toEqual([
      'line 1',
      'line 2',
      'line 3',
      'line 4',
      'line 5',
    ]);
    expect([1, 3, 5, 7].map(positionName)).toEqual(['space 1', 'space 2', 'space 3', 'space 4']);
  });

  it('names the spaces just outside the staff', () => {
    expect(positionName(-1)).toBe('space below the staff');
    expect(positionName(9)).toBe('space above the staff');
  });

  it('names ledger lines and the spaces beyond them', () => {
    expect(positionName(-2)).toBe('1st ledger line below');
    expect(positionName(-3)).toBe('space below the 1st ledger line');
    expect(positionName(-6)).toBe('3rd ledger line below');
    expect(positionName(-7)).toBe('space below the 3rd ledger line');
    expect(positionName(-8)).toBe('4th ledger line below');
    expect(positionName(10)).toBe('1st ledger line above');
    expect(positionName(11)).toBe('space above the 1st ledger line');
    expect(positionName(12)).toBe('2nd ledger line above');
  });

  it('never names the note', () => {
    for (let p = -8; p <= 16; p++) expect(positionName(p)).not.toMatch(/\b[A-G]\d/);
  });
});

describe('spoken pitches', () => {
  it('spells accidentals out for VoiceOver', () => {
    expect(spokenPitch('E2')).toBe('E 2');
    expect(spokenPitch('F#3')).toBe('F sharp 3');
    expect(spokenPitch('Bb3')).toBe('B flat 3');
    expect(spokenPitch('C##4')).toBe('C double sharp 4');
    expect(spokenPitch('Ebb4')).toBe('E double flat 4');
  });
});
