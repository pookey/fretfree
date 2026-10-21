import { expect, test, type Page } from '@playwright/test';
import {
  F1_SKILLS,
  F3_SKILLS,
  answer,
  expectNoHorizontalOverflow,
  freshStart,
  masterSkills,
  targetNote,
} from './helpers';
import { focusSession } from './helpers/focus';

// M10-12: C2 in string stages, each with a ring that fills in days and a
// milestone of its own: the naturals on strings 1, 4, 3 and 2, then the
// sharps and flats on strings 6–5 and 4–1. "Whole neck" needs them all.

const C2_STAGES = [
  'C2.string1-naturals',
  'C2.string4-naturals',
  'C2.string3-naturals',
  'C2.string2-naturals',
  'C2.low-accidentals',
  'C2.all-notes',
];

/** A learner who has the low strings' naturals and the octave shapes. */
const NECK_BASICS = [
  ...F1_SKILLS,
  'F2.string6-naturals',
  'F2.string5-naturals',
  ...F3_SKILLS,
  'C1.octaves',
  'C1.octaves-gb-shift',
];

const skillRow = (page: Page, id: string) =>
  page.getByTestId('module-detail').getByTestId(`skill-${id}`);
const drillArea = (page: Page) => page.locator('[data-drill]');

async function openProgress(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Progress' })
    .click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
}

test.describe('M10-12 C2 by string', () => {
  test('the Whole neck module opens on string 1, and its session stays on string 1', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'The full flow runs on the iPad projects.');
    await freshStart(page);
    await masterSkills(page, NECK_BASICS);

    await page.goto('/learn?module=notes-2');
    await expect(page.locator('[data-loaded="true"]')).toBeVisible();
    // Every stage is listed, in teaching order; only the first is open.
    const rows = page.getByTestId('module-detail').locator('[data-testid^="skill-C2."]');
    await expect(rows).toHaveCount(C2_STAGES.length);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(
      C2_STAGES.map((id) => `skill-${id}`),
    );
    await expect(skillRow(page, 'C2.string1-naturals')).toHaveAttribute('data-status', 'unlocked');
    await expect(skillRow(page, 'C2.string1-naturals')).toContainText('0 stable of 15');
    for (const id of C2_STAGES.slice(1))
      await expect(skillRow(page, id)).toHaveAttribute('data-status', 'locked');
    await expect(skillRow(page, 'C2.string4-naturals')).toContainText(
      "once you're practising Natural notes on string 1",
    );
    await expectNoHorizontalOverflow(page);

    // The first stage's session asks about string 1 only.
    await focusSession(page, 'C2.string1-naturals');
    for (let i = 0; i < 3; i++) {
      await expect(drillArea(page)).toHaveAttribute(
        'data-drill',
        /^(name-the-note|find-the-note)$/,
      );
      if ((await drillArea(page).getAttribute('data-drill')) === 'name-the-note') {
        await expect(page.getByTestId('marker-target')).toHaveAttribute('data-string', '1');
        await answer(page, await targetNote(page));
      } else {
        await expect(page.getByTestId('d2-prompt')).toHaveText(/ on string 1$/);
        break;
      }
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    await expectNoHorizontalOverflow(page);
  });

  test('@smoke each string stage earns its badge, and Whole neck needs every stage', async ({
    page,
  }) => {
    await freshStart(page);
    await masterSkills(page, ['C2.string1-naturals']);
    const toast = page.getByTestId('achievement-toast');
    await expect(toast).toContainText('String 1 master');
    await expect(toast).not.toContainText('Whole neck');
    await toast.getByRole('button', { name: 'Dismiss' }).click();

    // The last stage alone, which keeps C2's old ID, is not the whole neck.
    await masterSkills(page, ['C2.all-notes']);
    await openProgress(page);
    const panel = page.getByRole('region', { name: 'Achievements' });
    await expect(panel.getByTestId('achievement-string-1-master')).toHaveAttribute(
      'data-unlocked',
      'true',
    );
    await expect(panel.getByTestId('achievement-whole-neck')).toHaveAttribute(
      'data-unlocked',
      'false',
    );

    await page.goto('/');
    await masterSkills(page, C2_STAGES);
    await expect(toast).toContainText('Whole neck');
    await expect(toast).toContainText('String 2 master');
    await expectNoHorizontalOverflow(page);
    await toast.getByRole('button', { name: 'Dismiss' }).click();
    await openProgress(page);
    for (const id of ['string-4-master', 'string-3-master', 'string-2-master', 'whole-neck'])
      await expect(panel.getByTestId(`achievement-${id}`)).toHaveAttribute('data-unlocked', 'true');
    await expectNoHorizontalOverflow(page);
  });
});
