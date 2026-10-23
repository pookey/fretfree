import { Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../config';
import { ACHIEVEMENTS } from '../gamification/achievements';
import { xpForAnswer } from '../gamification/xp';
import { CATALOGUE, itemsIn } from './catalogue';
import type { FinishType, MarkerToken } from './types';
import { CATEGORIES } from './types';

const { prices, reachability } = ENGINE_CONFIG.garage;

const forSale = CATALOGUE.filter((i) => i.price !== undefined);
const masteryFinishes = itemsIn('finish').filter((i) => i.unlockedBy !== undefined);

describe('the full catalogue', () => {
  it('lists all 12 bodies by model name, each drawn by the body file of its shape', () => {
    expect(itemsIn('body').map((b) => [b.render.shape, b.name])).toEqual([
      ['stratocaster', 'Stratocaster'],
      ['telecaster', 'Telecaster'],
      ['les-paul', 'Les Paul'],
      ['sg', 'SG'],
      ['jazzmaster', 'Jazzmaster'],
      ['es-335', 'ES-335'],
      ['superstrat', 'Superstrat'],
      ['dreadnought', 'Dreadnought'],
      ['jumbo', 'Jumbo'],
      ['parlour', 'Parlour'],
      ['concert', 'Concert (OM)'],
      ['classical', 'Classical'],
    ]);
    for (const b of itemsIn('body')) expect(b.id).toBe(`body.${b.render.shape}`);
  });

  it('sells about 15 finishes, covering all five types', () => {
    const sold = itemsIn('finish').filter((f) => f.price !== undefined);
    expect(sold.length).toBeGreaterThanOrEqual(13);
    expect(sold.length).toBeLessThanOrEqual(18);
    const types: FinishType[] = ['solid', 'sunburst', 'natural', 'metallic', 'sparkle'];
    expect(new Set(sold.map((f) => f.render.type))).toEqual(new Set(types));
  });

  it('gives every finish ordered colour stops, and every gradient at least two', () => {
    for (const f of itemsIn('finish')) {
      const { type, stops } = f.render;
      expect(stops.length, f.id).toBeGreaterThanOrEqual(type === 'solid' ? 1 : 2);
      const offsets = stops.map((s) => s.offset);
      expect(offsets, f.id).toEqual([...offsets].sort((a, b) => a - b));
      for (const s of stops) {
        expect(s.offset, f.id).toBeGreaterThanOrEqual(0);
        expect(s.offset, f.id).toBeLessThanOrEqual(1);
        expect(s.colour, f.id).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('has pickguards including none, three hardware colours, three woods and three inlays', () => {
    const pickguards = itemsIn('pickguard');
    expect(pickguards.find((p) => p.id === 'pickguard.none')?.render.colour).toBeNull();
    expect(pickguards.filter((p) => p.render.colour !== null).length).toBeGreaterThanOrEqual(3);
    expect(itemsIn('hardware').map((h) => h.id)).toEqual([
      'hardware.chrome',
      'hardware.black',
      'hardware.gold',
    ]);
    expect(itemsIn('board').map((b) => b.id)).toEqual([
      'board.rosewood',
      'board.maple',
      'board.ebony',
    ]);
    expect(itemsIn('inlay').map((i) => i.render.shape)).toEqual(['dots', 'blocks', 'trapezoids']);
  });

  it('draws every colour as a six-digit hex value', () => {
    const colours = [
      ...itemsIn('pickguard').flatMap((p) => (p.render.colour ? [p.render.colour] : [])),
      ...itemsIn('hardware').map((h) => h.render.colour),
      ...itemsIn('board').flatMap((b) => Object.values(b.render.palette)),
    ];
    for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('names every part uniquely, as <category>.<slug>', () => {
    const ids = CATALOGUE.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of CATALOGUE)
      expect(item.id).toMatch(new RegExp(`^${item.category}\\.[a-z0-9-]+$`));
    expect(new Set(CATALOGUE.map((i) => `${i.category}:${i.name}`)).size).toBe(ids.length);
  });
});

describe('how parts are obtained', () => {
  it('prices exactly the parts for sale, and no others', () => {
    expect(new Set(Object.keys(prices))).toEqual(new Set(forSale.map((i) => i.id)));
  });

  it('gets every part one way only: a price or a badge, never both', () => {
    for (const item of CATALOGUE) {
      // owned() treats any price-0 part as owned, so a badge on one would do nothing.
      expect((item.price === undefined) !== (item.unlockedBy === undefined), item.id).toBe(true);
    }
  });

  it('makes the free parts exactly one starter per category', () => {
    const free = CATALOGUE.filter((i) => i.price === 0);
    expect(free.map((i) => i.category)).toEqual([...CATEGORIES]);
  });
});

describe('mastery finishes', () => {
  const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  const allowed = /^(whole-neck|string-[1-6]-master|speed-demon|mic-notes|mic-sequences)$/;

  it('are about six finishes, each from a different badge', () => {
    expect(masteryFinishes.length).toBeGreaterThanOrEqual(5);
    expect(masteryFinishes.length).toBeLessThanOrEqual(7);
    const badges = masteryFinishes.map((f) => f.unlockedBy);
    expect(new Set(badges).size).toBe(badges.length);
    expect(CATALOGUE.filter((i) => i.unlockedBy !== undefined)).toEqual(masteryFinishes);
  });

  it('are unlocked by registered mastery, speed or mic badges, never a streak', () => {
    for (const f of masteryFinishes) {
      const badge = byId.get(f.unlockedBy!);
      expect(badge, `${f.id} names a registered achievement`).toBeDefined();
      expect(f.unlockedBy, f.id).toMatch(allowed);
      expect(f.unlockedBy, f.id).not.toMatch(/^streak-/);
      expect(badge!.category, f.id).not.toBe('streak');
    }
  });
});

describe('price reachability (design §3.8 guardrails)', () => {
  // A typical answer is the first today to a due or new card. Correct ones
  // are rated Good: counting no fluency bonus keeps the estimate low.
  const answer = { kind: 'due', stabilityDays: 0, answeredToday: 0 } as const;
  const right = xpForAnswer({ ...answer, correct: true, rating: Rating.Good });
  const wrong = xpForAnswer({ ...answer, correct: false, rating: Rating.Again });
  const perAnswer = reachability.accuracy * right + (1 - reachability.accuracy) * wrong;
  const daily = (minutes: number) => minutes * reachability.answersPerMinute * perAnswer;
  const casualDay = daily(reachability.casualMinutes);
  const regularDay = daily(reachability.regularMinutes);
  const paid = forSale.map((i) => i.price!).filter((p) => p > 0);

  it('derives daily XP from the XP config', () => {
    expect(right).toBeGreaterThan(wrong);
    // 5 min × 8 answers × (0.85 × 10 + 0.15 × 6) XP with today's config.
    expect(casualDay).toBeCloseTo(376);
    expect(regularDay).toBe(2 * casualDay);
  });

  it('makes a first purchase possible after about one Casual day', () => {
    expect(Math.min(...paid)).toBeLessThanOrEqual(reachability.cheapestCasualDays * casualDay);
  });

  it('prices nothing above about two Regular weeks', () => {
    expect(Math.max(...paid)).toBeLessThanOrEqual(reachability.priciestRegularDays * regularDay);
  });
});

describe('board palettes keep the neck readable', async () => {
  type Rgb = [number, number, number];

  // Vitest stubs CSS imports to '', so read the real files. (The app's
  // tsconfig has no Node types, hence the untyped specifier.)
  const nodeFs = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
    readFileSync(path: URL, encoding: 'utf8'): string;
  };
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

  // The neck's own colours are the dark scheme's: the wood doesn't change
  // with the theme (styles/tokens.css).
  const tokensCss = read('../../styles/tokens.css').split('@media')[0]!;
  const tokens = Object.fromEntries(
    [...tokensCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
  const neckCss = read('../../components/fretboard/Fretboard.module.css').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
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

  function rgb(hex: string): Rgb {
    const n = parseInt(/^#([0-9a-f]{6})$/i.exec(hex)![1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
    return fg.map((c, i) => c * alpha + bg[i]! * (1 - alpha)) as Rgb;
  }
  function luminance(c: Rgb): number {
    const [r, g, b] = c
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }
  function contrast(a: Rgb, b: Rgb): number {
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
  /** Neck lines: the token each paints with, and the rule that sets its opacity. */
  const LINES = [
    { token: '--string', selector: '.string' },
    { token: '--fret-wire', selector: '.wire' },
    { token: '--inlay', selector: '.inlay' },
  ] as const;

  it('reads the real neck rules and tokens', () => {
    expect(rule('.string').stroke).toBe('var(--string)');
    expect(rule('.wire').stroke).toBe('var(--fret-wire)');
    expect(rule('.inlay').fill).toBe('var(--inlay)');
    for (const m of MARKERS) expect(tokens[m], m).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('checks every colour the neck paints on the wood', () => {
    // A new neck token must be added to a palette or to these checks.
    const used = new Set([...neckCss.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]!));
    const checked = new Set<string>([
      '--wood',
      '--wood-dark',
      ...LINES.map((l) => l.token),
      ...MARKERS,
      // Fret numbers sit off the neck, and the dim overlay has its own test.
      '--text-muted',
      '--dim',
    ]);
    expect([...used].filter((t) => !checked.has(t))).toEqual([]);
  });

  for (const board of itemsIn('board')) {
    describe(board.name, () => {
      const palette = board.render.palette;
      const wood = rgb(palette['--wood']);

      it('keeps strings, fret wire and inlays at 3:1 on the wood, as painted', () => {
        for (const { token, selector } of LINES) {
          const painted = over(rgb(palette[token]), Number(rule(selector).opacity ?? 1), wood);
          expect(contrast(painted, wood), token).toBeGreaterThanOrEqual(3);
        }
      });

      it('keeps inlay-coloured text (string names, guide labels) at 4.5:1', () => {
        expect(contrast(rgb(palette['--inlay']), wood)).toBeGreaterThanOrEqual(4.5);
      });

      it('keeps every marker colour at 3:1 on the wood', () => {
        for (const m of MARKERS) {
          const colour = palette[m] ?? tokens[m]!;
          expect(contrast(rgb(colour), wood), m).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }

  it('gives a light board dark strings and inlays', () => {
    const maple = itemsIn('board').find((b) => b.id === 'board.maple')!.render.palette;
    const wood = luminance(rgb(maple['--wood']));
    expect(wood).toBeGreaterThan(0.5);
    for (const t of ['--string', '--inlay'] as const) {
      expect(luminance(rgb(maple[t])), t).toBeLessThan(wood);
    }
  });
});
