import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';

// M10-18: the neck spells notes with ♯/♭ (design §8, research/02 rule 10),
// in the learner's spelling, and says them in words to VoiceOver. A worked
// example's trap keeps its own spelling on the neck, as its feedback does.

const marker = (page: Page, style: string, string: number, fret: number) =>
  page.locator(`[data-testid="marker-${style}"][data-string="${string}"][data-fret="${fret}"]`);

async function useSharps(page: Page): Promise<void> {
  await page.goto('/settings');
  await page.getByRole('combobox', { name: 'Note names' }).selectOption('sharp');
}

test.describe('M10-18 ♯/♭ on the neck', () => {
  test('a guide-level neck labels sharps with the glyph, spoken in words @smoke', async ({
    page,
  }) => {
    await freshStart(page, '/explore');
    await page.getByRole('combobox', { name: 'Root' }).selectOption({ label: 'G' });
    await page.getByRole('combobox', { name: 'Show' }).selectOption({ label: 'Major key' });
    const neck = page.getByRole('group', { name: 'G major key across the neck' });
    await expect(neck.getByTestId('string-name')).toHaveCount(6);

    const fSharp = marker(page, 'tone', 6, 2);
    await expect(fSharp).toHaveText('F♯');
    await expect(fSharp).toHaveAccessibleName('F sharp');
    const texts = await neck.locator('text').allTextContents();
    expect(texts.join(' ')).not.toMatch(/#/);
  });

  test('a tapped trap reads as the feedback names it, not the learner’s sharp', async ({
    page,
  }) => {
    await freshStart(page);
    await useSharps(page);
    await page.goto('/learn?module=intervals');
    await expect(page.locator('[data-loaded="true"]')).toBeVisible();
    await page
      .getByTestId('skill-C3.thirds')
      .getByRole('button', { name: 'Worked example' })
      .click();
    const neck = page.getByRole('group', { name: 'Worked example neck' });
    const cell = (string: number, fret: number) =>
      neck.getByRole('button', { name: `string ${string}, fret ${fret}`, exact: true });

    // Worked: C → its major 3rd; the unshifted shape is the ghost, a minor 3rd, E♭.
    await expect(neck.getByTestId('marker-ghost')).toHaveText('E♭');
    await cell(2, 5).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Faded: F → A. Fret 9 is the trap: A♭ from F, though a sharps learner's G♯.
    await cell(2, 9).click();
    await expect(page.getByTestId('example-wrong')).toContainText('That’s A♭.');
    const wrong = neck.getByTestId('marker-wrong');
    await expect(wrong).toHaveText('A♭');
    await expect(wrong).toHaveAccessibleName('A flat');
  });
});
