import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { playNotes, startListening, useFakeMic } from './helpers/mic';

// M5-07: the mic quest and badges (design §3.7). "Play 3 answers on your
// guitar" is drawn only in mic mode, once a skill a mic drill serves has
// been practised; answers played into the mic move it. The mic badges unlock
// on a sample of accurate mic answers, never on volume.
//
// The day's quests are drawn from the date, so the page clock is set to a
// day whose draw holds the mic quest (searched for, so new quests that
// reshuffle the draw don't break the spec).

const quests = (page: Page) => page.getByRole('region', { name: 'Daily quests' });
const micQuest = (page: Page) => quests(page).locator('[data-quest="try-mic"]');
const DAY = 24 * 60 * 60 * 1000;

type DbWindow = Window & { __m507Db?: () => Promise<IDBDatabase> };

/** Gives the page `__m507Db()`: the app's database, once it has its schema. */
async function installDbHelper(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as DbWindow).__m507Db = async () => {
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

/** Turns mic mode on or off (`settings.micEnabled`, as the Settings toggle does), then reloads. */
async function setMicMode(page: Page, micEnabled: boolean): Promise<void> {
  await page.evaluate(async (on) => {
    const db = await (window as DbWindow).__m507Db!();
    const store = () => db.transaction('settings', 'readwrite').objectStore('settings');
    const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = store().get('singleton');
      req.onsuccess = () => resolve(req.result as Record<string, unknown>);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const req = store().put({ ...row, micEnabled: on });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  }, micEnabled);
  await page.reload();
}

interface Answer {
  drillType: string;
  /** Milliseconds before the page's now. */
  ago: number;
  correct?: boolean;
  /** Log the XP `answer` event too, as the runner does for a session answer. */
  event?: boolean;
}

/** Stores answers to `find:A@s6` as the runner does (a review log, plus its `answer` event). */
async function seedAnswers(page: Page, answers: Answer[]): Promise<void> {
  await page.evaluate(async (answers) => {
    const db = await (window as DbWindow).__m507Db!();
    const tx = db.transaction(['reviewLogs', 'gamificationEvents'], 'readwrite');
    answers.forEach(({ drillType, ago, correct = true, event = true }) => {
      const at = new Date(Date.now() - ago);
      const itemId = 'find:A@s6';
      const skillId = 'F2.string6-naturals';
      tx.objectStore('reviewLogs').add({
        itemId,
        skillId,
        drillType,
        correct,
        responseMs: 1500,
        rating: correct ? 3 : 1,
        hintUsed: false,
        answerGiven: 'A2',
        at,
      });
      if (event) {
        tx.objectStore('gamificationEvents').add({
          type: 'answer',
          at,
          data: { itemId, skillId, correct, rating: correct ? 3 : 1, kind: 'due', xp: 10 },
        });
      }
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, answers);
  await page.reload();
}

/** The logged `quest-completed` events. */
async function completedQuests(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const db = await (window as DbWindow).__m507Db!();
    const req = db
      .transaction('gamificationEvents')
      .objectStore('gamificationEvents')
      .index('type')
      .getAll('quest-completed');
    const rows = await new Promise<{ data: unknown }[]>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as { data: unknown }[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.map((r) => r.data);
  });
}

/**
 * Installs the page clock at `time`. Playwright's fake `Date` shares the real
 * prototype, but a real date's `constructor` is still the native one, which
 * Dexie (having captured the fake as `Date` at load) doesn't know: its
 * liveQuery cache then clones stored dates into plain objects. Pointing
 * `constructor` at whichever `Date` is global keeps them dates.
 */
async function installClock(page: Page, time: Date): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Date.prototype, 'constructor', {
      get: () => window.Date,
      configurable: true,
    });
  });
  await page.clock.install({ time });
}

/**
 * A fresh learner in mic mode who practised string 6 the day before, on the
 * first day from 2026-11-02 whose draw holds the mic quest.
 */
