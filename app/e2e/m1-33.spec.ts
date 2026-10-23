import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M1-33: the session summary's Done is in view without scrolling on every
// supported viewport, a phone held sideways included (design §7 compact). At
// short heights the summary splits into what happened and what's next, so
// Done's place doesn't depend on how much the session earned.

const SKILL = 'F2.string6-naturals';
const DAY = 86_400_000;

/** Phone landscape viewports down to the shortest (iPhone SE, 1st gen). */
const SHORT_LANDSCAPES = [
  { width: 568, height: 320 },
  { width: 712, height: 325 },
  { width: 734, height: 343 },
  { width: 838, height: 390 },
];

/** An iPhone in portrait with Safari's bars showing. */
const PORTRAIT = { width: 390, height: 664 };

/**
 * A finished session yesterday with a 9s median answer, so today's session
 * is a new personal best: one more moment on the summary.
 */
async function seedSlowHistory(page: Page): Promise<void> {
  await page.evaluate(async (DAY) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['reviewLogs', 'sessionLogs'], 'readwrite');
    const start = new Date(Date.now() - DAY);
    tx.objectStore('sessionLogs').add({
      startedAt: start,
      endedAt: new Date(start.getTime() + 60_000),
      itemsSeen: 6,
      accuracy: 1,
    });
    for (let i = 0; i < 6; i++) {
      tx.objectStore('reviewLogs').add({
        itemId: 'note@s1f0',
        skillId: 'C2.all-notes',
        drillType: 'name-the-note',
        correct: true,
        responseMs: 9000,
        rating: 2,
        hintUsed: false,
        answerGiven: 'E',
        at: new Date(start.getTime() + (i + 1) * 5000),
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, DAY);
}

/**
 * Answer whatever note prompt is on screen correctly: D1 names the
 * highlighted note, D2 taps the named note on its string.
 */
async function answerCorrectly(page: Page): Promise<void> {
  const find = page.getByTestId('d2-prompt');
  const named = page.getByTestId('marker-target').first();
  // D2's worked example also marks its targets, so check for its prompt first.
  await expect(find.or(named).first()).toBeVisible();
  if (await find.isVisible()) {
    const [, pc, string] = /(?:Find|This is) ([A-G]) on string (\d)/.exec(
      (await find.textContent()) ?? '',
    )!;
    const fret = Array.from({ length: 13 }, (_, f) => f).find(
      (f) => noteName(Number(string), f) === pc,
    )!;
    await page.locator(`[data-cell="s${string}f${fret}"]`).click();
  } else {
    const note = await targetNote(page);
    await page
      .getByRole('group', { name: /highlighted|this is/i })
      .getByRole('button', { name: note, exact: true })
      .click();
  }
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

async function finishSession(page: Page, answers: number): Promise<void> {
  await focusSession(page, SKILL);
  for (let n = 0; n < answers; n++) await answerCorrectly(page);
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByTestId('session-summary')).toBeVisible();
}

/** Done lies wholly inside the viewport and nothing has scrolled. */
async function expectDoneInView(page: Page): Promise<void> {
  const done = page.getByRole('link', { name: 'Done' });
  await expect(done).toBeInViewport({ ratio: 1 });
  const box = (await done.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // The summary scrolls inside its own screen, so check that too.
  expect(await page.getByTestId('session-summary').evaluate((el) => el.scrollTop)).toBe(0);
}

/** The busiest summary a session gives: learned today, the hint, every moment, the forecast. */
async function expectBusySummary(page: Page): Promise<void> {
  await expect(page.getByTestId('summary-headline')).toHaveText(
    /^You learned string 6 to fret \d+ today$/,
  );
  await expect(page.getByTestId('summary-learned-hint')).toBeVisible();
  await expect(page.getByTestId('moment-perfect')).toBeVisible();
  await expect(page.getByTestId('moment-personal-best')).toBeVisible();
  await expect(page.getByTestId('moment-combo')).toBeVisible();
  await expect(page.getByTestId('summary-progress')).toBeVisible();
  await expect(page.getByTestId('summary-spacing')).toBeVisible();
}

test.describe('M1-33 session summary: Done in view', () => {
  test('a short session puts Done in view without scrolling @smoke @layout', async ({ page }) => {
    await freshStart(page);
    await finishSession(page, 3);
    await expect(page.getByTestId('summary-progress')).toBeVisible();
    await expectDoneInView(page);
    await expectNoHorizontalOverflow(page);
  });

  test('the busiest summary keeps Done in view @smoke @layout', async ({ page }) => {
    await freshStart(page);
    await seedSlowHistory(page);
    await finishSession(page, 12);
    await expectBusySummary(page);
    await expectDoneInView(page);
    await expectNoHorizontalOverflow(page);

    // Every phone held sideways, down to the shortest.
    for (const size of SHORT_LANDSCAPES) {
      await page.setViewportSize(size);
      await expectDoneInView(page);
      await expectNoHorizontalOverflow(page);
    }

    // A phone in portrait can't split the summary, so what's next is held at
    // the bottom while the recap scrolls under it, and nothing ends up hidden.
    await page.setViewportSize(PORTRAIT);
    await expectDoneInView(page);
    await expectNoHorizontalOverflow(page);
    const summary = page.getByTestId('session-summary');
    await summary.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.getByRole('link', { name: 'Done' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('summary-progress')).toBeInViewport({ ratio: 1 });
    const progress = (await page.getByTestId('summary-progress').boundingBox())!;
    const next = (await page.getByTestId('summary-spacing').boundingBox())!;
    expect(progress.y + progress.height).toBeLessThanOrEqual(next.y);

    // Done still finishes the session.
    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
