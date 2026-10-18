import { describe, expect, it } from 'vitest';
import { CHROMATIC_ROOTS } from '../test/fixtures';
import { MAX_FRET, midiAt, noteAt, samePitchClass, type Position } from './fretboard';
import type { ScaleDegree } from './harmony';
import {
  BOX_NUMBERS,
  PENTATONIC_QUALITIES,
  boxAroundShape,
  boxChordShape,
  boxForShape,
  boxShape,
  majorScale3nps,
  majorScalePosition,
  majorScalePositions,
  nextBox,
  notesPerStringRun,
  pentatonicBox,
  pentatonicBoxes,
  pentatonicScale,
  positionRun,
  previousBox,
  relativeBox,
  relativeBoxNumber,
  relativePentatonic,
  sharedNotes,
  type BoxNumber,
  type MajorScaleNote,
} from './pentatonic';
import { chromaticDegree, majorScale } from './scales';
import { CAGED_ORDER, cagedChain, cagedShape } from './shapes';

const cells = (notes: readonly Position[]) => notes.map((n) => `${n.string}:${n.fret}`).join(' ');
const holds = (outer: readonly Position[], inner: readonly Position[]) =>
  inner.every((p) => outer.some((o) => o.string === p.string && o.fret === p.fret));

function expectAscending(notes: readonly Position[], label: string) {
  for (let i = 1; i < notes.length; i++) {
    expect(midiAt(notes[i] as Position), label).toBeGreaterThan(midiAt(notes[i - 1] as Position));
  }
}

describe('pentatonicScale', () => {
  it('spells minor and major pentatonics by letter', () => {
    expect(pentatonicScale('A', 'minor')).toEqual(['A', 'C', 'D', 'E', 'G']);
    expect(pentatonicScale('C', 'major')).toEqual(['C', 'D', 'E', 'G', 'A']);
    expect(pentatonicScale('Eb', 'minor')).toEqual(['Eb', 'Gb', 'Ab', 'Bb', 'Db']);
    expect(pentatonicScale('F#', 'major')).toEqual(['F#', 'G#', 'A#', 'C#', 'D#']);
  });

  it('throws on an invalid root', () => {
    expect(() => pentatonicScale('H', 'minor')).toThrow();
  });
});

describe('box numbering', () => {
  it('maps boxes 1–5 onto the E, D, C, A and G shapes', () => {
    expect(BOX_NUMBERS.map(boxShape)).toEqual(['E', 'D', 'C', 'A', 'G']);
    for (const shape of CAGED_ORDER) expect(boxShape(boxForShape(shape))).toBe(shape);
  });

  it('steps up and down the chain, wrapping at the ends', () => {
    expect(BOX_NUMBERS.map(nextBox)).toEqual([2, 3, 4, 5, 1]);
    expect(BOX_NUMBERS.map(previousBox)).toEqual([5, 1, 2, 3, 4]);
  });

  it('rejects box numbers outside 1–5', () => {
    expect(() => boxShape(6 as BoxNumber)).toThrow(RangeError);
    expect(() => nextBox(0 as BoxNumber)).toThrow(RangeError);
    expect(() => pentatonicBox('A', 'minor', 7 as BoxNumber)).toThrow(RangeError);
  });
});

