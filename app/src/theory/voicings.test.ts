import { describe, expect, it } from 'vitest';
import { chordDegreeSemitones, chordFormula, type ChordKind } from './chords';
import { STANDARD_TUNING, chromaOf, midiAt, openStringMidi, type Position } from './fretboard';
import { VOICED_KINDS, placements, templatesFor } from './voicings';

function semitonesAbove(root: string, pos: Position): number {
  return (((openStringMidi(pos.string) + pos.fret - chromaOf(root)) % 12) + 12) % 12;
}

/** Chord-book notation, low string first: `x02010`. */
function grip(kind: ChordKind, shape: string, root: string): string {
  const t = templatesFor(kind).find((x) => x.shape === shape)!;
  const notes = placements(t, root, STANDARD_TUNING, 15)[0]!;
  return [6, 5, 4, 3, 2, 1].map((s) => notes.find((n) => n.string === s)?.fret ?? 'x').join('');
}

describe('voicings', () => {
  it('spells every degree of every voicing, with the root as its lowest note', () => {
    for (const kind of VOICED_KINDS) {
      const templates = templatesFor(kind);
      expect(templates.length, kind).toBeGreaterThanOrEqual(2);
      for (const t of templates) {
        // Every degree but the 5th, which a 7th-chord grip may drop, is there.
        const degrees = new Set(t.notes.map((n) => n.degree));
        const needed = chordFormula(kind).filter((d) => d !== '5');
        for (const d of needed) expect(degrees, `${t.shape} ${kind}`).toContain(d);
        for (const root of ['C', 'F#', 'Bb', 'E']) {
          const placed = placements(t, root, STANDARD_TUNING, 15);
          expect(placed.length, `${t.shape} ${kind} at ${root}`).toBeGreaterThan(0);
          for (const notes of placed) {
            for (const n of notes) {
              expect(semitonesAbove(root, n)).toBe(chordDegreeSemitones(n.degree) % 12);
            }
            const lowest = [...notes].sort((a, b) => midiAt(a) - midiAt(b))[0]!;
            expect(lowest.degree).toBe('1');
            const frets = notes.map((n) => n.fret);
            expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(3);
          }
        }
      }
    }
  });

  it('includes the open m7♭5 and sus chords their shapes are named after', () => {
    expect(grip('m7b5', 'A', 'A')).toBe('x0101x');
    expect(grip('m7b5', 'D', 'D')).toBe('xx0111');
    expect(grip('m7b5', 'E', 'B')).toBe('7x776x');
    expect(grip('sus4', 'E', 'E')).toBe('022200');
    expect(grip('sus4', 'A', 'A')).toBe('x02230');
    expect(grip('sus4', 'D', 'D')).toBe('xx0233');
    expect(grip('sus2', 'A', 'A')).toBe('x02200');
    expect(grip('sus2', 'D', 'D')).toBe('xx0230');
    // Moved up the neck, the A shape is a barre chord: Bsus2.
    expect(grip('sus2', 'A', 'B')).toBe('x24422');
  });

  it('has no voicings for the kinds it doesn’t draw', () => {
    expect(templatesFor('dim7')).toEqual([]);
    expect(templatesFor('add9')).toEqual([]);
  });
});
