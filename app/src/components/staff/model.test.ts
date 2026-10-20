import { describe, expect, it } from 'vitest';
import { keyAlterations, shownAccidentals } from './accidentals';
import { tabVisibility } from './guide';
import { isRest, keyAccidentalCount, noteLabel, tupletOf, type StaffNote } from './model';

describe('note labels', () => {
  it('names pitch and value', () => {
    expect(noteLabel({ pitches: ['E2'], value: 'q' })).toBe('E 2, quarter note');
    expect(noteLabel({ pitches: ['F#3'], value: '8', dots: 1 })).toBe(
      'F sharp 3, dotted eighth note',
    );
    expect(noteLabel({ pitches: ['G3'], value: 'h', dots: 2 })).toBe(
      'G 3, double-dotted half note',
    );
  });

  it('names rests and chords', () => {
    expect(noteLabel({ value: 'q' })).toBe('quarter rest');
    expect(noteLabel({ pitches: [], value: '16' })).toBe('sixteenth rest');
    expect(noteLabel({ pitches: ['E2', 'B2'], value: 'w' })).toBe('E 2 and B 2, whole-note chord');
  });

  it('adds ties, tuplets and tab', () => {
    const note: StaffNote = {
      pitches: ['A2'],
      value: '8',
      tie: true,
      tab: [{ string: 5, fret: 0 }],
    };
    expect(noteLabel(note, { tuplet: { from: 0, count: 3 }, withTab: true })).toBe(
      'A 2, eighth note, triplet, tied to the next note, string 5, fret 0',
    );
    expect(noteLabel(note, { tuplet: { from: 0, count: 5, inSpaceOf: 4 } })).toBe(
      'A 2, eighth note, 5-tuplet, tied to the next note',
    );
    expect(noteLabel({ value: 'q', tie: true })).toBe('quarter rest');
  });

  it('says where a note sits, not its name, while a quiz hides pitches', () => {
    const label = noteLabel(
      { pitches: ['F#3'], value: 'q' },
      { revealPitch: false, accidentals: ['#'] },
    );
    expect(label).toBe('quarter note on space 1, sharp');
    expect(noteLabel({ pitches: ['E2'], value: 'q' }, { revealPitch: false })).toBe(
      'quarter note on space below the 3rd ledger line',
    );
  });

  it('finds the tuplet a note belongs to', () => {
    const tuplets = [{ from: 2, count: 3 }];
    expect(tupletOf(1, tuplets)).toBeUndefined();
    expect(tupletOf(2, tuplets)).toBe(tuplets[0]);
    expect(tupletOf(4, tuplets)).toBe(tuplets[0]);
    expect(tupletOf(5, tuplets)).toBeUndefined();
  });

  it('knows a rest', () => {
    expect(isRest({ value: 'q' })).toBe(true);
    expect(isRest({ value: 'q', pitches: ['E2'] })).toBe(false);
  });
});

describe('key signatures', () => {
  it('counts sharps and flats, major and minor', () => {
    expect(keyAccidentalCount('C')).toBe(0);
    expect(keyAccidentalCount('Am')).toBe(0);
    expect(keyAccidentalCount('G')).toBe(1);
    expect(keyAccidentalCount('Em')).toBe(1);
    expect(keyAccidentalCount('Bb')).toBe(2);
    expect(keyAccidentalCount('F#m')).toBe(3);
    expect(keyAccidentalCount('Cb')).toBe(7);
  });

  it('rejects nonsense', () => {
    expect(() => keyAccidentalCount('H')).toThrow(/key signature/);
  });

  it('alters the right letters', () => {
    expect(keyAlterations('C')).toEqual({});
    expect(keyAlterations('D')).toEqual({ F: 1, C: 1 });
    expect(keyAlterations('F')).toEqual({ B: -1 });
    expect(keyAlterations('Dm')).toEqual({ B: -1 });
    expect(keyAlterations('Eb')).toEqual({ B: -1, E: -1, A: -1 });
    expect(keyAlterations('C#m')).toEqual({ F: 1, C: 1, G: 1, D: 1 });
  });
});

describe('shown accidentals', () => {
  const q = (...pitches: string[]): StaffNote => ({ pitches, value: 'q' });

  it('follows the key signature', () => {
    expect(shownAccidentals([q('F#3'), q('F3'), q('C3')], 'G')).toEqual([[''], ['n'], ['']]);
    expect(shownAccidentals([q('F#3')], 'C')).toEqual([['#']]);
    expect(shownAccidentals([q('Bb2'), q('B2')], 'F')).toEqual([[''], ['n']]);
  });

  it('carries an accidental to the end of its bar, in its octave only', () => {
    const notes = [q('F#3'), q('F#3'), q('F#4'), { ...q('F3'), barAfter: true }, q('F#3')];
    expect(shownAccidentals(notes, 'C')).toEqual([['#'], [''], ['#'], ['n'], ['#']]);
  });

  it('skips a note tied over from the one before, even across a barline', () => {
    const notes: StaffNote[] = [{ ...q('C#3'), tie: true, barAfter: true }, q('C#3'), q('C#3')];
    expect(shownAccidentals(notes, 'C')).toEqual([['#'], [''], ['#']]);
  });

  it('handles chords, rests and doubles', () => {
    expect(shownAccidentals([q('E2', 'G#2'), { value: 'q' }, q('F##3'), q('Bbb2')], 'C')).toEqual([
      ['', '#'],
      [],
      ['##'],
      ['bb'],
    ]);
  });
});

describe('tab fading', () => {
  it('shows tab at high guide levels and fades it away', () => {
    expect(tabVisibility(3)).toBe('full');
    expect(tabVisibility(2)).toBe('full');
    expect(tabVisibility(1)).toBe('faint');
    expect(tabVisibility(0)).toBe('none');
  });
});