describe('pentatonicBox', () => {
  it('builds the five A minor boxes as guitarists know them', () => {
    expect(cells(pentatonicBox('A', 'minor', 1).notes)).toBe(
      '6:5 6:8 5:5 5:7 4:5 4:7 3:5 3:7 2:5 2:8 1:5 1:8',
    );
    expect(cells(pentatonicBox('A', 'minor', 2).notes)).toBe(
      '6:8 6:10 5:7 5:10 4:7 4:10 3:7 3:9 2:8 2:10 1:8 1:10',
    );
    expect(cells(pentatonicBox('A', 'minor', 3).notes)).toBe(
      '6:10 6:12 5:10 5:12 4:10 4:12 3:9 3:12 2:10 2:13 1:10 1:12',
    );
    // Boxes 4 and 5 fit in open position, so that's where they're placed by default.
    expect(cells(pentatonicBox('A', 'minor', 4).notes)).toBe(
      '6:0 6:3 5:0 5:3 4:0 4:2 3:0 3:2 2:1 2:3 1:0 1:3',
    );
    expect(cells(pentatonicBox('A', 'minor', 5, { minFret: 12 }).notes)).toBe(
      '6:15 6:17 5:15 5:17 4:14 4:17 3:14 3:17 2:15 2:17 1:15 1:17',
    );
  });

  it('labels each note with its degree from the root', () => {
    const box = pentatonicBox('A', 'minor', 1);
    expect(box.notes.map((n) => n.degree)).toEqual([
      '1',
      'b3',
      '4',
      '5',
      'b7',
      '1',
      'b3',
      '4',
      '5',
      'b7',
      '1',
      'b3',
    ]);
    expect(
      pentatonicBox('C', 'major', 1)
        .notes.slice(0, 5)
        .map((n) => n.degree),
    ).toEqual(['1', '2', '3', '5', '6']);
    expect(box.span).toEqual({ from: 5, to: 8 });
    expect(box.shape).toBe('E');
  });

  it('builds every box for every root: two notes per string, ascending, in the scale', () => {
    for (const quality of PENTATONIC_QUALITIES) {
      for (const root of CHROMATIC_ROOTS) {
        const scale = pentatonicScale(root, quality);
        for (const b of BOX_NUMBERS) {
          const label = `${root} ${quality} box ${b}`;
          const box = pentatonicBox(root, quality, b);
          expect(box.notes, label).toHaveLength(12);
          for (let s = 1; s <= 6; s++) {
            expect(
              box.notes.filter((n) => n.string === s),
              label,
            ).toHaveLength(2);
          }
          expectAscending(box.notes, label);
          for (const n of box.notes) {
            expect(n.fret >= 0 && n.fret <= MAX_FRET, label).toBe(true);
            expect(samePitchClass(noteAt(n).pc, n.pc), label).toBe(true);
            expect(scale).toContain(n.pc);
            expect(n.degree).toBe(chromaticDegree(root, n.pc));
          }
          // Starts on the box's own scale note, within a 4- or 5-fret window.
          expect(box.notes[0]?.pc).toBe(scale[b - 1]);
          expect(box.span.to - box.span.from, label).toBeLessThanOrEqual(4);
          expect(box.span.from, label).toBeLessThanOrEqual(11);
        }
      }
    }
  });

  it('places the box above a minimum fret, or throws if it cannot fit', () => {
    expect(pentatonicBox('A', 'minor', 1, { minFret: 6 }).span).toEqual({ from: 17, to: 20 });
    expect(() => pentatonicBox('A', 'minor', 1, { minFret: 18 })).toThrow(RangeError);
  });
});

describe('pentatonicBoxes', () => {
  it('chains the boxes up the neck from the lowest', () => {
    expect(pentatonicBoxes('A', 'minor').map((b) => b.box)).toEqual([4, 5, 1, 2, 3]);
    expect(pentatonicBoxes('E', 'minor').map((b) => b.box)).toEqual([1, 2, 3, 4, 5]);
    expect(pentatonicBoxes('G', 'major').map((b) => b.box)).toEqual([5, 1, 2, 3, 4]);
  });

  it('links each box to the next by one shared note per string', () => {
    for (const quality of PENTATONIC_QUALITIES) {
      for (const root of CHROMATIC_ROOTS) {
        for (const b of BOX_NUMBERS) {
          const box = pentatonicBox(root, quality, b);
          const next = pentatonicBox(root, quality, nextBox(b), { minFret: box.span.from });
          const shared = sharedNotes(box, next);
          expect(
            shared.map((p) => p.string),
            `${root} ${quality} ${b}`,
          ).toEqual([6, 5, 4, 3, 2, 1]);
          // The shared notes are the top of this box and the bottom of the next.
          expect(
            holds(
              box.notes.filter((_, i) => i % 2 === 1),
              shared,
            ),
          ).toBe(true);
          expect(
            holds(
              next.notes.filter((_, i) => i % 2 === 0),
              shared,
            ),
          ).toBe(true);
        }
      }
    }
  });
});

