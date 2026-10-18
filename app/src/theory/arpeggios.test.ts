import { describe, expect, it } from 'vitest';
import { CHROMATIC_ROOTS } from '../test/fixtures';
import {
  arpeggioBoxQuality,
  arpeggioInWindow,
  cagedArpeggio,
  chordScaleFit,
  chordTonesIn,
  guideTones,
  targetNotes,
} from './arpeggios';
import { CHORD_KINDS, chordDegreeSemitones, spellChord } from './chords';
import { chromaOf, midiAt, noteAt, samePitchClass, type Position } from './fretboard';
import { majorScalePosition, pentatonicBox, pentatonicScale } from './pentatonic';
import { CAGED_ORDER, cagedShape } from './shapes';

const cells = (notes: readonly Position[]) => notes.map((n) => `${n.string}:${n.fret}`).join(' ');
const holds = (outer: readonly Position[], inner: readonly Position[]) =>
  inner.every((p) => outer.some((o) => o.string === p.string && o.fret === p.fret));

describe('arpeggioBoxQuality', () => {
  it('uses the minor box for chords with a minor third, the major box otherwise', () => {
    expect(arpeggioBoxQuality('m7')).toBe('minor');
    expect(arpeggioBoxQuality('m7b5')).toBe('minor');
    expect(arpeggioBoxQuality('dim7')).toBe('minor');
    expect(arpeggioBoxQuality('7')).toBe('major');
    expect(arpeggioBoxQuality('sus4')).toBe('major');
    expect(arpeggioBoxQuality('augmented')).toBe('major');
  });
});

describe('cagedArpeggio', () => {
  it('builds the E-shape A major arpeggio at frets 4–7', () => {
    const arp = cagedArpeggio('E', 'A', 'major');
    expect(arp.span).toEqual({ from: 4, to: 7 });
    expect(cells(arp.notes)).toBe('6:5 5:4 5:7 4:7 3:6 2:5 1:5');
    expect(arp.notes.map((n) => n.degree)).toEqual(['1', '3', '5', '1', '3', '5', '1']);
    expect(arp.notes.map((n) => n.pc)).toEqual(['A', 'C#', 'E', 'A', 'C#', 'E', 'A']);
  });

  it('adds the 7th for seventh chords: A7 and Am7 in the E shape', () => {
    expect(cagedArpeggio('E', 'A', '7').notes.map((n) => n.degree)).toContain('b7');
    const am7 = cagedArpeggio('E', 'A', 'm7');
    expect(am7.span).toEqual({ from: 5, to: 8 });
    expect(am7.notes.map((n) => n.degree).join(' ')).toBe('1 b3 5 b7 1 b3 5 b7 1 b3');
    expect(cells(am7.notes)).toBe('6:5 6:8 5:7 4:5 4:7 3:5 2:5 2:8 1:5 1:8');
  });

  it('places the arpeggio above a minimum fret', () => {
    expect(cagedArpeggio('E', 'A', 'major', { minFret: 6 }).span.from).toBe(16);
  });

  it('holds every chord tone, and only chord tones, in every shape, kind and root', () => {
    for (const { kind, formula } of CHORD_KINDS) {
      for (const root of CHROMATIC_ROOTS) {
        const tones = spellChord(root, kind);
        for (const shape of CAGED_ORDER) {
          const label = `${shape} shape ${root}${kind}`;
          const arp = cagedArpeggio(shape, root, kind);
          for (const n of arp.notes) {
            expect(n.fret >= arp.span.from && n.fret <= arp.span.to, label).toBe(true);
            expect(samePitchClass(noteAt(n).pc, n.pc), label).toBe(true);
            expect(tones).toContain(n.pc);
            const above = (((noteAt(n).chroma - chromaOf(root)) % 12) + 12) % 12;
            expect(above, label).toBe(chordDegreeSemitones(n.degree) % 12);
          }
          for (const degree of formula) {
            expect(
              arp.notes.some((n) => n.degree === degree),
              `${label} has its ${degree}`,
            ).toBe(true);
          }
          const midis = arp.notes.map((n) => midiAt(n));
          expect(midis, label).toEqual([...midis].sort((a, b) => a - b));
        }
      }
    }
  });

  it('contains the CAGED grip of the same shape for major, minor and 7 chords', () => {
    for (const root of CHROMATIC_ROOTS) {
      for (const shape of CAGED_ORDER) {
        for (const kind of ['major', 'minor'] as const) {
          const arp = cagedArpeggio(shape, root, kind);
          const placed = cagedShape(shape, root, { quality: kind, minFret: arp.span.from });
          expect(holds(arp.notes, placed.notes), `${shape} ${root} ${kind}`).toBe(true);
        }
        const dom = cagedArpeggio(shape, root, '7');
        const grip7 = cagedShape(shape, root, { quality: 'dominant7', minFret: dom.span.from });
        expect(holds(dom.notes, grip7.notes), `${shape} ${root}7`).toBe(true);
      }
    }
  });
});

