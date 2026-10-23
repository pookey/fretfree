import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

const STAFF = 'Tab of an A minor pentatonic lick';

async function openTabViewer(page: Page) {
  await freshStart(page, '/explore?view=tab-viewer');
  const staff = page.getByRole('group', { name: STAFF });
  await expect(staff).toBeVisible();
  return staff;
}

test.describe('M9-01 <TabStaff>', () => {
  test('renders six lines with fret numbers, names and 44pt line targets @layout', async ({
    page,
  }) => {
    const staff = await openTabViewer(page);

    const lines = staff.getByTestId('tab-line');
    await expect(lines).toHaveCount(6);
    // Top line is string 1 (high E).
    const y1 = Number(await lines.first().getAttribute('y1'));
    const y6 = Number(await lines.last().getAttribute('y1'));
    expect(await lines.first().getAttribute('data-string')).toBe('1');
    expect(y1).toBeLessThan(y6);

    await expect(staff.getByTestId('tab-line-name')).toHaveText([
      'e1',
      'B2',
      'G3',
      'D4',
      'A5',
      'E6',
    ]);

    const notes = staff.getByRole('img');
    await expect(notes).toHaveCount(6);
    await expect(notes.first()).toHaveAccessibleName('string 3, fret 5');
    await expect(notes).toHaveText(['5', '7', '5', '8', '5', '8']);

    const buttons = staff.getByRole('button');
    await expect(buttons).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await expectNoHorizontalOverflow(page);
  });

  test('picking a line highlights it and its notes on the neck', async ({ page }) => {
    const staff = await openTabViewer(page);
    const neck = page.getByRole('group', { name: 'The lick on the neck' });
    await expect(neck.getByTestId('marker-root')).toHaveCount(0);

    const g = staff.getByRole('button', { name: 'string 3, G' });
    await g.click();
    await expect(g).toHaveAttribute('aria-pressed', 'true');
    await expect(staff.locator('[data-testid="tab-line"][data-string="3"]')).toHaveAttribute(
      'data-mark',
      'selected',
    );
    await expect(neck.getByTestId('marker-root')).toHaveCount(2);
    await expect(neck.locator('[data-testid="marker-root"][data-string="3"]')).toHaveCount(2);

    // Keyboard path: Enter picks another line.
    const b = staff.getByRole('button', { name: 'string 2, B' });
    await b.focus();
    await page.keyboard.press('Enter');
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await expect(g).toHaveAttribute('aria-pressed', 'false');
  });

  test('the tab viewer renders on the phone @smoke @layout @phone', async ({ page }) => {
    const staff = await openTabViewer(page);
    await expect(staff.getByTestId('tab-line')).toHaveCount(6);
    await expect(staff.getByRole('img')).toHaveCount(6);
    const box = await staff.getByRole('button').first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });
});
