import { describe, expect, it } from 'vitest';
import type { FretMarker } from '../../components/fretboard/Fretboard';
import { STANDARD_TUNING, samePosition, type Position } from '../../theory';
import { dpbDisplay, dpbMakePrompt } from './logic';
import { dpbChordStyle, dpbMarkers, dpsMarkers, dpsStyle, ringedNotes } from './markers';
import { dpsAddedLine, dpsDegreeLabel, dpsMakePrompt } from './scale';

const ctx = {
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel: 0,
  rng: () => 0,
} as const;
const box = (id: string) => dpbMakePrompt({ id, skillId: 'C7.minor-boxes' }, ctx);
const scale = (id: string) => dpsMakePrompt({ id, skillId: 'I7.positions' }, ctx);

const state = (over: { taps?: Position[]; guided?: boolean; answered?: boolean } = {}) => ({
  taps: over.taps ?? [],
  guided: over.guided ?? false,
  answered: over.answered ?? false,
  tuning: STANDARD_TUNING,
});

/** The markers a worked example asks to tap: the target ring, or a shape ringed on top. */
const ringed = (ms: FretMarker[]) => ms.filter((m) => m.emphasis);
const at = (ms: FretMarker[], p: Position) => ms.find((m) => samePosition(m, p));

const BOXES = [1, 2, 3, 4, 5].flatMap((b) => [`${b}@minor`, `${b}@major`]);

describe('dpbMarkers: overlay worked example', () => {
  it.each(BOXES)('rings and labels every target of box %s, chord tones in their shapes', (b) => {
    const p = box(`penta-box:${b}`);
    const ms = dpbMarkers(p, state({ guided: true }));
    expect(ringed(ms)).toHaveLength(p.targets.length);
    for (const t of p.targets) {
      const m = at(ms, t)!;
      expect(m.forceLabel).toBe(true);
      expect(m.label).toBe(t.degree === '1' ? dpbDisplay(p.root) : dpbDisplay(t.degree));
      const shape = dpbChordStyle(t.degree);
      expect(m).toMatchObject({ style: shape ?? 'tone', emphasis: true });
    }
    expect(ms.some((m) => m.style === 'target')).toBe(false);
  });

  it('keeps a target 5th a triangle where a box holds a chord tone off the shape', () => {
    const shaped = BOXES.flatMap((b) =>
      dpbMarkers(box(`penta-box:${b}`), state({ guided: true })).filter((m) => m.emphasis),
    );
    expect(shaped.length).toBeGreaterThan(0);
    expect(shaped.some((m) => m.style === 'fifth')).toBe(true);
  });

  it('draws the given chord by degree, the roots as squares named by letter', () => {
    const p = box('penta-box:1@minor');
    const ms = dpbMarkers(p, state({ guided: true }));
    for (const g of p.given) {
      const m = at(ms, g)!;
      expect(m.style).toBe(dpbChordStyle(g.degree));
      expect(m.emphasis).toBeUndefined();
      if (g.degree === '1') expect(m.label).toBe('C');
    }
  });

  it('hides the targets on a recall rep, and turns a found one correct', () => {
    const p = box('penta-box:1@minor');
    expect(dpbMarkers(p, state())).toHaveLength(p.given.length);
    const [first] = p.targets;
    const ms = dpbMarkers(p, state({ guided: true, taps: [first!] }));
    expect(at(ms, first!)?.style).toBe('correct');
    expect(ringed(ms)).toHaveLength(p.targets.length - 1);
  });

  it('ghosts the missed targets and marks a wrong tap in feedback', () => {
    const p = box('penta-box:1@minor');
    const ms = dpbMarkers(p, state({ answered: true, taps: [{ string: 4, fret: 13 }] }));
    expect(ms.filter((m) => m.style === 'ghost')).toHaveLength(p.targets.length);
    expect(ms.find((m) => m.style === 'wrong')).toMatchObject({ label: 'D♯' });
  });
});

