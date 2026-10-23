import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { focusSession } from './helpers/focus';

// M1-31: the neck reads the same in both themes. The wood doesn't change with
// the theme, so frets outside the active range must darken (recede) in light
// as they do in dark, and the nut's string names need 4.5:1 on the wood.
// Axe skips SVG text, so this checks the colours the browser actually paints.

const SKILL = 'F2.string6-naturals';
// The wood is the neck's first shape; everything else is drawn over it.
const WOOD = 'svg[data-fret-from] > rect:first-of-type';

type Rgba = [number, number, number, number];

/** Painted fill of the first element matching `selector`, with its opacity folded into alpha. */
async function paint(page: Page, selector: string): Promise<Rgba> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      const ch = s.fill.match(/[\d.]+/g)!.map(Number);
      return [ch[0]!, ch[1]!, ch[2]!, (ch[3] ?? 1) * Number(s.opacity)] as Rgba;
    });
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

async function openNeck(page: Page): Promise<void> {
  await freshStart(page);
  await focusSession(page, SKILL);
  await expect(page.getByTestId('marker-target').first()).toBeVisible();
  await expect(page.getByTestId('string-name').first()).toBeVisible();
}

for (const colorScheme of ['dark', 'light'] as const) {
  test(`nut string names are readable on the wood in ${colorScheme} @smoke`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openNeck(page);
    const wood = await paint(page, WOOD);
    const name = await paint(page, '[data-testid="string-name"]');
    expect(contrast(over(name, wood), wood)).toBeGreaterThanOrEqual(4.5);
  });

  test(`inactive frets recede in ${colorScheme} @layout`, async ({ page }, info) => {
    test.skip(!info.project.name.includes('landscape'), 'only regular-wide shows frets 13–15');
    await page.emulateMedia({ colorScheme });
    await openNeck(page);
    const dimmed = page.getByTestId('dimmed-fret');
    await expect(dimmed).toHaveCount(3);
    const wood = await paint(page, WOOD);
    const dim = await paint(page, '[data-testid="dimmed-fret"]');
    expect(luminance(over(dim, wood))).toBeLessThan(luminance(wood));
  });
}

test('screenshots the session neck in both themes for review @layout', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad-landscape', 'review shots on iPad landscape');
  await openNeck(page);
  const neck = page.locator('svg[data-fret-from]').first();
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await neck.screenshot({ path: info.outputPath(`session-neck-${colorScheme}.png`) });
  }
});