describe('relative boxes', () => {
  it('finds the relative major or minor', () => {
    expect(relativePentatonic('A', 'minor')).toEqual({ root: 'C', quality: 'major' });
    expect(relativePentatonic('C', 'major')).toEqual({ root: 'A', quality: 'minor' });
    expect(relativePentatonic('F#', 'minor')).toEqual({ root: 'A', quality: 'major' });
    expect(relativePentatonic('Eb', 'major')).toEqual({ root: 'C', quality: 'minor' });
  });

  it('renumbers boxes: minor N is major N − 1', () => {
    expect(BOX_NUMBERS.map((b) => relativeBoxNumber(b, 'minor'))).toEqual([5, 1, 2, 3, 4]);
    expect(BOX_NUMBERS.map((b) => relativeBoxNumber(b, 'major'))).toEqual([2, 3, 4, 5, 1]);
  });

  it('reads A minor box 1 as C major box 5 at the same frets', () => {
    const rel = relativeBox(pentatonicBox('A', 'minor', 1));
    expect(rel).toMatchObject({ root: 'C', quality: 'major', box: 5, shape: 'G' });
    expect(cells(rel.notes)).toBe(cells(pentatonicBox('A', 'minor', 1).notes));
  });

  it('keeps every box at the same frets and spelling, both ways', () => {
    for (const quality of PENTATONIC_QUALITIES) {
      for (const root of CHROMATIC_ROOTS) {
        for (const b of BOX_NUMBERS) {
          const box = pentatonicBox(root, quality, b);
          const rel = relativeBox(box);
          expect(cells(rel.notes), `${root} ${quality} ${b}`).toBe(cells(box.notes));
          expect(rel.notes.map((n) => n.pc)).toEqual(box.notes.map((n) => n.pc));
          expect(relativeBox(rel)).toMatchObject({ root: box.root, quality, box: b });
        }
      }
    }
  });
});

describe('boxes and CAGED shapes', () => {
  it('holds the E-shape Am barre in box 1 and the G shape of C in C major box 5', () => {
    expect(boxChordShape(pentatonicBox('A', 'minor', 1))).toMatchObject({
      shape: 'E',
      quality: 'minor',
      rootFret: 5,
    });
    expect(boxChordShape(pentatonicBox('C', 'major', 5))).toMatchObject({
      shape: 'G',
      rootFret: 8,
    });
  });

  it('wraps its CAGED chord, for every root, quality and box', () => {
    for (const quality of PENTATONIC_QUALITIES) {
      for (const root of CHROMATIC_ROOTS) {
        for (const b of BOX_NUMBERS) {
          const label = `${root} ${quality} box ${b}`;
          const box = pentatonicBox(root, quality, b);
          const chord = boxChordShape(box);
          expect(chord.shape, label).toBe(box.shape);
          expect(chord.quality).toBe(quality);
          expect(holds(box.notes, chord.notes), label).toBe(true);
          // The chord's roots are the box's 1s.
          for (const n of chord.notes.filter((c) => c.degree === 'R')) {
            expect(box.notes.find((m) => m.string === n.string && m.fret === n.fret)?.degree).toBe(
              '1',
            );
          }
          expect(boxAroundShape(chord).span, label).toEqual(box.span);
        }
      }
    }
  });

  it('finds the box around each shape of a CAGED chain', () => {
    for (const quality of PENTATONIC_QUALITIES) {
      for (const root of CHROMATIC_ROOTS) {
        for (const shape of cagedChain(root, { quality })) {
          const lifted = cagedShape(shape.shape, root, { quality, minFret: 1 });
          const box = boxAroundShape(lifted);
          expect(box.shape).toBe(shape.shape);
          expect(holds(box.notes, lifted.notes), `${root} ${quality} ${shape.shape}`).toBe(true);
        }
      }
    }
  });

  it('rejects shapes with no box at their position, and dominant-7 shapes', () => {
    // Open E major: box 1 would need the 3rd at fret −1 on string 5.
    expect(() => boxAroundShape(cagedShape('E', 'E'))).toThrow(RangeError);
    expect(() => boxAroundShape(cagedShape('E', 'A', { quality: 'dominant7' }))).toThrow(
      RangeError,
    );
  });
});

describe('notesPerStringRun', () => {
  it('rejects a start index outside the scale', () => {
    expect(() => notesPerStringRun(['C', 'D', 'E'], 3, 2)).toThrow(RangeError);
  });
});

