import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { ALL_SKILL_IDS, skillsExcept } from './helpers/skills';

/**
 * The layout sweep: every screen and the first lesson of every topic, with
 * no horizontal overflow, at every size (all four projects). Behaviour tests
 * run on ipad-landscape only (playwright.config.ts), so this is where their
 * screens are checked at the other sizes.
 */

const SCREENS = [
  '/',
  '/learn',
  '/explore',
  '/tools',
  '/progress',
  '/progress/garage',
  '/settings',
  '/about',
  '/privacy',
];

/** The first skill of each topic, in curriculum file order: `C3.thirds` for C3. */
const FIRST_OF_TOPIC = [
  ...new Map(ALL_SKILL_IDS.map((id) => [id.split('.')[0], id] as const).reverse()).values(),
].reverse();

test.describe('layout sweep @layout @smoke', () => {
  test('every screen, Explore view and tool fits', async ({ page }) => {
    test.slow();
    await freshStart(page);
    for (const path of SCREENS) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    for (const [list, nav] of [
      ['/explore', 'Explore views'],
      ['/tools', null],
    ] as const) {
      await page.goto(list);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const scope = nav ? page.getByRole('navigation', { name: nav }) : page.locator('body');
      const hrefs = await scope
        .getByRole('link')
        .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
      // Explore views are `/explore?view=…`; tools are `/tools/<id>`.
      const pages = hrefs
        .map((h) => (h.startsWith('?') ? list + h : h))
        .filter((h) => h.startsWith(list + '/') || h.startsWith(list + '?'));
      expect(pages.length, `${list} lists its pages`).toBeGreaterThan(0);
      for (const href of pages) {
        await page.goto(href);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.getByText(/^Loading .*…$/)).toHaveCount(0);
        await expectNoHorizontalOverflow(page);
      }
    }
  });

  for (const skillId of FIRST_OF_TOPIC) {
    test(`a ${skillId} lesson fits`, async ({ page }) => {
      await freshStart(page);
      await masterSkills(page, skillsExcept(skillId));
      await page.goto(`/session?skill=${skillId}`);
      const session = page.getByTestId('session');
      await expect(session).toBeVisible();
      // A drill is on screen (a prompt, worked example or intro), not an empty state.
      await expect(session.locator('[data-drill]')).toHaveAttribute('data-drill', /.+/);
      await expect(page.getByText(/^Loading .*…$/)).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    });
  }
});
