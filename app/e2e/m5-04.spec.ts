import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, freshStart } from './helpers';
import { skipInstallTip } from './helpers/install';
import { fakeMic, micRequests } from './helpers/mic-device';

// M5-04: mic onboarding and settings (design §4, §9). The mic is requested
// only from the learner's tap, mic mode is saved only once the mic runs, and
// each reason it can't run gets its own copy.

const MIC_STEP = 'Play on your real guitar?';
const choice = (page: Page) => page.getByTestId('onboarding-choice');
const micCard = (page: Page) => page.getByRole('group', { name: 'Mic mode' });
const micToggle = (page: Page) => micCard(page).getByRole('checkbox', { name: 'Mic mode' });

test.beforeEach(({ page }) => skipInstallTip(page));

/** First launch, then skip each step until the mic step. */
async function openMicStep(page: Page) {
  await firstLaunch(page);
  await page.getByRole('button', { name: 'Get started' }).click();
  const heading = page.getByRole('heading', { name: MIC_STEP, level: 1 });
  for (let n = 0; n < 12 && !(await heading.isVisible()); n++)
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
  await expect(heading).toBeVisible();
}

test.describe('M5-04 mic onboarding', () => {
  test('@smoke turning mic mode on hears the guitar and saves the choice @layout', async ({
    page,
  }, info) => {
    await fakeMic(page, { kind: 'tone', frequency: 110 });
    await openMicStep(page);
    await expect(page.getByTestId('onboarding-explanation')).toContainText(
      'no sound leaves this device',
    );
    await expectNoHorizontalOverflow(page);
    expect(await micRequests(page)).toBe(0);

    // Regular-wide is two-pane: the step's controls sit beside the explanation.
    if (info.project.name.endsWith('landscape') && info.project.name.startsWith('ipad')) {
      const explain = await page.getByTestId('onboarding-explanation').boundingBox();
      const pane = await choice(page).boundingBox();
      expect(pane!.x).toBeGreaterThan(explain!.x + explain!.width - 1);
    }
    const enable = choice(page).getByRole('button', { name: 'Turn on mic mode' });
    expect((await enable.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await enable.click();
    expect(await micRequests(page)).toBe(1);
    const status = page.getByTestId('mic-status');
    await expect(status).toHaveAttribute('data-heard', 'true', { timeout: 10_000 });
    await expect(status).toContainText('Mic is working. Heard A2.');

    await choice(page).getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { name: 'Already play a bit?', level: 1 }),
    ).toBeVisible();

    await page.goto('/settings');
    await expect(micToggle(page)).toBeChecked();
  });

  test('"Not now" moves on without asking for the mic', async ({ page }) => {
    await fakeMic(page, { kind: 'tone' });
    await openMicStep(page);
    await choice(page).getByRole('button', { name: 'Not now' }).click();
    await expect(
      page.getByRole('heading', { name: 'Already play a bit?', level: 1 }),
    ).toBeVisible();
    expect(await micRequests(page)).toBe(0);
    await page.goto('/settings');
    await expect(micToggle(page)).not.toBeChecked();
  });

  for (const [kind, copy] of [
    ['denied', 'Microphone access was refused.'],
    ['no-device', 'No microphone was found.'],
    ['unsupported', 'This browser can’t listen for pitch.'],
  ] as const) {
    test(`explains a mic that can't start (${kind}) and carries on`, async ({ page }) => {
      await fakeMic(page, { kind });
      await openMicStep(page);
      await choice(page).getByRole('button', { name: 'Turn on mic mode' }).click();
      const alert = choice(page).getByRole('alert');
      await expect(alert).toContainText(copy);
      await expectNoHorizontalOverflow(page);
      await expect(choice(page).getByRole('button', { name: 'Try again' })).toBeVisible();
      await choice(page).getByRole('button', { name: 'Not now' }).click();
      await expect(
        page.getByRole('heading', { name: 'Already play a bit?', level: 1 }),
      ).toBeVisible();
      await page.goto('/settings');
      await expect(micToggle(page)).not.toBeChecked();
    });
  }
});

test.describe('M5-04 mic settings', () => {
  test('mic mode switches on from Settings, checks the mic, and switches off', async ({ page }) => {
    await fakeMic(page, { kind: 'tone', frequency: 196 });
    await freshStart(page, '/settings');
    await expect(micToggle(page)).not.toBeChecked();
    expect(await micRequests(page)).toBe(0);
    await expectNoHorizontalOverflow(page);

    // Controlled: it shows as on only once the mic runs, so click rather than check().
    await micToggle(page).click();
    await expect(micToggle(page)).toBeChecked();
    await expect(micCard(page).getByTestId('mic-status')).toContainText('Heard G3.', {
      timeout: 10_000,
    });
    await micCard(page).getByRole('button', { name: 'Stop listening' }).click();
    await expect(micCard(page).getByRole('button', { name: 'Check the microphone' })).toBeVisible();

    // Saved: a reload keeps it on, and nothing asks for the mic again by itself.
    await page.reload();
    await expect(micToggle(page)).toBeChecked();
    expect(await micRequests(page)).toBe(0);

    await micToggle(page).click();
    await expect(micToggle(page)).not.toBeChecked();
    await page.reload();
    await expect(micToggle(page)).not.toBeChecked();
  });

  test('a refused mic leaves mic mode off in Settings', async ({ page }) => {
    await fakeMic(page, { kind: 'denied' });
    await freshStart(page, '/settings');
    await micToggle(page).click();
    await expect(micCard(page).getByRole('alert')).toContainText('access was refused');
    await expect(micToggle(page)).not.toBeChecked();
  });
});
