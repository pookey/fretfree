import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M10-07: Learn says what each skill and module is for, in plain words.

async function openModule(page: Page, moduleId: string): Promise<void> {
  await freshStart(page, `/learn?module=${moduleId}`);
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
  await expect(page.getByTestId('module-detail')).toBeVisible();
}

test('a locked skill shows what it lets you do, with no topic code @smoke', async ({ page }) => {
  await openModule(page, 'intervals');
  const skill = page.getByTestId('skill-C3.thirds');
  await expect(skill).toHaveAttribute('data-status', 'locked');
  await expect(skill.getByTestId('skill-outcome')).toHaveText(
    'See a major or minor 3rd as a shape from any root: the gap that tells a major chord from a minor one.',
  );
  await expect(skill).toContainText('Locked: preview');
  await expect(skill).not.toContainText('C3');
  await expectNoHorizontalOverflow(page);
});

test('a module reads as an outcome, with plain "Builds on" and a callout to you', async ({
  page,
}) => {
  await openModule(page, 'harmony');
  const detail = page.getByTestId('module-detail');
  await expect(detail).toContainText(
    'Name the chords of any major key by number, so a chart in Roman or Nashville numerals plays in any key.',
  );
  await expect(detail).toContainText('Builds on: Triads (Chords) and scale degrees (Keys)');
  await expect(detail.getByRole('complementary', { name: 'Watch out for' })).toContainText(
    'Expect the vi chord to be minor even though the key is major',
  );
  // Every skill in the module has its outcome.
  const skills = detail.locator('[data-testid^="skill-C8."]');
  const count = await skills.count();
  expect(count).toBeGreaterThan(0);
  await expect(detail.getByTestId('skill-outcome')).toHaveCount(count);
});

test('modules not built yet come after the open and locked ones', async ({ page }) => {
  await openModule(page, 'notes-1');
  // Jazz promotes Reading, which is built now (M8-09); Advanced is still coming soon.
  await page.getByRole('combobox', { name: 'Ordered for your goal' }).selectOption('jazz');
  const cards = page.getByRole('region', { name: 'Modules' }).getByRole('link');
  await expect(cards.first()).toHaveAttribute('data-testid', 'module-harmony');
  const states = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
  const firstSoon = states.indexOf('soon');
  expect(firstSoon).toBeGreaterThan(0);
  expect(states.slice(firstSoon)).toEqual(['soon']);
  await expect(page.getByTestId('module-reading')).not.toHaveAttribute('data-state', 'soon');
  await expect(cards.last()).toContainText('Coming soon');
});
