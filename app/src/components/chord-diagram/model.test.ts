import { describe, expect, it } from 'vitest';
import { DROP_D_TUNING, cagedShape, triadVoicings } from '../../theory';
import {
  barresOf,
  describeVoicing,
  fretWindow,
  mutedStrings,
  parseVoicing,
  voicingFromShape,
  type ChordVoicing,
} from './model';

const F_BARRE = parseVoicing('133211', { fingers: '134211', root: 'F' });

describe('parseVoicing', () => {
  it('reads chord-book notation low string first, skipping muted strings', () => {
    const c = parseVoicing('x32010', { fingers: 'x32-1-', root: 'C' });
    expect(c.notes).toEqual([
      { string: 5, fret: 3, finger: 3, style: 'root' },
      { string: 4, fret: 2, finger: 2 },
      { string: 3, fret: 0 },
      { string: 2, fret: 1, finger: 1, style: 'root' },
      { string: 1, fret: 0 },
    ]);
  });

  it('reads dash-separated two-digit frets and a thumb', () => {
    const d = parseVoicing('x-x-12-14-15-14', { fingers: 'x-x-1-2-4-3' });
    expect(d.notes.map((n) => [n.string, n.fret, n.finger])).toEqual([
      [4, 12, 1],
      [3, 14, 2],
      [2, 15, 4],
      [1, 14, 3],
    ]);
    const thumb = parseVoicing('2x0232', { fingers: 'Tx0132' });
    expect(thumb.notes[0]).toEqual({ string: 6, fret: 2, finger: 'T' });
  });

  it('never gives an open string a finger and leaves styles off without a root', () => {
    const e = parseVoicing('022100', { fingers: '023100' });
    expect(e.notes[0]).toEqual({ string: 6, fret: 0 });
    expect(e.notes.every((n) => n.style === undefined)).toBe(true);
  });

  it('respects the tuning when finding roots', () => {
    const d = parseVoicing('000232', { root: 'D', tuning: DROP_D_TUNING });
    expect(d.notes.filter((n) => n.style === 'root').map((n) => n.string)).toEqual([6, 4, 2]);
  });

  it('rejects the wrong number of strings and bad frets', () => {
    expect(() => parseVoicing('x3201')).toThrow(RangeError);
    expect(() => parseVoicing('x32010', { fingers: 'x32' })).toThrow(/fingers/);
    expect(() => parseVoicing('x3201?')).toThrow(/Bad fret/);
  });
});

describe('voicingFromShape', () => {
  it('styles and labels a CAGED shape by degree', () => {
    const v = voicingFromShape(cagedShape('E', 'A', { quality: 'dominant7' }));
    const byDegree = Object.fromEntries(v.notes.map((n) => [n.label, n.style]));
    expect(byDegree).toEqual({ R: 'root', '3': 'third', '5': 'fifth', b7: 'seventh' });
  });

  it('maps a minor 3rd to the third style', () => {
    const [triad] = triadVoicings('A', 'minor', 3, 0);
    const v = voicingFromShape(triad!);
    expect(v.notes.find((n) => n.label === 'b3')?.style).toBe('third');
  });
});

describe('barresOf', () => {
  it('finds a full barre from one finger on several strings', () => {
    expect(barresOf(F_BARRE)).toEqual([{ fret: 1, from: 1, to: 6, finger: 1 }]);
  });

  it('finds a partial barre and ignores single fingers and open strings', () => {
    const bm = parseVoicing('x24432', { fingers: 'x13421' });
    expect(barresOf(bm)).toEqual([{ fret: 2, from: 1, to: 5, finger: 1 }]);
    expect(barresOf(parseVoicing('x32010', { fingers: 'x32010' }))).toEqual([]);
    const a = parseVoicing('x02220', { fingers: 'x01110' });
    expect(barresOf(a)).toEqual([{ fret: 2, from: 2, to: 4, finger: 1 }]);
  });

  it('sorts several barres by fret', () => {
    const v = parseVoicing('x-x-7-7-5-5', { fingers: 'x-x-3-3-1-1' });
    expect(barresOf(v).map((b) => b.fret)).toEqual([5, 7]);
  });

  it('lets explicit barres win', () => {
    const v: ChordVoicing = { ...F_BARRE, barres: [{ fret: 1, from: 1, to: 2 }] };
    expect(barresOf(v)).toEqual([{ fret: 1, from: 1, to: 2 }]);
  });
});

describe('mutedStrings', () => {
  it('lists the strings without a note', () => {
    expect(mutedStrings(parseVoicing('xx0232'))).toEqual([5, 6]);
    expect(mutedStrings(F_BARRE)).toEqual([]);
  });
});

describe('fretWindow', () => {
  it('starts at the nut when the shape fits', () => {
    expect(fretWindow(parseVoicing('x32010'))).toEqual({ baseFret: 1, rows: 4 });
    expect(fretWindow(parseVoicing('000000'))).toEqual({ baseFret: 1, rows: 4 });
    expect(fretWindow(parseVoicing('x-x-x-x-x-4'))).toEqual({ baseFret: 1, rows: 4 });
  });

  it('starts at the lowest fretted note up the neck, ignoring open strings', () => {
    expect(fretWindow(parseVoicing('577655'))).toEqual({ baseFret: 5, rows: 4 });
    expect(fretWindow(parseVoicing('0-7-6-0-8-0'))).toEqual({ baseFret: 6, rows: 4 });
  });

  it('grows for a wide stretch and honours a minimum', () => {
    expect(fretWindow(parseVoicing('x-5-7-9-x-x'))).toEqual({ baseFret: 5, rows: 5 });
    expect(fretWindow(parseVoicing('x32010'), 5)).toEqual({ baseFret: 1, rows: 5 });
  });

  it('counts explicit barres', () => {
    const v: ChordVoicing = {
      notes: [{ string: 1, fret: 0 }],
      barres: [{ fret: 7, from: 1, to: 6 }],
    };
    expect(fretWindow(v)).toEqual({ baseFret: 7, rows: 4 });
  });
});

describe('describeVoicing', () => {
  it('reads every string low to high with fingers, roots and barres', () => {
    expect(describeVoicing(parseVoicing('x32010', { fingers: 'x32-1-', root: 'C' }))).toBe(
      'string 6 muted, string 5 fret 3 ring finger root, string 4 fret 2 middle finger, ' +
        'string 3 open, string 2 fret 1 index finger root, string 1 open',
    );
    expect(describeVoicing(F_BARRE)).toMatch(/barre at fret 1 from string 6 to string 1$/);
  });

  it('leaves out what the diagram hides', () => {
    const text = describeVoicing(F_BARRE, { fingers: false, roots: false });
    expect(text).not.toMatch(/finger|root/);
    expect(describeVoicing(parseVoicing('2x0232', { fingers: 'Tx0132' }))).toMatch(
      /^string 6 fret 2 thumb finger, string 5 muted/,
    );
    expect(
      describeVoicing(
        parseVoicing('x34', { tuning: { id: 't', name: 't', notes: ['A2', 'D3', 'G3'] } }),
        {
          tuning: { id: 't', name: 't', notes: ['A2', 'D3', 'G3'] },
        },
      ),
    ).toBe('string 3 muted, string 2 fret 3, string 1 fret 4');
  });
});
