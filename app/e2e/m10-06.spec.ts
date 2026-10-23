import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { d5ButtonName } from './helpers/interval-names';
import { seedDueItems } from './helpers/octaves';

// M10-06: a miss in D5 (name the interval) or D39 (fret landmarks) teaches
// the method under the prompt, not just the answer in the bar. D5 says what
// the chosen name means and counts the shape; D39 counts the dots from the
// nut, or restates the 12-fret repeat.

/** An independent answer key (deliberately not imported from app code). */
const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
/** The root's name: a fresh learner prefers sharps. */
const PCS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const LETTERS = 'CDEFGAB';
const LETTER_CHROMA = [0, 2, 4, 5, 7, 9, 11];

/**
 * The note `letters` letter names and `semitones` half steps above `root`,
 * spelled from the root (G♯ + a 3rd of 4 is B♯, C + a 3rd of 3 is E♭), or
 * null when that needs a double accidental (A♯ + a major 3rd is C𝄪).
 */
function spellAbove(root: string, letters: number, semitones: number): string | null {
  const from = LETTERS.indexOf(root[0]!);
  const rootChroma = (LETTER_CHROMA[from]! + (root[1] === '♯' ? 1 : 0) + 12) % 12;
  const to = (from + letters) % 7;
  const shift = ((((rootChroma + semitones - LETTER_CHROMA[to]!) % 12) + 18) % 12) - 6;
  if (Math.abs(shift) > 1) return null;
  return LETTERS[to]! + (shift === 1 ? '♯' : shift === -1 ? '♭' : '');
}

/** How D5 counts a major 3rd from the root: to the spelled note, or from the root alone. */
function countM3(root: string): string {
  const upper = spellAbove(root, 2, 4);
  return upper
    ? `From ${root} up to ${upper} is 4 half steps: a major 3rd, M3.`
    : `It is 4 half steps up from ${root}: a major 3rd, M3.`;
}

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const choices = (page: Page) => page.locator('[role="group"][aria-labelledby="drill-prompt"]');

/** A known card, due now, at guide level 0, so the session opens on a recall prompt. */
async function startOn(page: Page, itemId: string, skillId: string): Promise<void> {
  await freshStart(page);
  await seedDueItems(page, [{ itemId, skillId }], 0);
  await focusSession(page, skillId);
}

async function pcAt(page: Page, testId: string): Promise<string> {
  const m = neck(page).getByTestId(testId).first();
  const midi =
    OPEN_MIDI[Number(await m.getAttribute('data-string'))]! +
    Number(await m.getAttribute('data-fret'));
  return PCS[midi % 12]!;
}

test.describe('M10-06 teach on a miss', () => {
  test('a wrong D5 answer says what it meant and counts the shape', async ({ page }) => {
    await startOn(page, 'interval-name:M3@s6→s5', 'C3.thirds');
    await expect(page.getByTestId('d5-drill')).toBeVisible();
    await expect(page.locator('#drill-prompt')).toHaveText('Name the interval');
    // The root anywhere from F♯ to E: the line spells the 3rd from it (B♯ above G♯).
    const root = await pcAt(page, 'marker-root');

    // Short names on the buttons, the name in words in their accessible names.
    const right = choices(page).getByRole('button', { name: d5ButtonName('M3'), exact: true });
    await expect(right).toHaveText('M3');
    const shown = (await choices(page).getByRole('button').allInnerTexts()).map((t) => t.trim());
    // Four neighbours around M3: m3 is there unless the window starts at M3.
    const wrong = shown.includes('m3') ? 'm3' : 'P4';
    const meaning =
      wrong === 'm3' ? '(a minor 3rd, 3 half steps)' : '(a perfect 4th, 5 half steps)';
    await choices(page)
      .getByRole('button', { name: d5ButtonName(wrong), exact: true })
      .click();

    await expect(page.getByTestId('feedback-wrong')).toContainText('That was M3.');
    await expect(page.getByTestId('d5-explain')).toHaveText(
      `You chose ${wrong} ${meaning}. ${countM3(root)}`,
    );
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('a G–B miss names the shift, and the line fits above Continue @smoke @layout', async ({
    page,
  }) => {
    await startOn(page, 'interval-name:M3@s3→s2', 'C3.thirds');
    // P4 is the G–B misreading; one window in four around M3 leaves it out.
    const p4 = choices(page).getByRole('button', { name: d5ButtonName('P4'), exact: true });
    for (let i = 0; i < 12; i++) {
      await expect(page.locator('#drill-prompt')).toHaveText('Name the interval');
      if (await p4.isVisible()) break;
      await focusSession(page, 'C3.thirds');
    }
    const root = await pcAt(page, 'marker-root');
    await p4.click();

    const explain = page.getByTestId('d5-explain');
    await expect(explain).toHaveText(
      `You chose P4 (a perfect 4th, 5 half steps). ${countM3(root)} G and B are a major 3rd apart, so this shape is a half step smaller here.`,
    );
    await expect(explain).toBeInViewport({ ratio: 1 });
    const continueButton = page.getByRole('button', { name: 'Continue' });
    await expect(continueButton).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalOverflow(page);
    await continueButton.click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('a wrong D39 marker answer counts the dots from the nut @smoke @layout', async ({
    page,
  }) => {
    await startOn(page, 'marker:f7', 'F3.markers');
    await expect(page.locator('#drill-prompt')).toHaveText('Which fret is this marker on?');
    await choices(page).getByRole('button', { name: 'Fret 5', exact: true }).click();

    await expect(page.getByTestId('feedback-wrong')).toContainText('That was fret 7.');
    await expect(page.getByTestId('d39-explain')).toHaveText(
      'Count the dots from the nut: 3, 5, 7.',
    );
    await expect(page.getByTestId('d39-explain')).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('a wrong D39 repeat names the open strings and the 12-fret rule', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await startOn(page, 'repeat:-12@f12', 'F3.repeat-12');
    await expect(page.locator('#drill-prompt')).toHaveText(
      'Which fret has the same notes as fret 12, an octave lower?',
    );
    await choices(page).getByRole('button', { name: 'Fret 5', exact: true }).click();

    await expect(page.getByTestId('feedback-wrong')).toContainText('That was the open strings.');
    await expect(page.getByTestId('d39-explain')).toHaveText(
      'The open strings have the same notes as fret 12, an octave lower: the neck repeats every 12 frets.',
    );
  });
});
