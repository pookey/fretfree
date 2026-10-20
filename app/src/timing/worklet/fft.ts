/**
 * A small in-place radix-2 FFT for the onset detector. Plain arrays and no
 * allocation per call, so it is safe on the audio thread.
 */
export interface Fft {
  readonly size: number;
  /** Magnitudes of bins 0…size/2 − 1 of `input` (length `size`) into `out`. */
  magnitudes(input: Float32Array, out: Float32Array): void;
}

export function createFft(size: number): Fft {
  if (size < 2 || (size & (size - 1)) !== 0) throw new RangeError('FFT size must be a power of two');
  const bits = Math.log2(size);
  const reverse = new Uint32Array(size);
  for (let i = 0; i < size; i += 1) {
    let r = 0;
    for (let b = 0; b < bits; b += 1) r = (r << 1) | ((i >> b) & 1);
    reverse[i] = r;
  }
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let i = 0; i < size / 2; i += 1) {
    cos[i] = Math.cos((2 * Math.PI * i) / size);
    sin[i] = -Math.sin((2 * Math.PI * i) / size);
  }
  const re = new Float64Array(size);
  const im = new Float64Array(size);

  return {
    size,
    magnitudes(input, out) {
      for (let i = 0; i < size; i += 1) {
        re[reverse[i]!] = input[i]!;
        im[reverse[i]!] = 0;
      }
      for (let len = 2; len <= size; len <<= 1) {
        const half = len >> 1;
        const step = size / len;
        for (let start = 0; start < size; start += len) {
          for (let k = 0; k < half; k += 1) {
            const wr = cos[k * step]!;
            const wi = sin[k * step]!;
            const a = start + k;
            const b = a + half;
            const tr = re[b]! * wr - im[b]! * wi;
            const ti = re[b]! * wi + im[b]! * wr;
            re[b] = re[a]! - tr;
            im[b] = im[a]! - ti;
            re[a] = re[a]! + tr;
            im[a] = im[a]! + ti;
          }
        }
      }
      for (let k = 0; k < size / 2; k += 1) out[k] = Math.hypot(re[k]!, im[k]!);
    },
  };
}
