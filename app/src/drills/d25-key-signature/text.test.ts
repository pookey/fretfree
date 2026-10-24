import { describe, expect, it } from 'vitest';
import { keyApplyItemId } from '../../engine/items/key-apply';
import { STANDARD_TUNING } from '../../theory';
import { d25MakePrompt, type D25Prompt } from './logic';
import {
  d25Explain,
  d25Fact,
  d25Guides,
  d25StaffLabel,
  signatureName,
  signatureNotes,
  spoken,
} from './text';

const prompt = (letter: string, alteration: number): D25Prompt =>
  d25MakePrompt(
    { id: keyApplyItemId(letter, alteration), skillId: 'R3.sharps-few' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

describe('D25 text', () => {
  it('names spellings and signatures', () => {
    expect(spoken('F#')).toBe('F sharp');
    expect(spoken('Bb')).toBe('B flat');
    expect(spoken('C')).toBe('C');
    expect(signatureName(0)).toBe('No sharps or flats');
    expect(signatureName(1)).toBe('1 sharp');
    expect(signatureName(-3)).toBe('3 flats');
    expect(signatureNotes(2)).toEqual(['F♯', 'C♯']);
    expect(signatureNotes(-2)).toEqual(['B♭', 'E♭']);
  });

  it('describes the signature by where its signs sit, never by letter', () => {
    const label = d25StaffLabel(prompt('F', 2));
    expect(label).toBe(
      'Treble clef, key signature of 2 sharps: on the 5th line, the 3rd space. One note, no accidental.',
    );
    expect(label).not.toMatch(/\b[A-G] ?(sharp|♯)/);
    expect(d25StaffLabel(prompt('F', 0))).toBe(
      'Treble clef, key signature of no sharps or flats. One note, no accidental.',
    );
    expect(d25StaffLabel(prompt('B', -1))).toContain('of 1 flat: on the 3rd line.');
  });

  it('states the fact for altered, boundary and plain letters', () => {
    expect(d25Fact(prompt('F', 2))).toBe('2 sharps: F♯ C♯. Every F is F♯, in every octave.');
    expect(d25Fact(prompt('G', 2))).toBe('2 sharps: F♯ C♯. G isn’t one of them, so it stays G.');
    expect(d25Fact(prompt('F', 0))).toBe('No sharps or flats: F stays F.');
    expect(d25Fact(prompt('B', -1))).toBe('1 flat: B♭. Every B is B♭, in every octave.');
  });

  it('explains what a wrong spelling would need', () => {
    const f = prompt('F', 2);
    expect(d25Explain(f, 'F#')).toBeNull();
    expect(d25Explain(f, 'X')).toBeNull();
    expect(d25Explain(f, 'F')).toBe(
      'F would need a natural sign (♮) before it: this signature sharpens every F.',
    );
    expect(d25Explain(prompt('B', -1), 'B')).toBe(
      'B would need a natural sign (♮) before it: this signature flattens every B.',
    );
    expect(d25Explain(f, 'Fb')).toBe('F♭ would need its own sign, or a signature of 7 flats.');
    expect(d25Explain(prompt('G', 2), 'G#')).toBe(
      'G♯ would need its own sign, or a signature of 3 sharps.',
    );
  });

  it('fades the guides with the level', () => {
    expect(d25Guides(0)).toEqual({ rule: false, orders: false, method: false });
    expect(d25Guides(1)).toEqual({ rule: true, orders: false, method: false });
    expect(d25Guides(2)).toEqual({ rule: true, orders: true, method: false });
    expect(d25Guides(3)).toEqual({ rule: true, orders: true, method: true });
  });
});
