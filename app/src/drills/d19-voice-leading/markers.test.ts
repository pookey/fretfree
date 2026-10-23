import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, samePosition, type Position } from '../../theory';
import { d19DegreeStyle, d19MakePrompt, d19NoteName } from './logic';
import { d19Markers } from './markers';

const prompt = (id: string, rng: () => number = () => 0) =>
  d19MakePrompt(
    { id, skillId: 'I1.voice-leading-top-sets' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

const state = (over: { taps?: Position[]; guided?: boolean; answered?: boolean } = {}) => ({
  taps: over.taps ?? [],
  guided: over.guided ?? false,
  answered: over.answered ?? false,
  named: true,
});

const IDS = ['I-IV', 'I-V', 'IV-V', 'V-I'].flatMap((move) =>
  ['s3', 's4', 's5'].map((set) => `voice-lead:${move}@${set}`),
);

describe('d19Markers', () => {
  it.each(IDS)('rings every target of %s in its degree shape, named', (id) => {
    const p = prompt(id);
    const ringed = d19Markers(p, state({ guided: true })).filter((m) => m.emphasis);
    expect(ringed).toHaveLength(p.targets.length);
    p.targets.forEach((t, i) => {
      expect(ringed[i]).toMatchObject({
        string: t.string,
        fret: t.fret,
        style: d19DegreeStyle(t.degree),
        label: d19NoteName(p, p.to, t),
        forceLabel: true,
      });
    });
  });

  it("draws a worked example's root as the root square", () => {
    const p = prompt('voice-lead:I-IV@s3');
    const markers = d19Markers(p, state({ guided: true }));
    expect(markers.find((m) => m.label === 'F')).toMatchObject({ style: 'root', emphasis: true });
    expect(markers.some((m) => m.style === 'target')).toBe(false);
  });

  it('rings nothing on a recall rep, drawing only the starting triad', () => {
    const p = prompt('voice-lead:I-IV@s3');
    const markers = d19Markers(p, state());
    expect(markers.map((m) => m.style)).toEqual(['ghost', 'ghost', 'ghost']);
  });

  it('draws found notes unringed, and hides the starting note under a found one', () => {
    const p = prompt('voice-lead:I-IV@s3');
    const held = p.targets.find((t) => p.fromNotes.some((n) => samePosition(n, t)))!;
    const markers = d19Markers(p, state({ guided: true, taps: [held] }));
    const at = markers.filter((m) => samePosition(m, held));
    expect(at).toEqual([expect.objectContaining({ style: 'fifth', label: 'C' })]);
    expect(at[0]).not.toHaveProperty('emphasis');
    expect(markers.filter((m) => m.emphasis)).toHaveLength(2);
  });

  it('draws the whole answer and the wrong tap in feedback', () => {
    const p = prompt('voice-lead:I-IV@s3');
    const markers = d19Markers(p, state({ answered: true, taps: [{ string: 3, fret: 4 }] }));
    expect(markers.find((m) => m.style === 'wrong')).toMatchObject({ label: 'B' });
    expect(markers.filter((m) => m.group === 'd19-next')).toHaveLength(3);
    expect(markers.some((m) => m.emphasis)).toBe(false);
  });
});
