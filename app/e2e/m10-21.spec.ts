import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { skipInstallTip } from './helpers/install';

// M10-21: a module opens once the learner is practising any one of its first
// skills, so a locked module's test-out offer joins its first skills' gates
// with "or" (or names the nearest one's), never "and" when one would do
// (research/02 rule 16). Gates one first skill really needs together keep "and".

/** The test-out offer on a locked module's detail. */
async function offerFor(page: Page, module: string) {
  await freshStart(page, `/learn?module=${module}`);
  await expect(page.getByTestId('module-detail')).toBeVisible();
  return page.getByRole('region', { name: 'Already know this?' });
}

test.beforeEach(({ page }) => skipInstallTip(page));

test.describe('M10-21 the test-out says when a module opens', () => {
  test('Ear opens with either of its first skills, so its offer says "or" @smoke', async ({
    page,
  }) => {
    const offer = await offerFor(page, 'ear');
    await expect(offer).toContainText(
      'Ear opens once you’re practising The musical alphabet or Natural notes on string 6.',
    );
    // The test still covers both: passing either opens the module.
    await expect(offer).toContainText(
      'a short test of The musical alphabet and Natural notes on string 6.',
    );
    await expect(offer.getByRole('button', { name: 'Test out' })).toBeVisible();
  });

  test('either mastery opens Minor and function', async ({ page }) => {
    const offer = await offerFor(page, 'minor-function');
    await expect(offer).toContainText(
      'Minor and function opens once you’ve mastered Progressions: minor keys or Progressions: pop and rock.',
    );
  });

  test('gates one first skill needs together keep "and"', async ({ page }) => {
    const offer = await offerFor(page, 'chords');
    await expect(offer).toContainText(
      'Chords opens once you’ve mastered Interval shapes: 3rds and are practising Spell the sharp keys.',
    );
  });

  test('where a first skill needs several things, it names only the nearest', async ({ page }) => {
    // Pop progressions need triads mastered; capo keys only practised.
    const offer = await offerFor(page, 'progressions');
    // The gate sentence only: the offer then lists what the test covers.
    const text = (await offer.getByText(/^Progressions opens once/).innerText()).split(
      ' Already there?',
    )[0];
    expect(text).toBe(
      'Progressions opens once you’re practising Spell the sharp keys and Spell major and minor triads.',
    );
  });
});
