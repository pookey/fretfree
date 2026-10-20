import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { skipInstallTip } from './helpers/install';
import { playNotes, startListening, useFakeMic } from './helpers/mic';
import { fakeMic } from './helpers/mic-device';

// M5-08: the M5 milestone QA (design §11: the tuner, D16 and D17, mic
// onboarding). Four walks open every M5 screen and check each for horizontal
// overflow:
// - mic setup: the welcome, the onboarding mic step hearing a guitar through
//   the shipped pitch worklet (a sine stands in for the mic), and Settings;
// - the tuner: Tools, then idle, flat and in-tune readings from a fake pitch
//   source (M5-03's hook);
// - a refused mic: the onboarding step and the tuner explain it;
// - the mic drills: D16 and D17 prompts, listening and feedback through the
//   fake mic (M5-06's hook), on a day whose quests hold "Play 3 answers on
//   your guitar", then that quest's progress on Today, and Progress.
//
// Every walk is tagged @smoke, so it also runs against production on every
// profile (run from app/):
//   E2E_BASE_URL=https://fretfree.app pnpm e2e:only e2e/m5-08.spec.ts
// The screenshot pass is on demand: with SCREENSHOTS=1 the walks also save
// each screen, dark and light, under --output:
//   SCREENSHOTS=1 E2E_BASE_URL=https://fretfree.app pnpm e2e:only \
//     e2e/m5-08.spec.ts --grep @screens --output <dir>

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

const choice = (page: Page) => page.getByTestId('onboarding-choice');
const MIC_STEP = 'Play on your real guitar?';

/** From the welcome, skip each step until the mic step. */
async function skipToMicStep(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Get started' }).click();
  const heading = page.getByRole('heading', { name: MIC_STEP, level: 1 });
  for (let n = 0; n < 12 && !(await heading.isVisible()); n++)
    await choice(page).getByRole('button', { name: 'Skip this step' }).click();
  await expect(heading).toBeVisible();
}

