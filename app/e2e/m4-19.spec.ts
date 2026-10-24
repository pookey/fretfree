import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M4-19: the progression player on a short iPad landscape screen (the mini,
// 1133 × 744, and Playwright's 1024 × 768). The stacked layout ended the neck
// 125–136pt below the fold there, so short landscape packs what sits above
// it: the whole neck is on screen, unscrolled, with the chart and Play. The
// 11" and 13" iPads keep M4-18's stacked layout. Each test sets its own
// viewport sizes, so each runs the same on every iPad project.

const MINI = [
  { width: 1133, height: 744 },
  { width: 1024, height: 768 },
] as const;

const view = (page: Page) => page.getByRole('region', { name: 'Progression player' });
const neckOf = (page: Page) => view(page).locator('svg[data-fret-from]');

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

/** The neck keeps its own shape (never letterboxed), right under its legend. */
async function expectNeckShape(page: Page, size: string): Promise<void> {
  const neck = neckOf(page);
  const shape = await neck.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const v = (el as SVGSVGElement).viewBox.baseVal;
    return { box: r.width / r.height, natural: v.width / v.height };
  });
  expect(Math.abs(shape.box / shape.natural - 1), size).toBeLessThan(0.02);
  const legend = await box(view(page).getByRole('list', { name: 'Legend' }));
  const at = await box(neck);
  expect(at.y - (legend.y + legend.height), size).toBeLessThanOrEqual(40);
}

test.describe('M4-19 progression player on a short iPad landscape', () => {
  test('the whole neck is on screen at both iPad mini sizes, with and without a capo @layout', async ({
    page,
  }, info) => {
    await freshStart(page);
    for (const size of MINI) {
      const name = `${size.width}x${size.height}`;
      await page.setViewportSize(size);
      // Loaded at this size, so nothing has scrolled.
      await page.goto('/explore?view=progression-player');
      await expect(view(page).getByTestId('player-chord')).toHaveCount(4);
      const neck = neckOf(page);
      await expect(neck).toBeVisible();

      const check = async (state: string) => {
        const n = await box(neck);
        expect(n.y, `${name} ${state}`).toBeGreaterThanOrEqual(0);
        // It ended 125–136pt below the fold here.
        expect(n.y + n.height, `${name} ${state}`).toBeLessThanOrEqual(size.height);
        // Its strings stay apart (M4-18's 19.5rem floor, near enough).
        expect(n.height, `${name} ${state}`).toBeGreaterThanOrEqual(300);
        await expectNeckShape(page, `${name} ${state}`);
        // The chart, Play and the pickers are on screen with it.
        for (const card of await view(page).getByTestId('player-chord').all()) {
          await expect(card).toBeInViewport({ ratio: 1 });
          const c = await box(card);
          expect(c.width).toBeGreaterThanOrEqual(44);
          expect(c.height).toBeGreaterThanOrEqual(44);
        }
        await expect(view(page).getByRole('button', { name: /^(Play|Stop)$/ })).toBeInViewport({
          ratio: 1,
        });
        await expect(view(page).getByRole('combobox', { name: 'Progression' })).toBeInViewport();
        await expect(view(page).getByRole('radio', { name: 'Numerals' })).toBeInViewport();
        await expect(view(page).getByRole('link', { name: 'Quiz me on this' })).toBeInViewport();
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: info.outputPath(`player-${name}-${state}.png`) });
      };
      await check('no-capo');
      // The description follows the neck here, rather than pushing it down.
      const about = view(page).getByText('The pop progression behind countless chart songs.');
      await expect(about).toBeVisible();
      expect((await box(about)).y).toBeGreaterThan((await box(neck)).y);

      // A capo adds a "sounds" line to each card and a note on the shapes.
      await view(page).getByRole('combobox', { name: 'Key' }).selectOption({ label: 'B♭ major' });
      await view(page).getByRole('combobox', { name: 'Capo' }).selectOption('3');
      await expect(view(page).getByTestId('player-capo')).toHaveText(
        'Capo on fret 3: play G major shapes, sounding B♭ major.',
      );
      await expect(view(page).getByTestId('player-neck-chord')).toHaveText(
        'G shape, capo 3: sounds B♭',
      );
      await check('capo-3');
    }
  });

  test('the 11" and 13" iPads keep the stacked layout, the neck unletterboxed @layout', async ({
    page,
  }) => {
    await freshStart(page);
    for (const size of [
      { width: 1194, height: 834 },
      { width: 1366, height: 1024 },
    ]) {
      const name = `${size.width}x${size.height}`;
      await page.setViewportSize(size);
      await page.goto('/explore?view=progression-player');
      await expect(view(page).getByTestId('player-chord')).toHaveCount(4);
      const neck = neckOf(page);
      await expect(neck).toBeVisible();
      // M4-18's layout: full-height cards (name over numeral), the transport
      // on its own row under the chart, the description beside the title.
      const card = await box(view(page).getByTestId('player-chord').first());
      expect(card.height, name).toBeGreaterThanOrEqual(88);
      const play = await box(view(page).getByRole('button', { name: 'Play' }));
      expect(play.y, name).toBeGreaterThan(card.y + card.height);
      const title = await box(view(page).getByTestId('player-title'));
      const about = await box(
        view(page).getByText('The pop progression behind countless chart songs.'),
      );
      expect(about.y, name).toBeLessThan(card.y);
      expect(about.x, name).toBeGreaterThan(title.x + title.width);
      // And the whole neck still fits there.
      const n = await box(neck);
      expect(n.y + n.height, name).toBeLessThanOrEqual(size.height);
      await expectNeckShape(page, name);
    }
  });
});
