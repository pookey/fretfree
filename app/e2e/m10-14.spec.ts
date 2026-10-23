import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M10-14: worked examples for the C3 4ths and 5ths, C7 box 1, C8 stage 1,
// C9's rotation and C10's capo (research/02 rule 8). Each opens from its
// skill in Learn, a locked skill included, and starts worked.

async function openModule(page: Page, moduleId: string): Promise<void> {
  await freshStart(page, `/learn?module=${moduleId}`);
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
  await expect(page.getByTestId('module-detail')).toBeVisible();
}

const exampleNeck = (page: Page) => page.getByRole('group', { name: 'Worked example neck' });

async function tap(page: Page, string: number, fret: number): Promise<void> {
  await exampleNeck(page)
    .getByRole('button', { name: `string ${string}, fret ${fret}`, exact: true })
    .click();
}

async function openExample(page: Page, moduleId: string, skillId: string): Promise<void> {
  await openModule(page, moduleId);
  await page
    .getByTestId(`skill-${skillId}`)
    .getByRole('button', { name: 'Worked example' })
    .click();
  await expect(page.getByTestId('worked-example')).toHaveAttribute('data-stage', 'worked');
}

const EXAMPLES = [
  {
    module: 'intervals',
    skill: 'C3.fourths-fifths',
    prompt: 'Find the perfect 4th above C on string 2.',
    target: 6,
  },
  {
    module: 'pentatonic',
    skill: 'C7.minor-boxes',
    prompt: 'Box 1 of A minor wraps the E shape of Am. Find the box’s 4th on string 5.',
    target: 5,
  },
  {
    module: 'harmony',
    skill: 'C8.numerals-major',
    prompt: 'In C major, find the root of the IV chord on string 5.',
    target: 8,
  },
  {
    module: 'progressions',
    skill: 'C9.pop',
    prompt: 'I–V–vi–IV in C: find the root of its third chord on string 6.',
    target: 5,
  },
  {
    module: 'progressions',
    skill: 'C10.capo-g-c-d',
    prompt: 'Capo on fret 2, playing a G shape: find the root it sounds, on string 6.',
    target: 5,
  },
] as const;

test.describe('M10-14 worked examples', () => {
  for (const { module, skill, prompt, target } of EXAMPLES) {
    test(`${skill} opens its worked example`, async ({ page }) => {
      await openExample(page, module, skill);
      await expect(page.getByTestId('example-prompt')).toHaveText(prompt);
      await expect(exampleNeck(page).getByTestId('marker-target')).toHaveAttribute(
        'data-fret',
        String(target),
      );
      await expectNoHorizontalOverflow(page);
    });
  }

  test('the rotation example traps the tonic taken for the first chord', async ({ page }) => {
    await openExample(page, 'progressions', 'C9.pop');
    await tap(page, 6, 5);
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByTestId('example-prompt')).toHaveText(
      'vi–IV–I–V in G: find the root of its first chord on string 5.',
    );
    await tap(page, 5, 10);
    await expect(page.getByTestId('example-trap')).toContainText('starts on vi, not I');
    await expect(exampleNeck(page).getByTestId('marker-correct')).toHaveAttribute('data-fret', '7');
    await page.getByRole('button', { name: 'Next' }).click();

    await tap(page, 6, 7);
    await expect(page.getByTestId('example-correct')).toContainText('Bm, G, D, A');
    await expect(page.getByTestId('example-done')).toBeVisible();
  });

  test('the capo example counts up on a phone @smoke @phone', async ({ page }) => {
    await openExample(page, 'progressions', 'C10.capo-g-c-d');
    await expect(exampleNeck(page).getByTestId('marker-ghost')).toHaveAttribute('data-fret', '1');
    await tap(page, 6, 5);
    await expect(page.getByTestId('example-correct')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await tap(page, 2, 0);
    await expect(page.getByTestId('example-trap')).toContainText('count up from D');
    await expectNoHorizontalOverflow(page);
  });
});