test.describe('M5-08 screenshot pass', () => {
  test('mic setup: onboarding and Settings @smoke @screens', async ({ page }, info) => {
    test.slow();
    await skipInstallTip(page);
    await fakeMic(page, { kind: 'tone', frequency: 110 });

    await firstLaunch(page);
    await shoot(page, info, '01-onboarding-welcome');
    await skipToMicStep(page);
    await shoot(page, info, '02-onboarding-mic');
    await choice(page).getByRole('button', { name: 'Turn on mic mode' }).click();
    const status = page.getByTestId('mic-status');
    await expect(status).toContainText('Mic is working. Heard A2.', { timeout: 10_000 });
    await shoot(page, info, '02b-onboarding-mic-heard');
    await choice(page).getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { name: 'Already play a bit?', level: 1 }),
    ).toBeVisible();

    await page.goto('/settings');
    const card = page.getByRole('group', { name: 'Mic mode' });
    await expect(card.getByRole('checkbox', { name: 'Mic mode' })).toBeChecked();
    await card.scrollIntoViewIfNeeded();
    await shoot(page, info, '03-settings-mic');
    await card.getByRole('button', { name: 'Check the microphone' }).click();
    await expect(card.getByTestId('mic-status')).toContainText('Heard A2.', { timeout: 10_000 });
    await card.scrollIntoViewIfNeeded();
    await shoot(page, info, '03b-settings-mic-check');
  });

  test('the tuner: Tools, flat and in tune @smoke @screens', async ({ page }, info) => {
    await page.addInitScript(() => localStorage.setItem('fretwork.e2e.fakePitch', '1'));
    await freshStart(page, '/tools');
    await expect(page.getByRole('link', { name: /Tuner/ })).toBeVisible();
    await shoot(page, info, '04-tools');

    await page.getByRole('link', { name: /Tuner/ }).click();
    await expect(page.getByRole('heading', { name: 'Tuner', level: 1 })).toBeVisible();
    await shoot(page, info, '05-tuner-idle');
    await page.getByRole('button', { name: 'Start tuner' }).click();
    await expect(page.getByTestId('mic-check')).toHaveAttribute('data-state', 'listening');

    const play = (note: string, cents: number) =>
      page.evaluate(
        ([n, c]) =>
          (
            window as unknown as {
              fretworkFakePitch: { play(n: string, o: { cents: number }): void };
            }
          ).fretworkFakePitch.play(n, { cents: c }),
        [note, cents] as const,
      );
    await play('A2', -18);
    await expect(page.getByTestId('tuner-advice')).toContainText('Flat: tune up');
    await shoot(page, info, '05b-tuner-flat');
    await play('E2', 2);
    await expect(page.getByTestId('in-tune-mark')).toBeVisible();
    await shoot(page, info, '05c-tuner-in-tune');
  });

  test('a refused mic is explained @smoke @screens', async ({ page }, info) => {
    await skipInstallTip(page);
    await fakeMic(page, { kind: 'denied' });

    await firstLaunch(page);
    await skipToMicStep(page);
    await choice(page).getByRole('button', { name: 'Turn on mic mode' }).click();
    await expect(choice(page).getByRole('alert')).toContainText('Microphone access was refused.');
    await shoot(page, info, '06-onboarding-mic-refused');

    await choice(page).getByRole('button', { name: 'Not now' }).click();
    await page.goto('/tools/tuner');
    await page.getByRole('button', { name: 'Start tuner' }).click();
    await expect(page.getByTestId('mic-check')).toHaveAttribute('data-state', 'denied');
    await shoot(page, info, '06b-tuner-refused');
  });

  test('the mic drills and the mic quest @smoke @screens', async ({ page }, info) => {
    test.slow();
    await installDbHelper(page);
    await useFakeMic(page);
    await micQuestDay(page);
    await expect(micQuest(page)).toBeVisible();
    await micQuest(page).scrollIntoViewIfNeeded();
    await shoot(page, info, '07-today-mic-quest');

    // D16: the item is served by D2 first, then by D16 (rule 12).
    await page.goto(`/session?item=${encodeURIComponent('find:A@s6')}`);
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
    const drill = page.locator('[data-drill]');
    for (let i = 0; i < 6; i++) {
      await expect(drill).toHaveAttribute('data-drill', /./);
      if ((await drill.getAttribute('data-drill')) === 'play-the-note') break;
      await page.locator('svg[data-fret-from] [data-cell="s6f5"]').click();
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    await expect(drill).toHaveAttribute('data-drill', 'play-the-note');
    await expect(page.getByTestId('d16-prompt')).toContainText('A on string 6');
    await shoot(page, info, '08-session-d16');
    await startListening(page);
    await shoot(page, info, '08b-session-d16-listening');
    await playNotes(page, ['B2']);
    await expect(page.getByTestId('feedback-wrong')).toContainText('That was A.');
    await shoot(page, info, '08c-session-d16-wrong');

    // D17: G major, spelled a month ago with D7, comes back as a scale to play.
    await seedSpelledKeys(page);
    await focusSession(page, 'C4.sharp-keys');
    await expect(page.locator('[data-drill="play-sequence"]')).toBeVisible();
    await expect(page.getByTestId('d17-prompt')).toHaveText(
      'Play the G major scale, one octave up from G.',
    );
    await shoot(page, info, '09-session-d17');
    await startListening(page);
    await playNotes(page, [55, 57]);
    await expect(page.getByTestId('d17-listening')).toHaveText('Heard A: 2 of 8.');
    await shoot(page, info, '09b-session-d17-heard');
    await playNotes(page, [58]);
    await expect(page.getByTestId('feedback-wrong')).toContainText('G A B C D E F♯ G');
    await shoot(page, info, '09c-session-d17-wrong');

    // Both answers were played into the mic, so the quest moved.
    await page.goto('/');
    await expect(
      quests(page).getByRole('progressbar', { name: 'Play 3 answers on your guitar' }),
    ).toHaveAttribute('aria-valuetext', '2 of 3');
    await micQuest(page).scrollIntoViewIfNeeded();
    await shoot(page, info, '10-today-mic-quest-progress');

    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await shoot(page, info, '11-progress');
    await page.getByRole('region', { name: 'Achievements' }).scrollIntoViewIfNeeded();
    await shoot(page, info, '11b-progress-achievements');
  });
});

