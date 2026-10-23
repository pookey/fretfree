import { describe, expect, it } from 'vitest';
import { finishBackground, metalBackground } from './swatch';

const two = [
  { offset: 1, colour: '#222222' },
  { offset: 0, colour: '#eeeeee' },
];

describe('finishBackground', () => {
  it('paints a solid finish as one shaded colour', () => {
    const bg = finishBackground({ type: 'solid', stops: [{ offset: 0, colour: '#b3262d' }] });
    expect(bg).toMatch(/^linear-gradient\(160deg, #[0-9a-f]{6} 0%, #b3262d 55%/);
  });

  it('paints a sunburst as a radial gradient of its stops, in order', () => {
    expect(finishBackground({ type: 'sunburst', stops: two })).toBe(
      'radial-gradient(circle at 50% 55%, #eeeeee 0%, #222222 100%)',
    );
  });

  it('adds grain to a natural finish', () => {
    expect(finishBackground({ type: 'natural', stops: two })).toMatch(
      /^repeating-linear-gradient.*linear-gradient\(160deg, #eeeeee 0%, #222222 100%\)$/,
    );
  });

  it('sweeps a metallic finish across', () => {
    expect(finishBackground({ type: 'metallic', stops: two })).toBe(
      'linear-gradient(135deg, #eeeeee 0%, #222222 100%)',
    );
  });

  it('flakes a sparkle finish in its last colour over its first', () => {
    const bg = finishBackground({ type: 'sparkle', stops: two });
    expect(bg).toMatch(/^radial-gradient\(circle, #222222 0 1px/);
    expect(bg).toMatch(/linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
  });

  it('falls back to grey when a finish has no stops', () => {
    expect(finishBackground({ type: 'solid', stops: [] })).toContain('#8a8a8a');
    expect(finishBackground({ type: 'sparkle', stops: [] })).toContain('#ffffff');
  });
});

describe('metalBackground', () => {
  it('lights the metal from the top left', () => {
    expect(metalBackground('#c0c0c0')).toMatch(
      /^linear-gradient\(135deg, #[0-9a-f]{6} 0%, #c0c0c0 45%/,
    );
  });
});
