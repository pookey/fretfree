import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M1-22: Settings (design §4, §7, §9), the About page (§1, §10) and Privacy.

const settings = (page: Page) => page.getByRole('main');
const group = (page: Page, name: string) => settings(page).getByRole('group', { name });

test.describe('M1-22 settings', () => {
  test('every setting saves at once and survives a reload', async ({ page }) => {
    await freshStart(page, '/settings');

    const guitar = group(page, 'Your guitar');
    await guitar.getByRole('combobox', { name: 'Handedness' }).selectOption('left');
    await guitar.getByRole('combobox', { name: 'Tuning' }).selectOption('drop-d');
    await guitar.getByRole('combobox', { name: 'Note names' }).selectOption('flat');

    const practice = group(page, 'Practice');
    await practice.getByRole('combobox', { name: 'Session length' }).selectOption('15');
    await practice.getByRole('combobox', { name: 'Daily goal' }).selectOption('20');
    await practice.getByRole('checkbox', { name: 'Weekend amulet' }).check();

    const sound = group(page, 'Sound');
    await sound.getByRole('slider', { name: 'Volume' }).fill('40');
    await expect(sound.getByText('40%')).toBeVisible();
    // Controlled toggles flip once the write lands, so click and wait rather than `uncheck()`.
    await sound.getByRole('checkbox', { name: 'Sound' }).click();
    await expect(sound.getByRole('checkbox', { name: 'Sound' })).not.toBeChecked();
    await expect(sound.getByRole('slider', { name: 'Volume' })).toBeDisabled();

    const reading = group(page, 'Reading music');
    await reading
      .getByRole('group', { name: 'What can you already read?' })
      .getByText('Tab', { exact: true })
      .click();
    await reading
      .getByRole('group', { name: 'What would you like to learn to read?' })
      .getByText('Standard notation', { exact: true })
      .click();

    // The sidebar ring follows the new daily goal straight away.
    await expect(page.getByTestId('sidebar-streak')).toHaveAttribute(
      'aria-label',
      /Daily goal: 0 of 20 minutes/,
    );

    await page.reload();
    await expect(guitar.getByRole('combobox', { name: 'Handedness' })).toHaveValue('left');
    await expect(guitar.getByRole('combobox', { name: 'Tuning' })).toHaveValue('drop-d');
    await expect(guitar.getByRole('combobox', { name: 'Note names' })).toHaveValue('flat');
    await expect(practice.getByRole('combobox', { name: 'Session length' })).toHaveValue('15');
    await expect(practice.getByRole('combobox', { name: 'Daily goal' })).toHaveValue('20');
    await expect(practice.getByRole('checkbox', { name: 'Weekend amulet' })).toBeChecked();
    await expect(sound.getByRole('checkbox', { name: 'Sound' })).not.toBeChecked();
    await expect(sound.getByRole('slider', { name: 'Volume' })).toHaveValue('40');
    await expect(
      reading
        .getByRole('group', { name: 'What can you already read?' })
        .getByRole('checkbox', { name: /Tab/ }),
    ).toBeChecked();
    await expect(
      reading
        .getByRole('group', { name: 'What would you like to learn to read?' })
        .getByRole('checkbox', { name: /Standard notation/ }),
    ).toBeChecked();

    await page.getByRole('link', { name: 'Today' }).first().click();
    await expect(page.getByTestId('start-session')).toHaveText('Start session (15 min)');
  });

  test('the settings sit in cards with tappable controls, side by side when wide', async ({
    page,
  }) => {
    await freshStart(page, '/settings');
    await expect(
      group(page, 'Guides and timing').getByRole('button', { name: 'Measure' }),
    ).toBeVisible();
    for (const control of [
      group(page, 'Practice').getByRole('combobox', { name: 'Daily goal' }),
      group(page, 'Sound').getByRole('slider', { name: 'Volume' }),
      group(page, 'Sound').getByRole('button', { name: 'Play a test note' }),
    ])
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    const a = (await group(page, 'Your guitar').boundingBox())!;
    const b = (await group(page, 'Practice').boundingBox())!;
    const width = page.viewportSize()!.width;
    if (width >= 1024) expect(b.y).toBeCloseTo(a.y, 0);
    else expect(b.y).toBeGreaterThan(a.y);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('M1-22 About', () => {
  test('explains the approach and privacy, from Settings and back @smoke', async ({ page }) => {
    await freshStart(page, '/settings');
    await settings(page).getByRole('link', { name: 'About FretFree' }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { name: 'About FretFree', level: 1 })).toBeVisible();

    const approach = page.getByRole('region', { name: 'How FretFree teaches' });
    await expect(approach.getByText(/not to a .learning style./)).toBeVisible();
    await expect(approach.getByRole('heading', { level: 3 })).toHaveCount(6);

    const privacy = page.getByRole('region', { name: 'Privacy' });
    await expect(privacy.getByText('No analytics.')).toBeVisible();
    await expect(privacy.getByText('Your data stays here.')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Back to Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });

  test('shows the summary beside the page at regular-wide', async ({ page }) => {
    await freshStart(page, '/about');
    const width = page.viewportSize()!.width;
    const panel = page.getByTestId('context-panel');
    await expect(panel.getByRole('heading', { name: 'In short' })).toBeVisible();
    const main = (await page.getByRole('region', { name: 'Privacy' }).boundingBox())!;
    const side = (await panel.boundingBox())!;
    if (width >= 1024) expect(side.x).toBeGreaterThan(main.x + main.width - 1);
    else expect(side.y).toBeGreaterThan(main.y);
  });
});
