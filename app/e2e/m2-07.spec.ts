import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

async function openModule(page: Page, moduleId: string): Promise<void> {
  await freshStart(page, `/learn?module=${moduleId}`);
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
  await expect(page.getByTestId('module-detail')).toBeVisible();
}

function exampleNeck(page: Page) {
  return page.getByRole('group', { name: 'Worked example neck' });
}

async function tap(page: Page, string: number, fret: number): Promise<void> {
  await exampleNeck(page)
    .getByRole('button', { name: `string ${string}, fret ${fret}`, exact: true })
    .click();
}

const stage = (page: Page) => page.getByTestId('worked-example');

test.describe('M2-07 worked examples', () => {
  test('a worked example fades its guides, then practice is focused on the skill @layout', async ({
    page,
  }) => {
    await openModule(page, 'notes-1');
    const skill = page.getByTestId('skill-F2.string6-naturals');
    await skill.getByRole('button', { name: 'Worked example' }).click();

    // Worked: the answer is on the neck, fully labelled.
    await expect(stage(page)).toHaveAttribute('data-stage', 'worked');
    await expect(exampleNeck(page)).toHaveAttribute('data-guide-level', '3');
    await expect(page.getByTestId('example-prompt')).toHaveText('Find G on string 6.');
    await expect(exampleNeck(page).getByTestId('marker-target')).toHaveAttribute('data-fret', '3');

    // iPad keeps neck cells at 44pt or more (design §7).
    const cell = (await exampleNeck(page)
      .getByRole('button', { name: 'string 6, fret 3', exact: true })
      .boundingBox())!;
    expect(cell.width).toBeGreaterThanOrEqual(43.5);
    expect(cell.height).toBeGreaterThanOrEqual(43.5);

    await tap(page, 6, 3);
    await page.getByRole('button', { name: 'Next' }).click();

    // Faded: a hint, no answer shown.
    await expect(stage(page)).toHaveAttribute('data-stage', 'faded');
    await expect(exampleNeck(page)).toHaveAttribute('data-guide-level', '2');
    await expect(page.getByTestId('example-hint')).toHaveText('Hint: The second marker.');
    await expect(exampleNeck(page).getByTestId('marker-target')).toHaveCount(0);
    await tap(page, 6, 5);
    await expect(page.getByTestId('example-correct')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    // Independent: inlays only, no hint.
    await expect(stage(page)).toHaveAttribute('data-stage', 'independent');
    await expect(exampleNeck(page)).toHaveAttribute('data-guide-level', '1');
    await expect(page.getByTestId('example-hint')).toHaveCount(0);
    await tap(page, 6, 7);
    await expect(page.getByTestId('example-done')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // "Practise this now" starts a session on this skill only. A fresh,
    // unfocused session would open on the F1 note wheel instead.
    await skill.getByRole('link', { name: 'Practise this now' }).click();
    await expect(page).toHaveURL(/\/session\?skill=F2\.string6-naturals$/);
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(
      page
        .locator('[data-testid="marker-target"][data-string="6"]')
        .or(page.getByTestId('d2-prompt').filter({ hasText: 'on string 6' }))
        .first(),
    ).toBeVisible();
  });

  test('the G–B shift example calls out the misconception; locked skills preview only', async ({
    page,
  }) => {
    await openModule(page, 'notes-2');
    const skill = page.getByTestId('skill-C2.all-notes');
    await expect(skill).toContainText('Preview only');
    await expect(skill.getByRole('link', { name: 'Practise this now' })).toHaveCount(0);
    await skill.getByRole('button', { name: 'Worked example' }).click();

    // Worked: the shifted octave, with the unshifted shape as a ghost.
    await expect(page.getByTestId('example-prompt')).toHaveText(
      'Find the octave of G on string 2.',
    );
    await expect(stage(page)).toContainText('The B string is tuned a major 3rd above G');
    await expect(exampleNeck(page).getByTestId('marker-ghost')).toHaveAttribute('data-fret', '7');
    await tap(page, 2, 8);
    await page.getByRole('button', { name: 'Next' }).click();

    // Faded: fall for the unshifted shape and get the callout.
    await expect(page.getByTestId('example-hint')).toHaveText(
      'Hint: Two strings up, three frets up.',
    );
    await tap(page, 1, 4);
    await expect(page.getByTestId('example-trap')).toContainText(
      'Fret 4 is the shape without the G–B shift',
    );
    await expect(exampleNeck(page).getByTestId('marker-correct')).toHaveAttribute('data-fret', '5');
    await page.getByRole('button', { name: 'Next' }).click();

    await tap(page, 2, 10);
    await expect(page.getByTestId('example-correct')).toBeVisible();
    await expect(page.getByTestId('example-done')).toBeVisible();
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(stage(page)).toHaveAttribute('data-stage', 'worked');

    // The module-level misconception callout is still there (research/03).
    await expect(
      page
        .getByTestId('module-detail')
        .getByRole('complementary', { name: 'Watch out for' })
        .first(),
    ).toContainText('G–B shift');
  });

  test('a worked example and focused practice on a phone @smoke @phone', async ({ page }) => {
    await openModule(page, 'notes-1');
    const skill = page.getByTestId('skill-F2.string6-naturals');
    await skill.getByRole('button', { name: 'Worked example' }).click();
    await expect(stage(page)).toHaveAttribute('data-stage', 'worked');
    await tap(page, 6, 3);
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await skill.getByRole('link', { name: 'Practise this now' }).click();
    await expect(page).toHaveURL(/\/session\?skill=F2\.string6-naturals$/);
    await expect(page.getByTestId('session')).toBeVisible();
  });
});
