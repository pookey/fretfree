import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M10-01: a skill's gate can mix prerequisites to master and ones merely
// practising. No skill mixes them yet (the RTL tests cover that copy), so this
// checks the unlock sentence still names a hard gate, and a soft one, as before.

test.describe('M10-01 unlock sentence', () => {
  test('@smoke a hard gate names what to master, one per line', async ({ page }) => {
    await freshStart(page, '/learn?module=chords');
    await expect(page.locator('[data-loaded="true"]')).toBeVisible();
    const skill = page.getByTestId('module-detail').getByTestId('skill-C5.triads');
    await expect(skill).toContainText("Preview only. It joins your sessions once you've mastered:");
    await expect(
      skill.getByRole('list', { name: 'Prerequisites' }).getByRole('listitem'),
    ).toHaveText([
      'Interval shapes: 3rds',
      'Interval shapes: 4ths, 5ths and the tritone',
      'Spell the sharp keys',
      'Spell the flat keys',
    ]);
    await expectNoHorizontalOverflow(page);
  });

  test('a soft gate names what to be practising', async ({ page }) => {
    await freshStart(page, '/learn?module=intervals');
    await expect(page.locator('[data-loaded="true"]')).toBeVisible();
    const skill = page.getByTestId('module-detail').getByTestId('skill-C3.fourths-fifths');
    await expect(skill).toContainText(
      "Preview only. It joins your sessions once you're practising Interval shapes: 3rds.",
    );
    await expect(skill.getByRole('list', { name: /^Prerequisites/ })).toHaveCount(0);
  });
});
