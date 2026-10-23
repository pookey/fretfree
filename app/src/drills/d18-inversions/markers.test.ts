import { describe, expect, it } from 'vitest';
import { STANDARD_TUNING, type Position } from '../../theory';
import { d18DegreeStyle, d18MakePrompt } from './logic';
import { d18Markers } from './markers';

const prompt = (id: string) =>
  d18MakePrompt(
    { id, skillId: 'I1.major-top-sets' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

const state = (over: { taps?: Position[]; guided?: boolean; answered?: boolean } = {}) => ({
  taps: over.taps ?? [],
  guided: over.guided ?? false,
  answered: over.answered ?? false,
  tuning: STANDARD_TUNING,
});

const IDS = [0, 1, 2].flatMap((inv) =>
  ['s3/major', 's4/minor', 's5/major'].map((set) => `inversion:${inv}@${set}`),
);

describe('d18Markers on a build card', () => {
  it.each(IDS)('rings every target of %s in its degree shape, labelled', (id) => {
    const p = prompt(id);
    const markers = d18Markers(p, state({ guided: true }));
    const ringed = markers.filter((m) => m.emphasis);
    expect(ringed).toHaveLength(p.targets.length);
    p.targets.forEach((t, i) => {
      expect(ringed[i]).toMatchObject({
        string: t.string,
        fret: t.fret,
        style: d18DegreeStyle(t.degree),
        label: t.degree === 'R' ? 'R' : t.degree.replace(/^b/, '♭'),
        forceLabel: true,
      });
    });
    expect(markers.some((m) => m.style === 'target')).toBe(false);
  });

  it("keeps a worked example's 5th a triangle before it's tapped", () => {
    const p = prompt('inversion:0@s3/major');
    const fifth = d18Markers(p, state({ guided: true })).find((m) => m.label === '5');
    expect(fifth).toMatchObject({ style: 'fifth', emphasis: true });
  });

  it('draws only the root before a recall rep, then each found note by degree', () => {
    const p = prompt('inversion:0@s3/major');
    expect(d18Markers(p, state()).map((m) => m.style)).toEqual(['root']);
    const third = p.targets.find((t) => t.degree === '3')!;
    const after = d18Markers(p, state({ taps: [third] }));
    expect(after.map((m) => m.style)).toEqual(['root', 'third']);
    expect(after.some((m) => m.emphasis)).toBe(false);
  });

  it('stops ringing a target once tapped', () => {
    const p = prompt('inversion:0@s3/major');
    const [first] = p.targets;
    const markers = d18Markers(p, state({ guided: true, taps: [first!] }));
    expect(markers.filter((m) => m.emphasis)).toHaveLength(p.targets.length - 1);
  });

  it('draws missed notes as ghosts and a wrong tap by its note in feedback', () => {
    const p = prompt('inversion:1@s3/major');
    const markers = d18Markers(p, state({ answered: true, taps: [{ string: 3, fret: 8 }] }));
    expect(markers.filter((m) => m.style === 'ghost').map((m) => m.label)).toEqual(['3', '5']);
    expect(markers.find((m) => m.style === 'wrong')).toMatchObject({ label: 'D♯' });
  });
});

describe('d18Markers on a name card', () => {
  it('draws plain dots until revealed, then every note by degree', () => {
    const p = prompt('inversion-name:1@s3/major');
    expect(new Set(d18Markers(p, state()).map((m) => m.style))).toEqual(new Set(['tone']));
    const shown = d18Markers(p, state({ guided: true }));
    expect(shown.map((m) => m.style).sort()).toEqual(['fifth', 'root', 'third']);
  });
});
