import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine/skills';
import { STANDARD_TUNING } from '../../theory';
import { d8DiagramVoicing } from './diagram';
import { d8DegreeLabel, d8DegreeStyle, d8MakePrompt } from './logic';

/** A deterministic rng cycling through fixed values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

const ctx = (rng: () => number, scopeLevel = 0) => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as const,
  scopeLevel,
  rng,
});

const ITEM_IDS = ['C5.tones-triads', 'C5.tones-sevenths'].flatMap((id) =>
  getSkill(id)!
    .items()
    .map((i) => i.id),
);

const item = (id: string) => ({ id, skillId: 'C5.tones-triads' });
describe('d8DiagramVoicing', () => {
  /** Prompts across items, shapes, roots and scopes, so every voicing kind turns up. */
  const prompts = ITEM_IDS.flatMap((id) =>
    [0, 0.2, 0.4, 0.6, 0.8, 0.95].flatMap((a) =>
      [0, 2].map((scope) => d8MakePrompt(item(id), ctx(seq(a, 1 - a, a / 2), scope))),
    ),
  );

  it('draws the neck’s notes, plain before an answer, roots squared only as roots', () => {
    for (const p of prompts) {
      const v = d8DiagramVoicing(p, false);
      expect(v.notes.map((n) => [n.string, n.fret])).toEqual(
        p.notes.map((n) => [n.string, n.fret]),
      );
      for (const [i, n] of v.notes.entries()) {
        expect(n.style).toBe(p.notes[i]!.degree === '1' ? 'root' : 'tone');
      }
    }
  });

  it('gives each dot its degree’s marker and label once revealed', () => {
    for (const p of prompts) {
      for (const [i, n] of d8DiagramVoicing(p, true).notes.entries()) {
        const degree = p.notes[i]!.degree;
        expect(n.style).toBe(d8DegreeStyle(degree));
        expect(n.label).toBe(d8DegreeLabel(degree));
      }
    }
  });

  it('bars a barre chord at its lowest fret, across the strings fretted there', () => {
    const barres = prompts.filter((p) => p.voicing === 'barre');
    expect(barres.length).toBeGreaterThan(0);
    for (const p of barres) {
      const [barre] = d8DiagramVoicing(p, false).barres ?? [];
      const under = p.notes.filter((n) => n.fret === p.span.from).map((n) => n.string);
      expect(barre).toEqual({
        fret: p.span.from,
        from: Math.min(...under),
        to: Math.max(...under),
        finger: 1,
      });
    }
    for (const p of prompts.filter((x) => x.voicing !== 'barre')) {
      expect(d8DiagramVoicing(p, false).barres).toBeUndefined();
    }
  });
});
