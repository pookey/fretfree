import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

async function openExample(page: Page, moduleId: string, skillId: string): Promise<void> {
  await freshStart(page, `/learn?module=${moduleId}`);
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
  await page
    .getByTestId(`skill-${skillId}`)
    .getByRole('button', { name: 'Worked example' })
    .click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'worked');
}

const stage = (page: Page) => page.getByTestId('worked-example');
const neck = (page: Page) => page.getByRole('group', { name: 'Worked example neck' });
const next = (page: Page) => page.getByRole('button', { name: 'Next' }).click();

async function tap(page: Page, string: number, fret: number): Promise<void> {
  await neck(page)
    .getByRole('button', { name: `string ${string}, fret ${fret}`, exact: true })
    .click();
}

test.describe('M3-10 worked examples for C4–C6', () => {
  test('find the root first, then read the 3rd for major or minor @layout', async ({ page }) => {
    await openExample(page, 'chords', 'C5.tones-roots');
    await expect(page.getByTestId('example-prompt')).toHaveText(
      'Find the root, then tap its 3rd. Its distance from the root decides major or minor.',
    );

    // Worked: the root is squared, the 3rd highlighted, the shape outlined.
    await expect(neck(page).getByTestId('marker-root')).toHaveAttribute('data-string', '1');
    await expect(neck(page).getByTestId('marker-target')).toHaveAttribute('data-string', '3');
    await expect(neck(page).getByTestId('shape-outline')).toHaveCount(1);
    await expect(stage(page)).toContainText('Root first: A on string 1, fret 5.');

    // iPad keeps neck cells at 44pt or more (design §7).
    const cell = (await neck(page)
      .getByRole('button', { name: 'string 3, fret 6', exact: true })
      .boundingBox())!;
    expect(cell.width).toBeGreaterThanOrEqual(43.5);
    expect(cell.height).toBeGreaterThanOrEqual(43.5);

    await tap(page, 3, 6);
    await next(page);

    // Faded: another shape and inversion, a hint, but no root square to give the root away.
    await expect(stage(page)).toHaveAttribute('data-stage', 'faded');
    await expect(page.getByTestId('example-hint')).toContainText('in the A shape');
    await expect(neck(page).getByTestId('marker-root')).toHaveCount(0);
    await expect(neck(page).getByTestId('marker-tone')).toHaveCount(3);
    await tap(page, 2, 6);
    await expect(page.getByTestId('example-correct')).toContainText('so the chord is D minor');
    await expect(neck(page).getByTestId('marker-root')).toHaveText('R');
    await next(page);

    // Independent: no guides beyond the inlays. Take the bass note for the
    // root and land on the 5th: the callout says why.
    await expect(neck(page)).toHaveAttribute('data-guide-level', '1');
    await expect(neck(page).getByTestId('shape-outline')).toHaveCount(0);
    await tap(page, 2, 3);
    await expect(page.getByTestId('example-trap')).toContainText(
      "the lowest note isn't always the root",
    );
    await expect(page.getByTestId('example-wrong')).toContainText('so the chord is G major');
    await expect(page.getByTestId('example-done')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('CAGED is a map, not five grips', async ({ page }) => {
    await openExample(page, 'caged', 'C6.triad-cores');
    await expect(page.getByTestId('example-prompt')).toHaveText(
      'The A shape of C: find its 3rd on string 2.',
    );
    await expect(stage(page)).toContainText('Don’t memorise five grips.');
    await tap(page, 2, 5);
    await next(page);

    // Recall the grip without the G–B shift and get the misconception callout.
    await expect(page.getByTestId('example-prompt')).toHaveText(
      'The E shape of G: find its 5th on string 2.',
    );
    await tap(page, 2, 2);
    await expect(page.getByTestId('example-trap')).toContainText('CAGED is a map, not five grips');
    await next(page);
    await tap(page, 2, 10);
    await expect(page.getByTestId('example-done')).toBeVisible();

    // The module keeps its own callout too.
    await expect(
      page
        .getByTestId('module-detail')
        .getByRole('complementary', { name: 'Watch out for' })
        .first(),
    ).toContainText('CAGED is a map');
  });

  test('minor shapes, 7ths and key degrees have their own examples', async ({ page }) => {
    await openExample(page, 'caged', 'C6.minor-cores');
    await expect(page.getByTestId('example-prompt')).toHaveText(
      'The A shape of D minor: find its ♭3 on string 2.',
    );

    await openExample(page, 'chords', 'C5.tones-sevenths');
    await expect(page.getByTestId('example-prompt')).toHaveText('Find the 7th of A7 on string 4.');
    await expect(neck(page).getByTestId('marker-ghost')).toHaveText('G#');

    await openExample(page, 'keys', 'C4.sharp-key-degrees');
    await expect(page.getByTestId('example-prompt')).toHaveText(
      'Find the 6th of G major on string 4.',
    );
  });

  test('the root-first example on a phone @smoke @phone', async ({ page }) => {
    await openExample(page, 'chords', 'C5.tones-roots');
    await tap(page, 3, 6);
    await next(page);
    await expect(stage(page)).toHaveAttribute('data-stage', 'faded');
    await tap(page, 2, 6);
    await expect(page.getByTestId('example-correct')).toContainText('so the chord is D minor');
    await expectNoHorizontalOverflow(page);
  });
});
