import { describe, expect, it } from 'vitest';
import { createFft } from './fft';

describe('createFft', () => {
  it('puts a sine in its bin with the expected magnitude', () => {
    const size = 64;
    const fft = createFft(size);
    const input = new Float32Array(size).map((_, i) => Math.sin((2 * Math.PI * 5 * i) / size));
    const out = new Float32Array(size / 2);
    fft.magnitudes(input, out);
    expect(out[5]).toBeCloseTo(size / 2, 3);
    out.forEach((m, k) => {
      if (k !== 5) expect(m).toBeLessThan(1e-3);
    });
  });

  it('matches a direct DFT on noise, and can be reused', () => {
    const size = 32;
    const fft = createFft(size);
    const out = new Float32Array(size / 2);
    for (const seed of [1, 2]) {
      const input = new Float32Array(size).map((_, i) => Math.sin(i * 12.9898 * seed) % 1);
      fft.magnitudes(input, out);
      for (let k = 0; k < size / 2; k += 1) {
        let re = 0;
        let im = 0;
        input.forEach((x, n) => {
          re += x * Math.cos((2 * Math.PI * k * n) / size);
          im -= x * Math.sin((2 * Math.PI * k * n) / size);
        });
        expect(out[k]).toBeCloseTo(Math.hypot(re, im), 3);
      }
    }
  });

  it('needs a power of two', () => {
    expect(() => createFft(48)).toThrow(RangeError);
    expect(() => createFft(1)).toThrow(RangeError);
    expect(createFft(2).size).toBe(2);
  });
});