describe('arpeggioInWindow', () => {
  it('finds the chord tones of C in open position', () => {
    const notes = arpeggioInWindow('C', 'major', { from: 0, to: 3 });
    expect(notes[0]).toMatchObject({ string: 6, fret: 0, pc: 'E', degree: '3' });
    expect(notes.every((n) => ['C', 'E', 'G'].includes(n.pc))).toBe(true);
    expect(cells(notes)).toBe('6:0 6:3 5:3 4:2 3:0 2:1 1:0 1:3');
  });
});

describe('chord tones in a box or position', () => {
  it('finds A7 inside the A minor box: no 3rd, because C# is not in the box', () => {
    const box = pentatonicBox('A', 'minor', 1);
    const tones = chordTonesIn(box.notes, 'A', '7');
    expect(new Set(tones.map((n) => n.degree))).toEqual(new Set(['1', '5', 'b7']));
    expect(tones.every((n) => holds(box.notes, [n]))).toBe(true);
  });

  it('finds every diatonic seventh chord whole inside every major-scale position', () => {
    const pos = majorScalePosition('G', 2);
    const chords = [
      ['G', 'maj7'],
      ['A', 'm7'],
      ['B', 'm7'],
      ['C', 'maj7'],
      ['D', '7'],
      ['E', 'm7'],
      ['F#', 'm7b5'],
    ] as const;
    for (const [root, kind] of chords) {
      const degrees = new Set(chordTonesIn(pos.notes, root, kind).map((n) => n.degree));
      expect(degrees.size, `${root}${kind}`).toBe(4);
    }
  });

  it('lists target notes: the 3rd and 7th of G7 in C major position 1', () => {
    const targets = targetNotes(majorScalePosition('C', 1).notes, 'G', '7');
    expect(new Set(targets.map((n) => n.pc))).toEqual(new Set(['B', 'F']));
    expect(new Set(targets.map((n) => n.degree))).toEqual(new Set(['3', 'b7']));
  });
});

describe('guideTones', () => {
  it('is the 3rd and 7th, or just the 3rd of a triad', () => {
    expect(guideTones('maj7')).toEqual(['3', '7']);
    expect(guideTones('m7b5')).toEqual(['b3', 'b7']);
    expect(guideTones('dim7')).toEqual(['b3', 'bb7']);
    expect(guideTones('major')).toEqual(['3']);
    expect(guideTones('sus4')).toEqual([]);
  });
});

describe('chordScaleFit', () => {
  it('shows what a scale lacks over a chord', () => {
    expect(chordScaleFit('A', '7', pentatonicScale('A', 'minor'))).toEqual({
      inside: ['1', '5', 'b7'],
      outside: ['3'],
    });
    expect(chordScaleFit('A', 'm7', pentatonicScale('A', 'minor'))).toEqual({
      inside: ['1', 'b3', '5', 'b7'],
      outside: [],
    });
    // Enharmonic spelling doesn't matter: Gb major pentatonic over F#.
    expect(chordScaleFit('F#', 'major', pentatonicScale('Gb', 'major')).outside).toEqual([]);
  });
});
