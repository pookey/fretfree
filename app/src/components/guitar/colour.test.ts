import { describe, expect, it } from 'vitest';
import { darken, lighten, luminance, mix } from './colour';

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
});
