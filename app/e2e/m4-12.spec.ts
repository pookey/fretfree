import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { sectionLinks } from './helpers/nav';

// The Tools section (design §7 Tools): practice utilities, one lazy view per
// tool. Until a real tool ships, these specs switch on the test-only tool.

const TEST_TOOLS_KEY = 'fretwork.e2e.testTools';

async function enableTestTool(page: Page): Promise<void> {
  await page.addInitScript((key) => localStorage.setItem(key, '1'), TEST_TOOLS_KEY);
}

const sections = (page: Page) => page.getByRole('navigation', { name: 'Sections' });

async function sectionPaths(page: Page): Promise<(string | null)[]> {
  return sectionLinks(page).evaluateAll((links) => links.map((a) => a.getAttribute('href')));
}

test.describe('Tools section', () => {
  test('appears between Explore and Progress and opens a tool', async ({ page }) => {
    await enableTestTool(page);
    await freshStart(page, '/explore');
    expect(await sectionPaths(page)).toEqual([
      '/',
      '/learn',
      '/explore',
      '/tools',
      '/progress',
      '/settings',
    ]);

    await sections(page).getByRole('link', { name: 'Tools' }).click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(page.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible();
    const cards = page.getByRole('list', { name: 'Tools' });
    await expect(cards).toHaveAttribute('data-layout', 'grid');
    await expect(cards.getByRole('link', { name: /Test tool/ })).toContainText(
      'A stand-in tool for the end-to-end tests.',
    );
    await expectNoHorizontalOverflow(page);

    await cards.getByRole('link', { name: /Test tool/ }).click();
    await expect(page).toHaveURL(/\/tools\/test-tool$/);
    await expect(page.getByRole('heading', { name: 'Test tool', level: 1 })).toBeVisible();
    await expect(page.getByTestId('test-tool-view')).toBeVisible();
    // The section stays highlighted inside a tool.
    await expect(sections(page).getByRole('link', { name: 'Tools' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('link', { name: '← All tools' }).click();
    await expect(page).toHaveURL(/\/tools$/);
  });

  test('keeps every tab at least 44pt at 375pt wide, and lists tools on compact @smoke @layout', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await enableTestTool(page);
    await freshStart(page);
    const tabs = page.getByTestId('tabbar').getByRole('link');
    await expect(tabs.filter({ hasText: 'Tools' })).toBeVisible();
    for (const tab of await tabs.all()) {
      const box = await tab.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);

    await tabs.filter({ hasText: 'Tools' }).click();
    await expect(page.getByRole('list', { name: 'Tools' })).toHaveAttribute('data-layout', 'list');
    await page.getByRole('link', { name: /Test tool/ }).click();
    await expect(page.getByTestId('test-tool-view')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('never lists the test tool for learners', async ({ page }) => {
    await freshStart(page, '/tools');
    await expect(page.getByRole('heading', { name: 'Tools', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Test tool/ })).toHaveCount(0);

    await page.goto('/tools/test-tool');
    await expect(page.getByRole('heading', { name: 'Tool not found', level: 1 })).toBeVisible();
  });
});