describe('majorScalePosition', () => {
  it('builds C major position 1 (E shape) at frets 7–10', () => {
    const pos = majorScalePosition('C', 1);
    expect(pos).toMatchObject({ tonic: 'C', position: 1, shape: 'E', span: { from: 7, to: 10 } });
    expect(cells(pos.notes)).toBe(
      '6:7 6:8 6:10 5:7 5:8 5:10 4:7 4:9 4:10 3:7 3:9 3:10 2:8 2:10 1:7 1:8 1:10',
    );
    expect(pos.notes.map((n) => n.degree).join('')).toBe('71234567123456712');
  });

  it('holds the whole scale and its pentatonic box in every position of every key', () => {
    for (const tonic of CHROMATIC_ROOTS) {
      const scale = majorScale(tonic);
      for (const p of BOX_NUMBERS) {
        const label = `${tonic} position ${p}`;
        const pos = majorScalePosition(tonic, p);
        expectAscending(pos.notes, label);
        // A continuous scale: each note is the next degree up.
        pos.notes.forEach((n, i) => {
          if (i > 0)
            expect(n.degree, label).toBe(
              (((pos.notes[i - 1] as MajorScaleNote).degree % 7) + 1) as ScaleDegree,
            );
        });
        expect(pos.notes.length, label).toBeGreaterThanOrEqual(16);
        expect(pos.span.to - pos.span.from, label).toBeLessThanOrEqual(5);
        expect(new Set(pos.notes.map((n) => n.degree)).size, label).toBe(7);
        for (const n of pos.notes) {
          expect(n.pc).toBe(scale[n.degree - 1]);
          expect(samePitchClass(noteAt(n).pc, n.pc)).toBe(true);
        }
        for (let s = 1; s <= 6; s++) {
          const count = pos.notes.filter((n) => n.string === s).length;
          expect(count >= 2 && count <= 3, `${label} string ${s}`).toBe(true);
        }
        const box = pentatonicBox(tonic, 'major', p);
        expect(holds(pos.notes, box.notes), label).toBe(true);
        expect(holds(pos.notes, boxChordShape(box).notes), label).toBe(true);
      }
    }
  });

  it('chains the five positions up the neck', () => {
    expect(majorScalePositions('C').map((p) => p.shape)).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(majorScalePositions('G').map((p) => p.position)).toEqual([5, 1, 2, 3, 4]);
  });
});

describe('positionRun', () => {
  it('runs from the lowest to the highest note on a degree', () => {
    const pos = majorScalePosition('C', 1);
    const fromRoot = positionRun(pos, 1);
    expect(fromRoot.map((n) => n.pc).join(' ')).toBe('C D E F G A B C D E F G A B C');
    expect(cells([fromRoot[0] as Position])).toBe('6:8');
    const fromSixth = positionRun(pos, 6);
    expect(fromSixth[0]?.pc).toBe('A');
    expect(fromSixth.at(-1)?.pc).toBe('A');
    expect(fromSixth).toHaveLength(8);
  });

  it('works from every degree of every position', () => {
    for (const p of BOX_NUMBERS) {
      const pos = majorScalePosition('Eb', p);
      for (const d of [1, 2, 3, 4, 5, 6, 7] as ScaleDegree[]) {
        const run = positionRun(pos, d);
        expect(run[0]?.degree).toBe(d);
        expect(run.at(-1)?.degree).toBe(d);
        expect(run.length).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('throws when the degree is missing', () => {
    expect(() => positionRun({ notes: [] }, 3)).toThrow(RangeError);
  });
});

describe('majorScale3nps', () => {
  it('builds C major from the root: three notes per string', () => {
    const run = majorScale3nps('C', 1);
    expect(cells(run.slice(0, 6))).toBe('6:8 6:10 6:12 5:8 5:10 5:12');
    expect(run.map((n) => n.degree).join('')).toBe('123456712345671234');
  });

  it('builds all seven patterns in every key', () => {
    for (const tonic of CHROMATIC_ROOTS) {
      for (const d of [1, 2, 3, 4, 5, 6, 7] as ScaleDegree[]) {
        const run = majorScale3nps(tonic, d);
        expect(run).toHaveLength(18);
        expect(run[0]?.degree).toBe(d);
        expectAscending(run, `${tonic} from ${d}`);
        for (let s = 1; s <= 6; s++) expect(run.filter((n) => n.string === s)).toHaveLength(3);
      }
    }
  });
});
