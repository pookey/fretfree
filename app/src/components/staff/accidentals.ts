import { Note } from 'tonal';
import { keyAccidentalCount, type StaffNote } from './model';

/** An accidental as engraved: VexFlow's codes, "" for none. */
export type ShownAccidental = '' | '#' | '##' | 'b' | 'bb' | 'n';

const SHARP_ORDER = 'FCGDAEB';
const FLAT_ORDER = 'BEADGCF';

/** Each letter's alteration in a key signature: "D" → { F: 1, C: 1 }. */
export function keyAlterations(key: string): Record<string, number> {
  const count = keyAccidentalCount(key);
  const minor = key.endsWith('m');
  const tonic = minor ? key.slice(0, -1) : key;
  // A minor key shares its relative major's signature: 3 semitones up.
  const major = minor ? Note.transpose(tonic, 'm3') : tonic;
  const flats = Note.get(major).alt < 0 || major === 'F';
  const order = flats ? FLAT_ORDER : SHARP_ORDER;
  const alts: Record<string, number> = {};
  for (const letter of order.slice(0, count)) alts[letter] = flats ? -1 : 1;
  return alts;
}

const CODES: Record<number, ShownAccidental> = { [-2]: 'bb', [-1]: 'b', 0: 'n', 1: '#', 2: '##' };

/**
 * The accidentals to engrave, per note and pitch, by the usual rules: the
 * key signature applies to every octave; an accidental lasts to the end of
 * its bar and only in its octave; a barline resets; a note tied over from
 * the previous one repeats its pitch without one.
 */
export function shownAccidentals(notes: readonly StaffNote[], key: string): ShownAccidental[][] {
  const signature = keyAlterations(key);
  let bar = new Map<string, number>();
  return notes.map((note, i) => {
    const prev = notes[i - 1];
    const shown = (note.pitches ?? []).map((pitch): ShownAccidental => {
      const n = Note.get(pitch);
      const slot = `${n.letter}${n.oct}`;
      const current = bar.get(slot) ?? signature[n.letter] ?? 0;
      const tiedOver = prev?.tie === true && (prev.pitches ?? []).includes(pitch);
      if (tiedOver || n.alt === current) return '';
      bar.set(slot, n.alt);
      return CODES[n.alt] ?? '';
    });
    if (note.barAfter) bar = new Map();
    return shown;
  });
}
