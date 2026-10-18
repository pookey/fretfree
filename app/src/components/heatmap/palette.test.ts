import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import { HEAT_COLOURS, heatColour, luminance } from './palette';

describe('heatmap palette', () => {
  it('has one colour per stability band', () => {
    expect(HEAT_COLOURS).toHaveLength(ENGINE_CONFIG.heatmap.stabilityBandsDays.length + 1);
  });

  it('is sequential: lightness rises with every band, so it reads without hue', () => {
    const l = HEAT_COLOURS.map(luminance);
    for (let i = 1; i < l.length; i++) expect(l[i]!).toBeGreaterThan(l[i - 1]!);
    // Neighbouring bands stay distinguishable in greyscale.
    for (let i = 1; i < l.length; i++)
      expect((l[i]! + 0.05) / (l[i - 1]! + 0.05)).toBeGreaterThan(1.3);
  });

  it('clamps out-of-range bands', () => {
    expect(heatColour(-1)).toBe(HEAT_COLOURS[0]);
    expect(heatColour(99)).toBe(HEAT_COLOURS.at(-1));
    expect(heatColour(2)).toBe(HEAT_COLOURS[2]);
  });

  it('measures luminance on the WCAG scale', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 6);
  });
});