async function micQuestDay(page: Page): Promise<void> {
  await installClock(page, new Date(2026, 10, 2, 10));
  await freshStart(page);
  await seedAnswers(page, [{ drillType: 'find-the-note', ago: DAY, event: false }]);
  await setMicMode(page, true);
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
 * the quest lookback, so the draw doesn't change), so the picker turns to
 * D17 next, as M5-06's spec seeds them.
 */
async function seedSpelledKeys(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const DAY = 86_400_000;
    const db = await (window as DbWindow).__m507Db!();
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

/** Today's logged D17 answers. */
async function d17Answers(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await (window as DbWindow).__m507Db!();
    const req = db.transaction('reviewLogs').objectStore('reviewLogs').getAll();
    const rows = await new Promise<{ drillType: string; answerGiven: string }[]>(
      (resolve, reject) => {
        req.onsuccess = () => resolve(req.result as { drillType: string; answerGiven: string }[]);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    return rows.filter((r) => r.drillType === 'play-sequence').map((r) => r.answerGiven);
  });
}

test.beforeEach(async ({ page }) => {
  await installDbHelper(page);
  await useFakeMic(page);
});

test.describe('M5-07 mic quest', () => {
  test('mic mode draws the quest, and answers played into the mic complete it @smoke', async ({
    page,
  }) => {
    await micQuestDay(page);
    const bar = quests(page).getByRole('progressbar', { name: 'Play 3 answers on your guitar' });
    await expect(bar).toHaveAttribute('aria-valuetext', '0 of 3');
    await expect(micQuest(page)).toContainText('notes under your fingers');
    await expectNoHorizontalOverflow(page);

    // The same day without mic mode: the quest can't be met, so it isn't drawn.
    await setMicMode(page, false);
    await expect(quests(page).getByTestId('quest')).toHaveCount(3);
    await expect(micQuest(page)).toHaveCount(0);
    await setMicMode(page, true);
    await expect(micQuest(page)).toHaveCount(1);

    // Tapped answers don't count; answers played into the mic do, right or wrong.
    await seedAnswers(page, [
      { drillType: 'find-the-note', ago: 4000 },
      { drillType: 'play-the-note', ago: 3000 },
      { drillType: 'play-sequence', ago: 2000, correct: false },
    ]);
    await expect(bar).toHaveAttribute('aria-valuetext', '2 of 3');
    await seedAnswers(page, [{ drillType: 'play-the-note', ago: 1000 }]);
    await expect(micQuest(page)).toHaveAttribute('data-done', 'true');
    await expect
      .poll(() => completedQuests(page))
      .toEqual([expect.objectContaining({ questId: 'try-mic', xp: 15 })]);
    await expectNoHorizontalOverflow(page);
  });

  test('a note played in a D16 session moves the quest', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await micQuestDay(page);

    await page.goto(`/session?item=${encodeURIComponent('find:A@s6')}`);
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
    const drill = page.locator('[data-drill]');
    // The picker varies the drill (research/02 rule 12): D2 first, then D16.
    for (let i = 0; i < 6; i++) {
      await expect(drill).toHaveAttribute('data-drill', /./);
      if ((await drill.getAttribute('data-drill')) === 'play-the-note') break;
      await page.locator('svg[data-fret-from] [data-cell="s6f5"]').click();
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    await expect(drill).toHaveAttribute('data-drill', 'play-the-note');
    await startListening(page);
    await playNotes(page, ['A2']);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();

    await page.goto('/');
    await expect(
      quests(page).getByRole('progressbar', { name: 'Play 3 answers on your guitar' }),
    ).toHaveAttribute('aria-valuetext', '1 of 3');
  });

  test('a D17 "Show me" needs no guitar, so it doesn\'t move the quest', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await micQuestDay(page);
    await seedSpelledKeys(page);
    await focusSession(page, 'C4.sharp-keys');
    await expect(page.locator('[data-drill="play-sequence"]')).toBeVisible();
    await page.getByRole('button', { name: 'Show me' }).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('G A B C D E F♯ G');
    await expect.poll(() => d17Answers(page)).toEqual(['(show me)']);

    await page.goto('/');
    await expect(
      quests(page).getByRole('progressbar', { name: 'Play 3 answers on your guitar' }),
    ).toHaveAttribute('aria-valuetext', '0 of 3');
  });
});

test.describe('M5-07 mic badges', () => {
  test('accurate answers in a mic drill unlock its badge, and only its badge', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedAnswers(
      page,
      Array.from({ length: 10 }, (_, i) => ({ drillType: 'play-the-note', ago: (10 - i) * 1000 })),
    );

    const toast = page.getByTestId('achievement-toast');
    await expect(toast).toContainText('Notes in your hands');
    await expect(toast).not.toContainText('Shapes in your hands');
    await toast.getByRole('button', { name: 'Dismiss' }).click();

    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Progress' })
      .click();
    const panel = page.getByRole('region', { name: 'Achievements' });
    await expect(panel.getByTestId('achievement-mic-notes')).toHaveAttribute(
      'data-unlocked',
      'true',
    );
    await expect(panel.getByTestId('achievement-mic-notes')).toContainText(
      'You play named notes on your guitar, right 9 times in 10.',
    );
    await expect(panel.getByTestId('achievement-mic-sequences')).toHaveAttribute(
      'data-unlocked',
      'false',
    );
    await expectNoHorizontalOverflow(page);
  });

  test('many answers at low accuracy earn nothing', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedAnswers(
      page,
      Array.from({ length: 30 }, (_, i) => ({
        drillType: 'play-the-note',
        ago: (30 - i) * 1000,
        correct: i % 3 !== 0,
      })),
    );
    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Progress' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Achievements' }).getByTestId('achievement-mic-notes'),
    ).toHaveAttribute('data-unlocked', 'false');
    await expect(page.getByTestId('achievement-toast')).toHaveCount(0);
  });
});
