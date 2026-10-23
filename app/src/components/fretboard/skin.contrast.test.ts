import { describe, expect, it } from 'vitest';
import { itemsIn, type MarkerToken } from '../../engine/garage';
import { NECK_BOARDS } from '../guitar/skin';

// The neck skin (design §3.8, M11-08): `styles/boards.css` repaints the neck
// for the equipped board. Axe skips SVG, so Lighthouse can't see the neck:
// resolve every board's tokens from the real CSS, in both schemes, and check
// what the neck paints on its wood (as Fretboard.contrast.test.ts does for
// the default neck).
describe('board skins', async () => {
  type Rgba = [number, number, number, number];
  const LIGHT = '@media (prefers-color-scheme: light)';

  // Vitest stubs CSS imports to '', so read the real files. (The app's
  // tsconfig has no Node types, hence the untyped specifier.)
  const nodeFs = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
    readFileSync(path: URL, encoding: 'utf8'): string;
  };
  const read = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  function vars(css: string): Record<string, string> {
    return Object.fromEntries(
      [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
    );
  }
  /** Each rule's declarations by selector; later rules win. */
  function rules(css: string): Map<string, Record<string, string>> {
    const out = new Map<string, Record<string, string>>();
    for (const [, sels, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const sel of sels!.split(',').map((s) => s.trim())) {
        out.set(sel, { ...out.get(sel), ...vars(body!) });
      }
    }
    return out;
  }

  const [darkTokensCss, lightTokensCss] = read('../../styles/tokens.css').split(LIGHT);
  const rootDark = vars(darkTokensCss!);
  const rootLight = { ...rootDark, ...vars(lightTokensCss!) };

  const boardsCss = read('../../styles/boards.css');
  const lightBlock = /@media \(prefers-color-scheme: light\)\s*\{([\s\S]*?\})\s*\}/.exec(boardsCss);
  const base = rules(boardsCss.replace(lightBlock?.[0] ?? '', ''));
  const light = rules(lightBlock?.[1] ?? '');

  /** The tokens a neck sees inside `[data-neck]`, with `data-board` set. */
  function resolve(board: string, scheme: 'dark' | 'light'): Record<string, string> {
    const sel = `:root[data-board='${board}']`;
    return {
      ...(scheme === 'dark' ? rootDark : rootLight),
      ...base.get(sel),
      ...(scheme === 'light' ? light.get(':root[data-board] [data-neck]') : {}),
      ...base.get(`${sel} [data-neck]`),
    };
  }

  const neckCss = read('./Fretboard.module.css');
  const neckRules = rules(neckCss.replace(/([\w-]+):\s*([^;]+);/g, '--$1: $2;'));
  const decl = (selector: string, prop: string) => neckRules.get(selector)?.[`--${prop}`];

  function parse(color: string): Rgba {
    const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color);
    if (hex) {
      const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    const rgb = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(color);
    if (!rgb) throw new Error(`unparsed colour ${color}`);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
  }
  /** What a rule paints for `prop`, through its token, with its opacity folded in. */
  function paint(t: Record<string, string>, selector: string, prop = 'fill', opacity?: number) {
    const value = decl(selector, prop) ?? '';
    const token = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
    const [r, g, b, a] = parse(token ? t[token]! : value);
    return [r, g, b, a * (opacity ?? Number(decl(selector, 'opacity') ?? 1))] as Rgba;
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

  const MARKERS: MarkerToken[] = [
    '--root',
    '--tone',
    '--correct',
    '--wrong',
    '--chord-fifth',
    '--chord-seventh',
  ];
  /** Marker fills whose labels take `--marker-text` (correct and wrong take white). */
  const LABELLED: MarkerToken[] = ['--root', '--tone', '--chord-fifth', '--chord-seventh'];

  it('reads the real files', () => {
    expect(base.get(":root[data-board='maple']")?.['--wood']).toBeDefined();
    expect(light.get(':root[data-board] [data-neck]')?.['--root']).toBeDefined();
    expect(decl('.nut', 'fill')).toBe('var(--nut)');
    expect(decl('.marker text', 'fill')).toBe('var(--marker-text)');
    expect(decl('.inlayPlate', 'opacity')).toBeDefined();
    expect(() => parse('nope')).toThrow();
  });

  it('styles a known board only', () => {
    const named = [...base.keys(), ...light.keys()]
      .map((s) => /data-board='(\w+)'/.exec(s)?.[1])
      .filter(Boolean);
    for (const board of named) expect(NECK_BOARDS).toContain(board);
  });

  it('resolves every token the neck uses on every board', () => {
    const used = [...new Set([...neckCss.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]!))];
    for (const board of NECK_BOARDS) {
      for (const scheme of ['dark', 'light'] as const) {
        const t = resolve(board, scheme);
        expect(used.filter((u) => !t[u])).toEqual([]);
      }
    }
  });

  for (const item of itemsIn('board')) {
    const board = item.id.replace('board.', '');
    const palette = item.render.palette;

    for (const scheme of ['dark', 'light'] as const) {
      describe(`${item.name}, ${scheme} scheme`, () => {
        const t = resolve(board, scheme);
        const wood = paint(t, '.wood');
        const dimmed = over(paint(t, '.dim'), wood);
        const plate = over(
          paint(t, '.inlay', 'fill', Number(decl('.inlayPlate', 'opacity'))),
          wood,
        );
        const dimmedPlate = over(paint(t, '.dim'), plate);

        it('paints the catalogue palette, with markers as the dark scheme has them', () => {
          for (const [token, colour] of Object.entries(palette))
            expect(t[token], token).toBe(colour);
          for (const m of MARKERS) expect(t[m], m).toBe(palette[m] ?? rootDark[m]);
        });

        it('keeps the nut visible on the wood (3:1)', () => {
          expect(contrast(paint(t, '.nut'), wood)).toBeGreaterThanOrEqual(3);
        });

        it('makes inactive frets look different from active ones', () => {
          expect(contrast(dimmed, wood)).toBeGreaterThanOrEqual(1.25);
        });

        it('keeps string names and guide notes readable wherever they sit', () => {
          for (const bg of [wood, dimmed, plate, dimmedPlate]) {
            expect(contrast(over(paint(t, '.stringName'), bg), bg)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(over(paint(t, '.ghost text'), bg), bg)).toBeGreaterThanOrEqual(4.5);
            expect(
              contrast(over(paint(t, '.ghost circle', 'stroke'), bg), bg),
            ).toBeGreaterThanOrEqual(3);
          }
        });

        it('keeps markers at 3:1 on the wood, and their labels at 4.5:1', () => {
          const text = paint(t, '.marker text');
          for (const m of MARKERS) {
            expect(contrast(parse(t[m]!), wood), m).toBeGreaterThanOrEqual(3);
          }
          for (const m of LABELLED) {
            expect(contrast(text, parse(t[m]!)), m).toBeGreaterThanOrEqual(4.5);
          }
        });
      });
    }
  }
});