describe('dpbMarkers: relative worked example', () => {
  it.each(BOXES)('labels every relative root in box %s', (b) => {
    const p = box(`penta-relative:${b}`);
    const ms = dpbMarkers(p, state({ guided: true }));
    const rel = dpbDisplay(p.relative.root);
    expect(ringed(ms)).toEqual(
      p.targets.map((t) => ({
        string: t.string,
        fret: t.fret,
        style: 'tone',
        label: rel,
        forceLabel: true,
        emphasis: true,
      })),
    );
  });

  it('draws the rest of the box as plain dots, named only once answered', () => {
    const p = box('penta-relative:1@minor');
    const before = dpbMarkers(p, state()).filter((m) => m.style === 'tone');
    expect(before.every((m) => m.label === undefined)).toBe(true);
    const after = dpbMarkers(p, state({ answered: true })).filter((m) => m.style === 'tone');
    expect(after.every((m) => m.forceLabel && m.label)).toBe(true);
  });
});

const POSITIONS = [1, 2, 3, 4, 5];

describe('dpsMarkers (I7)', () => {
  it.each(POSITIONS)('draws position %s with 3rds and 5ths in their shapes', (n) => {
    const p = scale(`scale-position:${n}`);
    const ms = dpsMarkers(p, state());
    for (const g of p.given) {
      expect(at(ms, g)?.style).toBe(dpsStyle(g.degree) ?? 'tone');
    }
    expect(ms.some((m) => m.style === 'third')).toBe(true);
    expect(ms.some((m) => m.style === 'fifth')).toBe(true);
  });

  it.each(POSITIONS)('rings and labels every 4th and 7th of position %s', (n) => {
    const p = scale(`scale-position:${n}`);
    const ms = dpsMarkers(p, state({ guided: true }));
    expect(ringed(ms)).toEqual(
      p.targets.map((t) => ({
        string: t.string,
        fret: t.fret,
        style: 'tone',
        label: dpsDegreeLabel(t.degree),
        forceLabel: true,
        emphasis: true,
      })),
    );
  });

  it.each([1, 3, 5, 7])('rings every note of a run from the %ith, each in its shape', (d) => {
    const p = scale(`scale-run:2@${d}`);
    const ms = dpsMarkers(p, state({ guided: true }));
    expect(ringed(ms)).toHaveLength(p.targets.length);
    for (const t of p.targets) {
      const m = at(ms, t)!;
      expect(m.label).toBe(t.degree === 1 ? dpbDisplay(p.tonic) : dpsDegreeLabel(t.degree));
      const shape = dpsStyle(t.degree);
      expect(m).toMatchObject({ style: shape ?? 'tone', emphasis: true });
    }
  });

  it('marks played notes correct and wrong taps in feedback', () => {
    const p = scale('scale-run:1@5');
    const ms = dpsMarkers(
      p,
      state({ answered: true, taps: [p.targets[0]!, { string: 6, fret: 9 }] }),
    );
    expect(at(ms, p.targets[0]!)?.style).toBe('correct');
    expect(ms.find((m) => m.style === 'wrong')).toMatchObject({ label: 'C♯' });
    expect(ms.filter((m) => m.style === 'ghost')).toHaveLength(p.targets.length - 1);
  });
});

describe('worked-example copy', () => {
  it('counts the ringed notes', () => {
    expect(ringedNotes(6)).toBe('6 ringed notes');
    expect(ringedNotes(1)).toBe('ringed note');
    expect(ringedNotes(3, 'E♭')).toBe('3 ringed E♭ notes');
    expect(ringedNotes(1, 'F')).toBe('ringed F');
  });

  it("names a position's added notes by degree and name", () => {
    expect(dpsAddedLine(scale('scale-position:1'))).toBe(
      'The ringed notes are the 4ths (F) and 7ths (B).',
    );
  });
});
