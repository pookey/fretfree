import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { seedString6Reviews } from './helpers/guides';
import { seedDueItems } from './helpers/octaves';

// M2-18: each drill can bring its own session context panel. D4 shows the
// octave shapes; drills without one (D1) keep the musical alphabet.

const GB_ITEM = { itemId: 'octave:s4f5→s2', skillId: 'C1.octaves-gb-shift' };

const panel = (page: Page) => page.getByTestId('context-panel');
const shapes = (page: Page) =>
  panel(page).getByRole('list', { name: 'Octave shapes' }).getByRole('listitem');
const neck = (page: Page) => page.locator('svg[data-fret-from]');

async function startD4(page: Page, guideLevel: 1 | 2 | 3): Promise<void> {
  await freshStart(page);
  await seedDueItems(page, [GB_ITEM], guideLevel);
  await focusSession(page, GB_ITEM.skillId);
  await expect(page.getByTestId('d4-prompt')).toHaveText('Tap the octave of G on string 2');
}

test.describe('M2-18 per-drill context panels', () => {
  test('a D4 session shows the octave shapes, not the alphabet', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await startD4(page, 3);

    await expect(panel(page).getByRole('heading', { name: 'Octave shapes' })).toBeVisible();
    await expect(panel(page).getByRole('heading', { name: 'Musical alphabet' })).toHaveCount(0);
    await expect(shapes(page)).toHaveCount(5);
    for (const name of [
      'Note on string 6, octave on string 4, 2 frets higher',
      'Note on string 4, octave on string 2, 3 frets higher',
      'Note on string 6, octave on string 1, same fret',
    ]) {
      await expect(panel(page).getByRole('img', { name })).toBeVisible();
    }
    await expect(panel(page)).toContainText('5→3');
    await expect(panel(page)).toContainText('a fret closer');

    // Beside the prompt on iPad landscape, below the neck in portrait; the
    // neck stays on screen either way.
    const box = (await panel(page).boundingBox())!;
    const neckBox = (await neck(page).boundingBox())!;
    if (info.project.name === 'ipad-portrait') expect(box.y).toBeGreaterThan(neckBox.y);
    else expect(box.y + box.height).toBeLessThanOrEqual(neckBox.y + 1);
    await expect(page.getByTestId('marker-root')).toBeInViewport({ ratio: 1 });

    // The prompt's shape is not marked before the answer (recall first)...
    await expect(shapes(page).and(page.locator('[aria-current="true"]'))).toHaveCount(0);
    // ...and is once it is in: two frets is one short across G–B.
    await neck(page).locator('[data-cell="s2f7"]').click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    const current = shapes(page).and(page.locator('[aria-current="true"]'));
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('2 strings over, across G–B');
  });

  test('the octave panel fades with the guides', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await startD4(page, 1);
    await expect(panel(page).getByRole('heading', { name: 'Octave shapes' })).toBeVisible();
    await expect(shapes(page)).toHaveCount(3);
    await expect(panel(page)).not.toContainText('5→3');
    await expect(panel(page)).not.toContainText('a fret closer');
  });

  test('a D1 session still shows the musical alphabet', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedString6Reviews(page, 2);
    await focusSession(page, 'F2.string6-naturals');
    // D1: a highlighted note and note-name buttons.
    await expect(page.getByTestId('marker-target')).toBeVisible();
    await expect(page.getByRole('button', { name: 'C', exact: true })).toBeVisible();
    await expect(panel(page).getByRole('heading', { name: 'Musical alphabet' })).toBeVisible();
    await expect(panel(page).getByTestId('octave-panel')).toHaveCount(0);
  });

  test('on a phone, help opens the octave shapes as a sheet @smoke', async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone-smoke', 'phone flow');
    await startD4(page, 3);
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show help' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Octave shapes' })).toBeVisible();
    await expect(shapes(page)).toHaveCount(5);
    await page.getByRole('button', { name: 'Hide help' }).click();
    await expect(panel(page)).toHaveCount(0);
  });
});
