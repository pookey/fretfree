import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { skipInstallTip } from './helpers/install';

// M4-11: the M4 milestone QA (design §11: C8–C10, I3 and I6 through D11–D15
// and D40, the progression player, and audio playback everywhere). A screen
// walk opens every M4 screen and checks it for horizontal overflow: the four
// Learn modules M4 fills, the circle of fifths and the progression player,
// each M4 drill's first prompt (a new skill's worked example, with its context
// panel), wrong-answer feedback from D11, D14 and D15, the summary and
// Progress. A second walk follows a "start with sound" learner: the
// onboarding choice, Today's "Ear only" card, and the first daily prompt. A
// third, with sound off, starts on the neck (M4-16).
//
// The walks are tagged @smoke, so they also run against production on every
// profile (run from app/):
//   E2E_BASE_URL=https://fretfree.app pnpm e2e:only e2e/m4-11.spec.ts
// The screenshot pass is on demand: with SCREENSHOTS=1 the walks also save
// each screen, dark and light, under --output:
//   SCREENSHOTS=1 E2E_BASE_URL=https://fretfree.app pnpm e2e:only \
//     e2e/m4-11.spec.ts --grep @screens --output <dir>

const SCREENSHOTS = Boolean(process.env.SCREENSHOTS);

/** Check the screen for overflow; with SCREENSHOTS set, save it in both themes. */
async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  await expectNoHorizontalOverflow(page);
  if (!SCREENSHOTS) return;
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({
      path: info.outputPath(`${name}-${colorScheme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.emulateMedia({ colorScheme: null });
}

/** The Learn modules M4 fills. */
const MODULES = ['harmony', 'key-signatures', 'progressions', 'ear'] as const;

/**
 * Each M4 drill, reached by focusing one of its skills once that skill's
 * prerequisites are mastered (rule 7). Mastery accumulates down the list, so
 * each step names only what it adds. The skill itself is never mastered first,
 * so its session serves new items with full guides and the context panel up.
 */
const DRILLS = [
  {
    name: 'd40-key-signature',
    skill: 'I3.sharp-signatures',
    drill: 'key-signature',
    adds: ['C4.sharp-keys'],
  },
  {
    name: 'd13-capo',
    skill: 'C10.capo-g-c-d',
    drill: 'capo',
    adds: ['C5.triads'],
  },
  {
    name: 'd12-progression-builder',
    skill: 'C9.pop',
    drill: 'progression-builder',
    adds: [],
  },
  {
    name: 'd14-intervals',
    skill: 'I6.intervals-fourths-fifths',
    drill: 'ear-identify',
    adds: ['F1.alphabet'],
  },
  {
    name: 'd14-chords',
    skill: 'I6.chords-major-minor',
    drill: 'ear-identify',
    adds: [],
  },
] as const;

/** An independent answer key for D14's progression cards. */
const PROGRESSIONS: Record<string, string> = {
  'I-IV-V': 'I–IV–V',
  'I-V-vi-IV': 'I–V–vi–IV',
  'vi-IV-I-V': 'vi–IV–I–V',
  'I-vi-IV-V': 'I–vi–IV–V',
};

/** Wait until the drill's view (a lazy chunk) is up, not its loading state. */
async function drillReady(page: Page, drill: string): Promise<void> {
  await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', drill);
  await expect(page.locator('#drill-prompt')).toBeVisible();
  await expect(page.getByTestId('drill-loading')).toBeHidden();
}

/** End the session from wherever it is, and wait for the summary. */
async function endSession(page: Page): Promise<void> {
  const summary = page.getByTestId('session-summary');
  const end = page.getByRole('button', { name: 'End session' });
  await expect(end.or(summary)).toBeVisible();
  if (await end.isVisible()) await end.click();
  await expect(summary).toBeVisible();
}

/** Open one Explore view by its URL. */
async function openExplore(page: Page, view: string, region: string): Promise<void> {
  await page.goto(`/explore?view=${view}`);
  await expect(page.getByRole('region', { name: region })).toBeVisible();
}

/** Merge fields into the stored settings, as the Settings screen saves them, then reload. */
async function saveSettings(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (fields) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const store = () => db.transaction('settings', 'readwrite').objectStore('settings');
    const row = await new Promise<Record<string, unknown> | undefined>((resolve) => {
      const req = store().get('singleton');
      req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined);
    });
    await new Promise<void>((resolve, reject) => {
      const req = store().put({ ...row, ...fields, key: 'singleton' });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  }, patch);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

/** Start the daily session from Today and wait for its first prompt. */
async function startDaily(page: Page): Promise<void> {
  await page.getByTestId('start-session').click();
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
}

test.describe('M4-11 screenshot pass', () => {
  test('every M4 screen renders without overflow @smoke @screens @layout', async ({
    page,
  }, info) => {
    test.setTimeout(240_000);

    // Learn: each module M4 fills, locked or open for a new learner.
    await freshStart(page);
    for (const [i, module] of MODULES.entries()) {
      await page.goto(`/learn?module=${module}`);
      await expect(page.locator('[data-loaded="true"]')).toBeVisible();
      await expect(page.getByTestId('module-detail')).toBeVisible();
      await shoot(page, info, `0${i + 1}-learn-${module}`);
    }

    // Explore: the circle of fifths with A major picked, and the progression
    // player's default chart, then in numerals with a capo.
    await openExplore(page, 'circle-of-fifths', 'Circle of fifths');
    const circle = page.getByRole('region', { name: 'Circle of fifths' });
    await circle.getByRole('radio', { name: /^A major, 3 sharps/ }).click();
    await expect(page.getByTestId('circle-key')).toHaveText('A major');
    await shoot(page, info, '05-explore-circle');
    await openExplore(page, 'progression-player', 'Progression player');
    const player = page.getByRole('region', { name: 'Progression player' });
    await expect(player.getByTestId('player-chord')).toHaveCount(4);
    await shoot(page, info, '06-explore-player');
    await player.getByRole('radio', { name: 'Numerals' }).check();
    await player.getByRole('combobox', { name: 'Key' }).selectOption({ label: 'B♭ major' });
    await player.getByRole('button', { name: 'Capo 3: G major shapes' }).click();
    await expect(player.getByTestId('player-capo')).toBeVisible();
    await shoot(page, info, '06b-explore-player-capo');

    // D11: the worked example, then a quality slip and its feedback. The first
    // card is IV in C major, so F minor is the slip.
    await masterSkills(page, ['C4.sharp-key-degrees', 'C4.flat-key-degrees', 'C5.triads']);
    await focusSession(page, 'C8.numerals-major');
    await drillReady(page, 'numerals');
    await shoot(page, info, '10-session-d11-numerals');
    await expect(page.getByTestId('d11-cue')).toHaveText('IV');
    await page.getByTestId('d11-drill').getByRole('button', { name: 'F minor' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await shoot(page, info, '10b-session-d11-feedback');

    // Each other M4 drill's first prompt, with its context panel.
    await masterSkills(page, ['C8.numerals-major']);
    for (const [i, { name, skill, drill, adds }] of DRILLS.entries()) {
      if (adds.length > 0) await masterSkills(page, adds);
      await focusSession(page, skill);
      await drillReady(page, drill);
      await shoot(page, info, `${String(i + 11)}-session-${name}`);
    }

    // D14 on a progression, answered wrongly: the chart and the compare buttons.
    await masterSkills(page, ['C9.pop']);
    await focusSession(page, 'I6.progressions-pop');
    await drillReady(page, 'ear-identify');
    await shoot(page, info, '16-session-d14-progressions');
    const d14 = page.getByTestId('d14-drill');
    const id = (await d14.getAttribute('data-item')) ?? '';
    const right = PROGRESSIONS[/^prog:(.+):ear$/.exec(id)?.[1] ?? ''];
    expect(right, id).toBeDefined();
    const wrong = Object.values(PROGRESSIONS).find((name) => name !== right)!;
    await d14
      .getByRole('group', { name: /Which|Listen/ })
      .getByRole('button', { name: wrong, exact: true })
      .click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await shoot(page, info, '16b-session-d14-feedback');

    // D15 by ear: the worked example names the first note (A, fret 5 on string
    // 6); a tap two frets low shows the miss against it.
    await masterSkills(page, ['F2.string6-naturals']);
    await focusSession(page, 'I6.ear-find');
    await drillReady(page, 'hear-it-find-it');
    await expect(page.getByTestId('d15-prompt')).toContainText('A on string 6');
    await shoot(page, info, '17-session-d15-ear-find');
    await page.locator('svg[data-fret-from] [data-cell="s6f3"]').click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await shoot(page, info, '17b-session-d15-feedback');
    await page.getByRole('button', { name: 'Continue' }).click();
    await endSession(page);
    await shoot(page, info, '18-session-summary');

    // Progress, with the M4 skills now in its topics.
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await shoot(page, info, '19-progress');
  });

  test('a "start with sound" learner @smoke @screens @layout', async ({ page }, info) => {
    test.setTimeout(120_000);
    await skipInstallTip(page);

    // The onboarding choice.
    await firstLaunch(page);
    await page
      .getByTestId('onboarding-choice')
      .getByRole('button', { name: 'Get started' })
      .click();
    const step = page.getByRole('heading', { name: 'Where do you want to start?', level: 1 });
    const progress = page.getByTestId('onboarding-progress');
    for (let n = 0; n < 12 && !(await step.isVisible()); n++) {
      const at = (await progress.textContent())!;
      await page
        .getByTestId('onboarding-choice')
        .getByRole('button', { name: 'Skip this step' })
        .click();
      await expect(
        step.or(progress.filter({ hasNotText: new RegExp(`^${at}$`) })).first(),
      ).toBeVisible();
    }
    await expect(step).toBeVisible();
    await page.getByRole('radio', { name: /^Sound/ }).check();
    await shoot(page, info, '30-onboarding-start-with-sound');

    // Today offers "Ear only" on day one, and the daily session leads with
    // D15's worked example.
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await saveSettings(page, { startWithSound: true });
    const quick = page.getByRole('region', { name: 'Quick drills' });
    await expect(quick.getByRole('link', { name: 'Ear only (no guitar)' })).toBeVisible();
    await shoot(page, info, '31-today-ear-only');
    await startDaily(page);
    await drillReady(page, 'hear-it-find-it');
    await expect(page.getByTestId('d15-prompt')).toContainText('Listen, then tap it.');
    await shoot(page, info, '32-session-d15-first');
  });

  // M4-16: ear-find cards aren't served with sound off.
  test('a "start with sound" learner with sound off starts on the neck @smoke @screens @layout', async ({
    page,
  }, info) => {
    await skipInstallTip(page);
    await freshStart(page);
    await saveSettings(page, { startWithSound: true, soundOn: false });
    const quick = page.getByRole('region', { name: 'Quick drills' });
    await expect(quick.getByTestId('ear-only-copy')).toHaveText(
      'Ear only (no guitar) needs sound.',
    );
    await shoot(page, info, '33-today-sound-off');
    // No card heard by ear is graded unheard (research/02 §3.7): the path
    // falls back to the neck until sound is on.
    await startDaily(page);
    await expect(page.locator('#drill-prompt')).toBeVisible();
    await expect(page.locator('[data-drill]')).not.toHaveAttribute('data-drill', 'hear-it-find-it');
    await shoot(page, info, '34-session-sound-off');
  });
});
