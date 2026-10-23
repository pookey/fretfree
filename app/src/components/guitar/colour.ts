/** Small colour helpers for shading parts drawn in one catalogue colour. */

function parse(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function hex(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** `a` blended towards `b` by `t` (0 to 1). A colour that isn't hex is returned as is. */
export function mix(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return a;
  return hex(ca.map((v, i) => v + ((cb[i] ?? v) - v) * t));
}

export const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
export const darken = (c: string, t: number) => mix(c, '#000000', t);

/** Relative luminance (WCAG), 0 for black to 1 for white; 0.5 for a colour that isn't hex. */
export function luminance(c: string): number {
  const rgb = parse(c);
  if (!rgb) return 0.5;
  const [r = 0, g = 0, b = 0] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
