import { Note } from 'tonal';
import { describe, expect, it } from 'vitest';
import { DROP_D_TUNING, MAX_FRET, STANDARD_TUNING, allStrings, midiAt } from './fretboard';
import { majorKey, minorKey, relativeMinor, scaleOf, type MusicalKey } from './harmony';
import { MAJOR_KEY_TONICS } from './scales';
import {
  READING_POSITIONS,
  STAFF_LINES,
  accidentalInKey,
  accidentalMark,
  applyKeySignature,
  barAccidentals,
  describeStaffPosition,
  fretForNote,
  fretInPosition,
  isLine,
  isOnStaff,
  isPositionFret,
  keyAlterationOf,
  keySignaturePositions,
  ledgerLineCount,
  ledgerLinePositions,
  noteAtStaffPosition,
  parseReadingPosition,
  positionMap,
  positionReach,
  readingPosition,
  spellMidi,
  spellMidiInKey,
  staffNote,
  staffNoteAt,
  staffPosition,
  staffPositions,
  type Clef,
  type Stretch,
} from './staff';

const CLEFS: readonly Clef[] = ['treble8vb', 'treble'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ALL_KEYS: readonly MusicalKey[] = MAJOR_KEY_TONICS.flatMap((t) => [
  majorKey(t),
  minorKey(relativeMinor(t)),
]);
const STRETCHES: readonly Stretch[] = ['index', 'pinky', 'none'];

function midi(note: string): number {
  return Note.midi(note) as number;
}

describe('staff positions in treble 8vb', () => {
  // Sounding pitch, staff position, ledger lines: the guitar's whole low range.
  const TABLE: [string, number, number][] = [
    ['E2', -7, 3],
    ['F2', -6, 3],
    ['G2', -5, 2],
    ['A2', -4, 2],
    ['B2', -3, 1],
    ['C3', -2, 1],
    ['D3', -1, 0],
    ['E3', 0, 0],
    ['F3', 1, 0],
    ['G3', 2, 0],
    ['A3', 3, 0],
    ['B3', 4, 0],
    ['C4', 5, 0],
    ['D4', 6, 0],
    ['E4', 7, 0],
    ['F4', 8, 0],
    ['G4', 9, 0],
    ['A4', 10, 1],
    ['B4', 11, 1],
    ['C5', 12, 2],
    ['D5', 13, 2],
    ['E5', 14, 3],
    ['F5', 15, 3],
  ];

  it.each(TABLE)('%s sits at %i with %i ledger lines', (note, position, ledgers) => {
    expect(staffPosition(note)).toBe(position);
    expect(ledgerLineCount(position)).toBe(ledgers);
    expect(noteAtStaffPosition(position)).toBe(note);
  });

  it('puts the open low E three ledger lines below the staff', () => {
    expect(staffNote('E2')).toEqual({
      name: 'E2',
      written: 'E3',
      midi: 40,
      letter: 'E',
      alt: 0,
      position: -7,
      ledgerLines: 3,
    });
    expect(ledgerLinePositions(-7)).toEqual([-2, -4, -6]);
  });

  it('writes the open strings an octave above how they sound', () => {
    const written = allStrings()
      .reverse()
      .map((s) => staffNoteAt({ string: s, fret: 0 }).written);
    expect(written).toEqual(['E3', 'A3', 'D4', 'G4', 'B4', 'E5']);
    // Open G is the 2nd line, open B the middle line, open high E the 4th space.
    expect(staffPosition('G3')).toBe(2);
    expect(staffPosition('B3')).toBe(4);
    expect(staffPosition('E4')).toBe(7);
  });

  it('reads treble clef an octave higher than treble 8vb', () => {
    expect(staffPosition('E4', 'treble')).toBe(0);
    expect(staffPosition('F5', 'treble')).toBe(8);
    expect(noteAtStaffPosition(-2, 'treble')).toBe('C4');
    expect(staffNote('C4', 'treble').written).toBe('C4');
  });

  it('places a note by its letter, not its pitch', () => {
    expect(staffPosition('B#3')).toBe(4);
    expect(staffPosition('Cb4')).toBe(5);
    expect(staffPosition('Bb3')).toBe(staffPosition('B3'));
    expect(staffPosition('F##3')).toBe(staffPosition('Fb3'));
  });

  it('round-trips every position and accidental in both clefs', () => {
    for (const clef of CLEFS) {
      for (const position of staffPositions(6)) {
        for (let alt = -2; alt <= 2; alt++) {
          const note = noteAtStaffPosition(position, clef, alt);
          expect(staffPosition(note, clef)).toBe(position);
          expect(staffNote(note, clef).alt).toBe(alt);
          expect(midi(note)).toBe(midi(noteAtStaffPosition(position, clef)) + alt);
        }
      }
    }
  });

  it('rises in pitch with every step up the staff, 1 or 2 semitones at a time', () => {
    for (const clef of CLEFS) {
      const pitches = staffPositions(6).map((p) => midi(noteAtStaffPosition(p, clef)));
      for (let i = 1; i < pitches.length; i++) {
        const step = (pitches[i] as number) - (pitches[i - 1] as number);
        expect([1, 2]).toContain(step);
      }
    }
    expect(midi(noteAtStaffPosition(0, 'treble')) - midi(noteAtStaffPosition(0))).toBe(12);
  });

  it('rejects notes without an octave and fractional positions', () => {
    expect(() => staffPosition('E')).toThrow(/octave/);
    expect(() => staffPosition('H2')).toThrow(/Invalid note/);
    expect(() => staffNote('')).toThrow();
    expect(() => noteAtStaffPosition(0.5)).toThrow(RangeError);
  });
});

describe('lines, spaces and ledger lines', () => {
  it('has five lines on the even positions 0–8', () => {
    expect(STAFF_LINES).toEqual([0, 2, 4, 6, 8]);
    for (const p of staffPositions(3)) {
      expect(isLine(p)).toBe(p % 2 === 0);
      expect(isOnStaff(p)).toBe(p >= 0 && p <= 8);
    }
  });

  it('counts ledger lines between the staff and the note, including its own', () => {
    const counts = staffPositions(3).map((p) => [p, ledgerLineCount(p)]);
    expect(counts).toEqual([
      [-7, 3],
      [-6, 3],
      [-5, 2],
      [-4, 2],
      [-3, 1],
      [-2, 1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
      [9, 0],
      [10, 1],
      [11, 1],
      [12, 2],
      [13, 2],
      [14, 3],
      [15, 3],
    ]);
  });

  it('lists the ledger lines to draw, nearest the staff first', () => {
    expect(ledgerLinePositions(4)).toEqual([]);
    expect(ledgerLinePositions(-1)).toEqual([]);
    expect(ledgerLinePositions(-2)).toEqual([-2]);
    expect(ledgerLinePositions(-3)).toEqual([-2]);
    expect(ledgerLinePositions(9)).toEqual([]);
    expect(ledgerLinePositions(10)).toEqual([10]);
    expect(ledgerLinePositions(15)).toEqual([10, 12, 14]);
    for (const p of staffPositions(6)) {
      const lines = ledgerLinePositions(p);
      expect(lines).toHaveLength(ledgerLineCount(p));
      for (const l of lines) expect(isLine(l) && !isOnStaff(l)).toBe(true);
    }
  });

  it('names every position for VoiceOver, each one differently', () => {
    expect(describeStaffPosition(0)).toBe('1st line');
    expect(describeStaffPosition(1)).toBe('1st space');
    expect(describeStaffPosition(2)).toBe('2nd line');
    expect(describeStaffPosition(4)).toBe('3rd line');
    expect(describeStaffPosition(7)).toBe('4th space');
    expect(describeStaffPosition(8)).toBe('5th line');
    expect(describeStaffPosition(-1)).toBe('space below the staff');
    expect(describeStaffPosition(-2)).toBe('1st ledger line below');
    expect(describeStaffPosition(-3)).toBe('space below the 1st ledger line');
    expect(describeStaffPosition(-6)).toBe('3rd ledger line below');
    expect(describeStaffPosition(-7)).toBe('space below the 3rd ledger line');
    expect(describeStaffPosition(9)).toBe('space above the staff');
    expect(describeStaffPosition(10)).toBe('1st ledger line above');
    expect(describeStaffPosition(15)).toBe('space above the 3rd ledger line');
    expect(describeStaffPosition(-24)).toBe('12th ledger line below');
    expect(describeStaffPosition(30)).toBe('11th ledger line above');
    expect(describeStaffPosition(32)).toBe('12th ledger line above');
    expect(describeStaffPosition(34)).toBe('13th ledger line above');
    expect(describeStaffPosition(50)).toBe('21st ledger line above');
    expect(describeStaffPosition(-222)).toBe('111th ledger line below');
    expect(describeStaffPosition(-224)).toBe('112th ledger line below');
    expect(describeStaffPosition(-226)).toBe('113th ledger line below');
    expect(describeStaffPosition(-242)).toBe('121st ledger line below');
    expect(describeStaffPosition(-244)).toBe('122nd ledger line below');
    expect(describeStaffPosition(-246)).toBe('123rd ledger line below');
    const names = staffPositions(12).map(describeStaffPosition);
    expect(new Set(names).size).toBe(names.length);
  });

  it('spans the space beyond the last ledger line on each side', () => {
    expect(staffPositions()).toEqual(Array.from({ length: 23 }, (_, i) => i - 7));
    expect(staffPositions(0)).toEqual(Array.from({ length: 11 }, (_, i) => i - 1));
    expect(() => staffPositions(-1)).toThrow(RangeError);
    expect(() => staffPositions(1.5)).toThrow(RangeError);
  });
});

describe('key signatures', () => {
  it('gives each letter the accidental of its scale note, in every key', () => {
    for (const key of ALL_KEYS) {
      for (const note of scaleOf(key)) {
        const letter = note.charAt(0);
        expect(applyKeySignature(letter, key)).toBe(note);
        const alt = Note.get(note).alt;
        expect(keyAlterationOf(letter, key)).toBe(alt);
        expect(keyAlterationOf(letter.toLowerCase(), key)).toBe(alt);
      }
    }
  });

  it('keeps the octave of the note it alters', () => {
    expect(applyKeySignature('F3', majorKey('G'))).toBe('F#3');
    expect(applyKeySignature('B2', majorKey('F'))).toBe('Bb2');
    expect(applyKeySignature('E4', minorKey('E'))).toBe('E4');
    expect(applyKeySignature('C4', majorKey('C#'))).toBe('C#4');
    // Theoretical keys need double sharps.
    expect(applyKeySignature('F3', majorKey('G#'))).toBe('F##3');
    expect(keyAlterationOf('F', majorKey('G#'))).toBe(2);
  });

  it('only takes unaltered notes', () => {
    expect(() => applyKeySignature('F#3', majorKey('G'))).toThrow(/unaltered/);
    expect(() => applyKeySignature('H', majorKey('G'))).toThrow(/Invalid note/);
    expect(() => keyAlterationOf('X', majorKey('G'))).toThrow(/Invalid letter/);
  });

  it('places the signs where treble clef draws them', () => {
    expect(keySignaturePositions(majorKey('C'))).toEqual([]);
    expect(keySignaturePositions(majorKey('G'))).toEqual([8]);
    expect(keySignaturePositions(minorKey('B'))).toEqual([8, 5]);
    expect(keySignaturePositions(majorKey('C#'))).toEqual([8, 5, 9, 6, 3, 7, 4]);
    expect(keySignaturePositions(majorKey('F'))).toEqual([4]);
    expect(keySignaturePositions(majorKey('Cb'))).toEqual([4, 7, 3, 6, 2, 5, 1]);
    for (const key of ALL_KEYS) {
      for (const p of keySignaturePositions(key)) expect(isOnStaff(p) || p === 9).toBe(true);
    }
  });
});

describe('accidentals in context', () => {
  it('needs no sign for a note the key signature already gives', () => {
    for (const key of ALL_KEYS) {
      for (const note of scaleOf(key)) {
        expect(accidentalInKey(`${note}3`, key)).toBeNull();
      }
    }
  });

  it('writes a natural on any letter the key signature alters', () => {
    for (const key of ALL_KEYS) {
      for (const letter of LETTERS) {
        const expected = keyAlterationOf(letter, key) === 0 ? null : 'natural';
        expect(accidentalInKey(`${letter}3`, key)).toBe(expected);
      }
    }
  });

  it('writes the sign for a note outside the key', () => {
    expect(accidentalInKey('F#3', majorKey('C'))).toBe('sharp');
    expect(accidentalInKey('Bb3', majorKey('C'))).toBe('flat');
    expect(accidentalInKey('Eb3', majorKey('F'))).toBe('flat');
    expect(accidentalInKey('F##3', majorKey('G'))).toBe('double-sharp');
    expect(accidentalInKey('Bbb3', majorKey('F'))).toBe('double-flat');
    expect(accidentalInKey('E#3', majorKey('C#'))).toBeNull();
  });

  it('carries an accidental to the barline on its own position only', () => {
    const c = majorKey('C');
    expect(barAccidentals(['F#3', 'F#3', 'F3'], c)).toEqual(['sharp', null, 'natural']);
    expect(barAccidentals(['F#3', 'F#2'], c)).toEqual(['sharp', 'sharp']);
    expect(barAccidentals(['F#3', 'G3', 'F#3'], c)).toEqual(['sharp', null, null]);
    expect(barAccidentals(['F3', 'F#3', 'F#3'], majorKey('G'))).toEqual(['natural', 'sharp', null]);
    expect(barAccidentals(['B3', 'Bb3', 'B3'], majorKey('F'))).toEqual([
      'natural',
      'flat',
      'natural',
    ]);
    expect(barAccidentals(['F##3', 'F#3'], majorKey('G'))).toEqual(['double-sharp', 'sharp']);
    expect(barAccidentals([], c)).toEqual([]);
  });

  it('tracks positions per clef', () => {
    // E3 and E4 are different positions in either clef, so nothing carries.
    for (const clef of CLEFS) {
      expect(barAccidentals(['Eb3', 'Eb4'], majorKey('C'), clef)).toEqual(['flat', 'flat']);
    }
  });

  it('names each accidental sign', () => {
    expect([-2, -1, 0, 1, 2].map(accidentalMark)).toEqual([
      'double-flat',
      'flat',
      'natural',
      'sharp',
      'double-sharp',
    ]);
    expect(() => accidentalMark(3)).toThrow(RangeError);
  });
});

describe('spelling pitches for the staff', () => {
  it('spells a pitch for its key, octave by letter', () => {
    expect(spellMidiInKey(60, majorKey('C#'))).toBe('B#3');
    expect(spellMidiInKey(59, majorKey('Gb'))).toBe('Cb4');
    expect(spellMidiInKey(66, majorKey('D'))).toBe('F#4');
    expect(spellMidiInKey(63, majorKey('C'))).toBe('Eb4');
    expect(spellMidiInKey(54, majorKey('C'))).toBe('F#3');
    expect(spellMidiInKey(41, minorKey('A'))).toBe('F2');
  });

  it('spells every guitar pitch in every key as that pitch', () => {
    for (const key of ALL_KEYS) {
      for (let m = 40; m <= 88; m++) expect(midi(spellMidiInKey(m, key))).toBe(m);
    }
  });

  it('spells a pitch with no key by preference', () => {
    expect(spellMidi(61)).toBe('C#4');
    expect(spellMidi(61, 'flat')).toBe('Db4');
    expect(spellMidi(40)).toBe('E2');
    for (let m = 40; m <= 88; m++) {
      expect(midi(spellMidi(m))).toBe(m);
      expect(midi(spellMidi(m, 'flat'))).toBe(m);
    }
  });

  it('turns a fretted cell into a staff note', () => {
    expect(staffNoteAt({ string: 6, fret: 0 })).toMatchObject({ name: 'E2', position: -7 });
    expect(staffNoteAt({ string: 3, fret: 3 }).name).toBe('A#3');
    expect(staffNoteAt({ string: 3, fret: 3 }, { pref: 'flat' }).name).toBe('Bb3');
    expect(staffNoteAt({ string: 3, fret: 3 }, { key: majorKey('F') }).name).toBe('Bb3');
    expect(staffNoteAt({ string: 6, fret: 0 }, { tuning: DROP_D_TUNING }).name).toBe('D2');
    expect(staffNoteAt({ string: 1, fret: 0 }, { clef: 'treble' }).position).toBe(0);
  });
});

describe('reading positions', () => {
  it('teaches open, 5th, 7th, 9th and 12th position', () => {
    expect(READING_POSITIONS.map((p) => p.id)).toEqual(['open', 'pos5', 'pos7', 'pos9', 'pos12']);
    expect(READING_POSITIONS.map((p) => p.label)).toEqual([
      'Open position',
      '5th position',
      '7th position',
      '9th position',
      '12th position',
    ]);
    expect(readingPosition(0).frets).toEqual({ from: 0, to: 3 });
    expect(readingPosition(5).frets).toEqual({ from: 5, to: 8 });
    expect(readingPosition(1).label).toBe('1st position');
    expect(readingPosition(2).label).toBe('2nd position');
    expect(readingPosition(3).label).toBe('3rd position');
    expect(readingPosition(11).label).toBe('11th position');
  });

  it('parses position IDs', () => {
    expect(parseReadingPosition('open')).toEqual(readingPosition(0));
    expect(parseReadingPosition('pos5')).toEqual(readingPosition(5));
    expect(parseReadingPosition('pos12').fret).toBe(12);
    for (const bad of ['pos0', 'pos05', 'pos', '5', 'Open', 'pos-1']) {
      expect(() => parseReadingPosition(bad)).toThrow(/Invalid reading position/);
    }
    expect(() => parseReadingPosition('pos22')).toThrow(RangeError);
  });

  it('only builds positions that fit on the neck', () => {
    expect(readingPosition(MAX_FRET - 3).frets.to).toBe(MAX_FRET);
    expect(() => readingPosition(MAX_FRET - 2)).toThrow(RangeError);
    expect(() => readingPosition(-1)).toThrow(RangeError);
    expect(() => readingPosition(2.5)).toThrow(RangeError);
  });

  it('reaches a fret either side of the four frets when stretching', () => {
    expect(positionReach(readingPosition(0))).toEqual({ from: 0, to: 4 });
    expect(positionReach(readingPosition(5))).toEqual({ from: 4, to: 9 });
    expect(positionReach(readingPosition(5), { stretch: 'none' })).toEqual({ from: 5, to: 8 });
    expect(positionReach(readingPosition(MAX_FRET - 3))).toEqual({ from: 20, to: MAX_FRET });
  });

  it('plays the staff notes on the frets a reader expects', () => {
    const open = readingPosition(0);
    const fifth = readingPosition(5);
    expect(fretForNote('G3', fifth)).toEqual({ string: 4, fret: 5 });
    expect(fretForNote('E2', open)).toEqual({ string: 6, fret: 0 });
    // Open strings win over a stretch: B is the open 2nd string, not string 3 fret 4.
    expect(fretForNote('B3', open)).toEqual({ string: 2, fret: 0 });
    // Open position has no fret behind the nut, so the pinky stretches to fret 4.
    expect(fretForNote('G#2', open)).toEqual({ string: 6, fret: 4 });
    expect(fretForNote('C#3', open, { stretch: 'index' })).toEqual({ string: 5, fret: 4 });
    // Mid-neck the index finger reaches back by default; the pinky can reach forward instead.
    expect(fretForNote('C#3', fifth)).toEqual({ string: 5, fret: 4 });
    expect(fretForNote('C#3', fifth, { stretch: 'pinky' })).toEqual({ string: 6, fret: 9 });
    expect(fretForNote('B3', fifth)).toEqual({ string: 3, fret: 4 });
    expect(fretForNote('B3', fifth, { stretch: 'none' })).toBeNull();
    expect(fretForNote('E2', fifth)).toBeNull();
    expect(fretForNote('A4', readingPosition(12))).toEqual({ string: 3, fret: 14 });
    expect(fretForNote('E5', readingPosition(12))).toEqual({ string: 1, fret: 12 });
  });

  it('treats enharmonic spellings as one pitch', () => {
    const fifth = readingPosition(5);
    expect(fretForNote('Db3', fifth)).toEqual(fretForNote('C#3', fifth));
    expect(fretForNote('Cb4', fifth)).toEqual(fretForNote('B3', fifth));
  });

  it('covers an unbroken chromatic run in standard tuning', () => {
    for (const position of READING_POSITIONS) {
      for (const stretch of ['index', 'pinky'] as const) {
        const map = positionMap(position, { stretch });
        for (let i = 1; i < map.length; i++) {
          expect((map[i] as { midi: number }).midi - (map[i - 1] as { midi: number }).midi).toBe(1);
        }
      }
    }
    // Open: low E to the pinky's G# on the top string. 5th: the index's G# on string 6 to C# on string 1.
    const open = positionMap(readingPosition(0)).map((e) => e.midi);
    expect([open[0], open.at(-1)]).toEqual([midi('E2'), midi('G#4')]);
    const fifth = positionMap(readingPosition(5)).map((e) => e.midi);
    expect([fifth[0], fifth.at(-1)]).toEqual([midi('G#2'), midi('C#5')]);
  });

  it('maps each pitch to exactly one string and fret, in every position, tuning and stretch', () => {
    for (const tuning of [STANDARD_TUNING, DROP_D_TUNING]) {
      for (let fret = 0; fret <= MAX_FRET - 3; fret++) {
        const position = readingPosition(fret);
        for (const stretch of STRETCHES) {
          const opts = { tuning, stretch };
          const reach = positionReach(position, opts);
          const map = positionMap(position, opts);
          const cells = new Set<string>();
          for (const { midi: m, at } of map) {
            expect(midiAt(at, tuning)).toBe(m);
            expect(at.fret >= reach.from && at.fret <= reach.to).toBe(true);
            expect(fretInPosition(m, position, opts)).toEqual(at);
            cells.add(`${at.string}:${at.fret}`);
          }
          expect(cells.size).toBe(map.length);
          // Exactly the mapped cells count as "the" fret for their pitch.
          let marked = 0;
          for (const string of allStrings(tuning)) {
            for (let f = reach.from; f <= reach.to; f++) {
              if (isPositionFret({ string, fret: f }, position, opts)) marked++;
            }
          }
          expect(marked).toBe(map.length);
        }
      }
    }
  });

  it('never needs a tie-break inside the four frets in standard tuning', () => {
    for (const position of READING_POSITIONS) {
      const counts = new Map<number, number>();
      for (const string of allStrings()) {
        for (let f = position.frets.from; f <= position.frets.to; f++) {
          const m = midiAt({ string, fret: f });
          counts.set(m, (counts.get(m) ?? 0) + 1);
        }
      }
      expect(Math.max(...counts.values())).toBe(1);
    }
  });

  it('puts every staff note in reach on one fret, ±3 ledger lines', () => {
    for (const position of READING_POSITIONS) {
      const map = positionMap(position);
      const lo = (map[0] as { midi: number }).midi;
      const hi = (map.at(-1) as { midi: number }).midi;
      for (const p of staffPositions(3)) {
        for (const alt of [-1, 0, 1]) {
          const note = noteAtStaffPosition(p, 'treble8vb', alt);
          const at = fretForNote(note, position);
          const m = midi(note);
          if (m >= lo && m <= hi) expect(at && midiAt(at)).toBe(m);
          else expect(at).toBeNull();
        }
      }
    }
  });

  it('leaves gaps it cannot reach in drop D', () => {
    const open = readingPosition(0);
    const opts = { tuning: DROP_D_TUNING };
    expect(fretInPosition(midi('F#2'), open, opts)).toEqual({ string: 6, fret: 4 });
    expect(fretInPosition(midi('G2'), open, opts)).toBeNull();
    expect(fretInPosition(midi('G#2'), open, opts)).toBeNull();
    expect(isPositionFret({ string: 6, fret: 5 }, open, opts)).toBe(false);
  });
});
