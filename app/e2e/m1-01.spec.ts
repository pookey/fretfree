import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// The sections the route registry (app/src/routes/*.route.tsx) declares, in
// nav order. The session route has no nav entry, so it must not appear.
const SECTIONS = [
  { label: 'Today', href: '/' },
  { label: 'Learn', href: '/learn' },
  { label: 'Explore', href: '/explore' },
  { label: 'Progress', href: '/progress' },
  { label: 'Settings', href: '/settings' },
];

async function expectNavFromRegistry(page: Page) {
  const links = page.getByRole('navigation', { name: 'Sections' }).getByRole('link');
  await expect(links).toHaveCount(SECTIONS.length);
  for (const [i, { label, href }] of SECTIONS.entries()) {
    await expect(links.nth(i)).toHaveAccessibleName(label);
    await expect(links.nth(i)).toHaveAttribute('href', href);
  }
}

test.describe('M1-01 registries', () => {
  test('nav is generated from the route registry @smoke', async ({ page }) => {
    await freshStart(page);
    await expectNavFromRegistry(page);
    await expect(
      page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: /session/i }),
    ).toHaveCount(0);

    // Each nav entry routes to its screen.
    for (const { label } of SECTIONS) {
      await page
        .getByRole('navigation', { name: 'Sections' })
        .getByRole('link', { name: label })
        .click();
      await expect(page.getByRole('heading', { name: label, level: 1 })).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
  });

  test('screens compose their registered cards, panels and views', async ({ page }) => {
    await freshStart(page);
    const cards = page.locator('[data-today-card]');
    await expect(cards).toHaveCount(4);
    expect(
      await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-today-card'))),
    ).toEqual(['hero', 'quests', 'stats', 'quick-drills']);
    await expect(page.getByTestId('start-session')).toBeVisible();

    await page.goto('/progress');
    const panels = page.locator('[data-progress-panel]');
    expect(
      await panels.evaluateAll((els) => els.map((e) => e.getAttribute('data-progress-panel'))),
    ).toEqual(['heatmap', 'stats', 'achievements']);

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your data' })).toBeVisible();

    await page.goto('/explore');
    const views = page.getByRole('navigation', { name: 'Explore views' });
    await expect(views.getByRole('link').first()).toHaveText('Fretboard explorer');
    await expect(views.getByRole('link', { name: 'Fretboard explorer' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('region', { name: 'Fretboard explorer' })).toBeVisible();
    await expect(page.locator('svg[data-fret-from]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('the session route renders full screen, outside the shell', async ({ page }) => {
    await freshStart(page, '/session');
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0);
  });
});
