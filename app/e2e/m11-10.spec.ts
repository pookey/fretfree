import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';

// M11-10: a badge that unlocks a mastery finish names it, after its
// competence copy, in the unlock toast and the Progress achievement list.

/** Everything "Whole neck" needs: F2's strings 6 and 5 and every C2 stage (M10-12). */
const WHOLE_NECK = [
  'F2.string6-naturals',
  'F2.string5-naturals',
  'C2.string1-naturals',
  'C2.string4-naturals',
  'C2.string3-naturals',
  'C2.string2-naturals',
  'C2.low-accidentals',
  'C2.all-notes',
];

async function openProgress(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Progress' })
    .click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
}

test.describe('M11-10 badge unlocks name their Garage finish', () => {
  test('Whole neck names Gold leaf in the toast and the achievement list', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, WHOLE_NECK);

    const toast = page.getByTestId('achievement-toast');
    await expect(toast).toContainText('Whole neck');
    const neckItem = toast.getByRole('listitem').filter({ hasText: 'Whole neck' });
    await expect(neckItem.getByTestId('garage-unlock')).toHaveText(
      'Unlocks the Gold leaf finish in the Garage',
    );
    // Strings 6 and 1 were mastered too: each names its own finish.
    await expect(
      toast
        .getByRole('listitem')
        .filter({ hasText: 'String 6 master' })
        .getByTestId('garage-unlock'),
    ).toHaveText('Unlocks the Ember burst finish in the Garage');
    // A badge that unlocks nothing gets no line.
    await expect(
      toast
        .getByRole('listitem')
        .filter({ hasText: 'String 5 master' })
        .getByTestId('garage-unlock'),
    ).toHaveCount(0);
    await toast.getByRole('button', { name: 'Dismiss' }).click();

    await openProgress(page);
    const panel = page.getByRole('region', { name: 'Achievements' });
    const neck = panel.getByTestId('achievement-whole-neck');
    await expect(neck).toHaveAttribute('data-unlocked', 'true');
    await expect(neck.getByTestId('garage-unlock')).toHaveText(
      'Unlocks the Gold leaf finish in the Garage',
    );
    await expect(
      panel.getByTestId('achievement-streak-7').getByTestId('garage-unlock'),
    ).toHaveCount(0);
  });

  test('a phone shows the finish line in the toast @smoke @layout @phone', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, WHOLE_NECK);
    const toast = page.getByTestId('achievement-toast');
    await expect(
      toast.getByRole('listitem').filter({ hasText: 'Whole neck' }).getByTestId('garage-unlock'),
    ).toHaveText('Unlocks the Gold leaf finish in the Garage');
    await expectNoHorizontalOverflow(page);
  });
});
