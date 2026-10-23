import { describe, expect, it } from 'vitest';
import { contrast, darken, lighten, luminance, mix, plasticFor } from './colour';

describe('colour helpers', () => {
  it('mixes hex colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#f00', '#00f', 1)).toBe('#0000ff');
    expect(lighten('#202020', 0)).toBe('#202020');
    expect(darken('#ffffff', 1)).toBe('#000000');
  });

  it('passes a colour that is not hex through', () => {
    expect(mix('red', '#ffffff', 0.5)).toBe('red');
    expect(luminance('red')).toBe(0.5);
  });

  it('computes WCAG luminance', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#000')).toBe(0);
    expect(luminance('#f2efe8')).toBeGreaterThan(0.5);
    expect(luminance('#1b1b1b')).toBeLessThan(0.5);
  });

  it('computes WCAG contrast', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrast('#777777', '#777777')).toBe(1);
  });

  it.each([
    ['a black guard', '#1b1b1b'],
    ['a white guard', '#f2efe8'],
    ['a cream guard', '#efe3c8'],
    ['no guard on a black finish', '#161616'],
    ['no guard on a red finish', '#b3262d'],
    ['no guard on a blue metallic', '#3c6fb3'],
  ])('picks plastic that stands out on %s', (_, surface) => {
    expect(contrast(plasticFor(surface), surface)).toBeGreaterThanOrEqual(3);
  });
});
