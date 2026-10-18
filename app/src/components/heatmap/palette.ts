/**
 * The heatmap's sequential scale: viridis, which is perceptually uniform and
 * readable with every common colour-vision deficiency (and in greyscale, since
 * lightness rises monotonically). Sampled from 0.2 to 1 so the least stable
 * band still stands out against the dark neck. One colour per stability band
 * in `ENGINE_CONFIG.heatmap` (4 bounds → 5 bands).
 */
export const HEAT_COLOURS: readonly string[] = [
  '#414487',
  '#2a788e',
  '#22a884',
  '#7ad151',
  '#fde725',
];

/** Relative luminance (WCAG 2) of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function heatColour(band: number): string {
  return HEAT_COLOURS[Math.max(0, Math.min(band, HEAT_COLOURS.length - 1))] as string;
}
