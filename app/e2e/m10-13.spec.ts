import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M10-13: worked examples for the Neck basics module (F1, F2 string 5, F3).
// Each runs worked → faded → independent on the neck, with one trap met on
// the last stage (research/02 rule 8; research/03 misconceptions).

async function openExample(page: Page, skillId: string): Promise<void> {
  await freshStart(page, '/learn?module=notes-1');
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
  await page
    .getByTestId(`skill-${skillId}`)
    .getByRole('button', { name: 'Worked example' })
    .click();
  await expect(stage(page)).toHaveAttribute('data-stage', 'worked');
}

const stage = (page: Page) => page.getByTestId('worked-example');
const neck = (page: Page) => page.getByRole('group', { name: 'Worked example neck' });
const prompt = (page: Page) => page.getByTestId('example-prompt');

function cell(page: Page, string: number, fret: number) {
  return neck(page).getByRole('button', { name: `string ${string}, fret ${fret}`, exact: true });
}

async function tap(page: Page, string: number, fret: number): Promise<void> {
  await cell(page, string, fret).click();
}

async function next(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next' }).click();
}

test.describe('M10-13 neck-basics worked examples', () => {
  test('the alphabet wraps round, then B–C has no sharp between', async ({ page }) => {
    await openExample(page, 'F1.b-c-e-f');
    await expect(prompt(page)).toHaveText('Find the letter after G on string 6.');
    await expect(neck(page).getByTestId('marker-target')).toHaveAttribute('data-fret', '5');

    // iPad keeps neck cells at 44pt or more (design §7).
    const box = (await cell(page, 6, 5).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(43.5);
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    await tap(page, 6, 5);
    await next(page);

    await expect(stage(page)).toHaveAttribute('data-stage', 'faded');
    await expect(prompt(page)).toHaveText('Find the letter before A on string 3.');
    await expect(page.getByTestId('example-hint')).toHaveText(
      'Hint: The alphabet wraps round between G and A.',
    );
    await tap(page, 3, 0);
    await expect(page.getByTestId('example-correct')).toContainText('before A comes G');
    await next(page);

    // On its own: two frets up from B is the trap.
    await expect(stage(page)).toHaveAttribute('data-stage', 'independent');
    await expect(page.getByTestId('example-hint')).toHaveCount(0);
    await tap(page, 5, 4);
    await expect(page.getByTestId('example-wrong')).toContainText('That’s C#.');
    await expect(page.getByTestId('example-trap')).toContainText(
      'B–C is a half step, with no sharp between them',
    );
    await expect(neck(page).getByTestId('marker-correct')).toHaveAttribute('data-fret', '3');
    await expect(page.getByTestId('example-done')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('half and whole steps end on E–F', async ({ page }) => {
    await openExample(page, 'F1.half-steps');
    await expect(prompt(page)).toHaveText('Find a half step above C on string 5.');
    await tap(page, 5, 4);
    await next(page);
    await expect(prompt(page)).toHaveText('Find a whole step below A on string 4.');
    await tap(page, 4, 5);
    await next(page);
    await expect(prompt(page)).toHaveText('Find a whole step above E on string 6.');
    await tap(page, 6, 2);
    await expect(page.getByTestId('example-correct')).toContainText('up two frets to F#');
    await expect(page.getByTestId('example-done')).toBeVisible();
  });

  test('string 5 from its landmarks, then practice on the skill', async ({ page }) => {
    await openExample(page, 'F2.string5-naturals');
    await expect(prompt(page)).toHaveText('Find C on string 5.');
    await tap(page, 5, 3);
    await next(page);
    await expect(page.getByTestId('example-hint')).toHaveText('Hint: The second marker.');
    await tap(page, 5, 5);
    await next(page);
    await expect(prompt(page)).toHaveText('Find F on string 5, from E at the third marker.');
    await tap(page, 5, 9);
    await expect(page.getByTestId('example-trap')).toContainText('E–F is a half step');
    await expect(neck(page).getByTestId('marker-correct')).toHaveAttribute('data-fret', '8');
    await expectNoHorizontalOverflow(page);

    await page
      .getByTestId('skill-F2.string5-naturals')
      .getByRole('link', { name: 'Practise this now' })
      .click();
    await expect(page).toHaveURL(/\/session\?skill=F2\.string5-naturals$/);
    await expect(page.getByTestId('session')).toBeVisible();
  });

  test('markers, then the 12th-fret repeat with fret 12 as the trap', async ({ page }) => {
    await openExample(page, 'F3.repeat-12');
    await expect(prompt(page)).toHaveText('Find the 7th-fret marker on string 6.');
    await tap(page, 6, 7);
    await next(page);
    await expect(prompt(page)).toHaveText('Find this D an octave higher, on string 4.');
    await tap(page, 4, 12);
    await next(page);

    // Inlays only: the dots are the guide.
    await expect(neck(page)).toHaveAttribute('data-guide-level', '1');
    await tap(page, 6, 12);
    await expect(page.getByTestId('example-trap')).toContainText('the open string’s octave');
    await expect(neck(page).getByTestId('marker-correct')).toHaveAttribute('data-fret', '15');
    // The wide window scrolls inside its pane, never the page.
    await expectNoHorizontalOverflow(page);
  });

  test('a neck-basics worked example on a phone @smoke', async ({ page }) => {
    await openExample(page, 'F1.whole-steps');
    await tap(page, 5, 4);
    await next(page);
    await tap(page, 4, 5);
    await next(page);
    await tap(page, 6, 2);
    await expect(page.getByTestId('example-done')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
