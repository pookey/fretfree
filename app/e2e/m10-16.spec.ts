import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';

// M10-16: the Learn map's header offers "Test out" for the first locked
// module in the goal's order (design §3.4), and opens that module's existing
// test-out flow (M2-16): its "Already know this?" offer, focused, then the probes.

const entry = (page: Page) => page.getByTestId('learn-test-out');
const detail = (page: Page) => page.getByTestId('module-detail');
const offer = (page: Page) => page.getByRole('region', { name: 'Already know this?' });

test.describe('M10-16 test out from the Learn map', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page, '/learn');
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  });

  test('the header opens the first locked module’s test-out @smoke @layout', async ({ page }) => {
    // A fresh profile on the general goal: Neck basics is open, Whole neck the first locked.
    await expect(page.getByTestId('module-notes-2')).toHaveAttribute('data-state', 'locked');
    const button = entry(page).getByRole('button', { name: 'Test out of Whole neck' });
    await expect(button).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await button.click();
    await expect(page).toHaveURL(/\?module=notes-2$/);
    await expect(detail(page).getByRole('heading', { name: 'Whole neck', level: 2 })).toBeVisible();
    await expect(offer(page)).toContainText('a short test of');
    const start = offer(page).getByRole('button', { name: 'Test out' });
    await expect(start).toBeFocused();
    await expect(start).toBeInViewport();

    await start.click();
    const dialog = page.getByRole('dialog', { name: 'Test out' });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('placement-probe')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('it follows the goal’s order and moves on as modules open', async ({ page }) => {
    await page.getByTestId('goal-select').selectOption('improvise');
    await expect(entry(page).getByRole('button')).toHaveText('Test out of Pentatonic');

    await page.getByTestId('goal-select').selectOption('general');
    await expect(entry(page).getByRole('button')).toHaveText('Test out of Whole neck');
    // Whole neck opens once the string 6 and 5 naturals are mastered; the header
    // then offers the next locked module in the goal's order.
    await masterSkills(page, ['F2.string6-naturals', 'F2.string5-naturals']);
    await page.reload();
    await expect(page.getByTestId('module-notes-2')).not.toHaveAttribute('data-state', 'locked');
    await expect(entry(page).getByRole('button')).toHaveText('Test out of Intervals');
  });
});