// Seeding for the mic-drill walk, as M5-06's and M5-07's specs do it.

const quests = (page: Page) => page.getByRole('region', { name: 'Daily quests' });
const micQuest = (page: Page) => quests(page).locator('[data-quest="try-mic"]');
type DbWindow = Window & { __m508Db?: () => Promise<IDBDatabase> };

/** Gives the page `__m508Db()`: the app's database, once it has its schema. */
async function installDbHelper(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as DbWindow).__m508Db = async () => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('fretwork');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      let db = await open();
      while (!db.objectStoreNames.contains('reviewLogs')) {
        db.close();
        await new Promise((r) => setTimeout(r, 100));
        db = await open();
      }
      return db;
    };
  });
}

/**
 * A fresh learner in mic mode who found A on string 6 the day before, on the
 * first day from 2026-11-02 whose draw holds the mic quest. The page clock is
 * installed for the draw; `Date.prototype.constructor` follows the global
 * `Date`, or Dexie's liveQuery cache turns stored dates into plain objects
 * (see M5-07's spec).
 */
async function micQuestDay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Date.prototype, 'constructor', {
      get: () => window.Date,
      configurable: true,
    });
  });
  await page.clock.install({ time: new Date(2026, 10, 2, 10) });
  await freshStart(page);
  await page.evaluate(async () => {
    const db = await (window as DbWindow).__m508Db!();
    const tx = db.transaction(['reviewLogs', 'settings'], 'readwrite');
    tx.objectStore('reviewLogs').add({
      itemId: 'find:A@s6',
      skillId: 'F2.string6-naturals',
      drillType: 'find-the-note',
      correct: true,
      responseMs: 1500,
      rating: 3,
      hintUsed: false,
      answerGiven: 'A2',
      at: new Date(Date.now() - 86_400_000),
    });
    const settings = tx.objectStore('settings');
    const req = settings.get('singleton');
    req.onsuccess = () => settings.put({ ...req.result, micEnabled: true });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  for (let d = 0; d < 10; d++) {
    await page.clock.setSystemTime(new Date(2026, 10, 2 + d, 10));
    await page.reload();
    await expect(quests(page).getByTestId('quest')).toHaveCount(3);
    if ((await micQuest(page).count()) > 0) return;
  }
  throw new Error('No day drew the mic quest');
}

/**
 * Due C4 cards for G and D major, last spelled with D7 a month ago (before
 * the quest lookback, so the draw doesn't change), so the picker turns to D17.
 */
async function seedSpelledKeys(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const DAY = 86_400_000;
    const db = await (window as DbWindow).__m508Db!();
    const tx = db.transaction(['cards', 'reviewLogs'], 'readwrite');
    const now = Date.now();
    ['spell-key:G', 'spell-key:D'].forEach((itemId, i) => {
      const last = new Date(now - (30 - 7 * i) * DAY);
      const skillId = 'C4.sharp-keys';
      tx.objectStore('cards').put({
        itemId,
        skillId,
        fsrs: {
          due: new Date(now - DAY),
          stability: 5,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: 5,
          learning_steps: 0,
          reps: 1,
          lapses: 0,
          state: 2,
          last_review: last,
        },
        createdAt: last,
        lastReviewedAt: last,
      });
      tx.objectStore('reviewLogs').add({
        itemId,
        skillId,
        drillType: 'spell-it',
        correct: true,
        responseMs: 1500,
        rating: 3,
        hintUsed: false,
        answerGiven: '',
        at: last,
      });
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}
