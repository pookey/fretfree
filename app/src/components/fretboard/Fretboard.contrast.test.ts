import { describe, expect, it } from 'vitest';

// Axe skips SVG text, so Lighthouse can't see the neck's contrast. Resolve the
// colours the neck's rules use from the real token file, in both schemes, and
// check them here (M1-31). e2e/m1-31.spec.ts checks the painted result.
describe('fretboard colours', async () => {
  const LIGHT = '@media (prefers-color-scheme: light)';
  type Rgba = [number, number, number, number];

  // Vitest stubs CSS imports to '', so read the real files. (The app's
  // tsconfig has no Node types, hence the untyped specifier.)
  const nodeFs = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
    readFileSync(path: URL, encoding: 'utf8'): string;
  };
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

  function vars(css: string): Record<string, string> {
    return Object.fromEntries(
      [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
    );
  }
  const [darkCss, lightCss] = read('../../styles/tokens.css').split(LIGHT);
  const darkTokens = vars(darkCss!);
  const schemes = { dark: darkTokens, light: { ...darkTokens, ...vars(lightCss!) } };

  /** Every declaration of the rules whose selector list names `selector`, in source order. */
  const neckCss = read('./Fretboard.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
  function rule(selector: string): Record<string, string> {
    const decls: Record<string, string> = {};
    for (const [, sels, body] of neckCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!sels!.split(',').some((s) => s.trim() === selector)) continue;
      for (const [, prop, value] of body!.matchAll(/([\w-]+):\s*([^;]+);/g)) {
        decls[prop!] = value!.trim();
      }
    }
    return decls;
  }

  function parse(color: string): Rgba {
    const hex = /^#([0-9a-f]{6})$/i.exec(color);
    if (hex) {
      const n = parseInt(hex[1]!, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    const rgb = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(color);
    if (!rgb) throw new Error(`unparsed colour ${color}`);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
  }

  /** A rule's paint for `prop` in a scheme, with the rule's opacity folded into alpha. */
  function paint(t: Record<string, string>, selector: string, prop = 'fill'): Rgba {
    const decls = rule(selector);
    const token = /^var\((--[\w-]+)\)$/.exec(decls[prop] ?? '')?.[1];
    expect(token, `${selector} ${prop} uses a token`).toBeDefined();
    const [r, g, b, a] = parse(t[token!]!);
    return [r, g, b, a * Number(decls.opacity ?? 1)];
  }

  function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
    return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
  }
  function luminance([r, g, b]: Rgba): number {
    const [lr, lg, lb] = [r, g, b]
      .map((c) => c / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
  }
  function contrast(a: Rgba, b: Rgba): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  }

  it('reads real rules and tokens', () => {
    expect(Object.keys(schemes.light).length).toBeGreaterThan(10);
    expect(rule('.stringName').fill).toBeDefined();
    expect(() => parse('nope')).toThrow();
  });

  it('keeps the brand off the neck', () => {
    expect(neckCss).not.toMatch(/--accent/);
  });

  for (const [name, t] of Object.entries(schemes)) {
    describe(`in the ${name} scheme`, () => {
      const wood = paint(t, '.wood');

      it('gives the nut string names 4.5:1 on the wood', () => {
        const text = over(paint(t, '.stringName'), wood);
        expect(contrast(text, wood)).toBeGreaterThanOrEqual(4.5);
        // The halo that keeps the string line out of the glyphs is the wood itself.
        expect(over(paint(t, '.stringName', 'stroke'), wood)).toEqual(wood);
      });

      it('darkens frets outside the active range, so they recede', () => {
        const dimmed = over(paint(t, '.dim'), wood);
        expect(luminance(dimmed)).toBeLessThan(luminance(wood));
      });

      it('keeps guide notes readable on the wood and on dimmed frets', () => {
        const dimmed = over(paint(t, '.dim'), wood);
        for (const bg of [wood, dimmed]) {
          expect(contrast(over(paint(t, '.ghost text'), bg), bg)).toBeGreaterThanOrEqual(4.5);
          // WCAG 1.4.11: the dashed ring is a graphic, so 3:1.
          expect(
            contrast(over(paint(t, '.ghost circle', 'stroke'), bg), bg),
          ).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }
});
