import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M11-02: XP is visible. The sidebar shows XP earned under the streak,
// Progress shows XP earned and what there is to spend in the Garage, the
// session summary adds the balance, and About says what XP is for and whose
// trademarks the guitar names are (design §3.7, §3.8).

const XP_TOTAL = 1240;
const SPENT = 240;

const xp = (n: number) => n.toLocaleString('en-GB');

/**
 * Give the profile `XP_TOTAL` lifetime XP and one bought part costing
 * `SPENT`, so XP earned and the balance differ, then reload so the app reads
 * them. Call after `freshStart`.
 */
async function seedXp(page: Page): Promise<void> {
  await expect(page.getByTestId('goal-ring').first()).toBeVisible();
  await page.evaluate(
    async ({ xpTotal, price }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['gamification', 'garagePurchases'], 'readwrite');
      const store = tx.objectStore('gamification');
      const get = store.get('singleton');
      get.onsuccess = () => store.put({ ...get.result, xpTotal, key: 'singleton' });
      tx.objectStore('garagePurchases').put({ itemId: 'finish.blue', price, at: new Date() });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { xpTotal: XP_TOTAL, price: SPENT },
  );
  await page.reload();
}

/**
 * Answer whatever note prompt is on screen correctly: D1 names the
 * highlighted note, D2 taps the named note on its string.
 */
async function answerCorrectly(page: Page): Promise<void> {
  const find = page.getByTestId('d2-prompt');
  const named = page.getByTestId('marker-target').first();
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

test.describe('M11-02 XP earned and the Garage balance', () => {
  test('the sidebar shows XP earned under the streak @layout', async ({ page }) => {
    await freshStart(page);
    await seedXp(page);
    const badge = page.getByTestId('sidebar-streak');
    await expect(badge).toHaveAttribute('aria-label', new RegExp(`${xp(XP_TOTAL)} XP earned$`));
    // The full sidebar spells it out; the icon rail compacts it.
    const full = (await badge.getAttribute('data-variant')) === 'full';
    await expect(page.getByTestId('sidebar-xp')).toHaveText(
      full ? `${xp(XP_TOTAL)} XP earned` : '1.2k XP',
    );
    await expectNoHorizontalOverflow(page);
  });

  test('Progress shows XP earned, the balance and what XP is for @smoke', async ({ page }) => {
    await freshStart(page);
    await seedXp(page);
    await page.goto('/progress');
    const stats = page.locator('[data-progress-panel="stats"]');
    await expect(stats.getByTestId('xp-earned')).toHaveText(xp(XP_TOTAL));
    await expect(stats.getByTestId('xp-to-spend')).toHaveText(xp(XP_TOTAL - SPENT));
    await expect(stats.getByText('To spend in the Garage')).toBeVisible();
    const explainer = stats.getByRole('region', { name: 'What XP is for' });
    await expect(explainer).toContainText('count most');
    await expect(explainer).toContainText('buy parts for your guitar');
    await expectNoHorizontalOverflow(page);
  });

  test('the session summary adds what there is to spend, and the sidebar follows', async ({
    page,
  }) => {
    await freshStart(page);
    await seedXp(page);
    await focusSession(page, 'F2.string6-naturals');
    for (let n = 0; n < 3; n++) await answerCorrectly(page);
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('session-summary')).toBeVisible();

    const earned = Number(await page.getByTestId('summary-xp').textContent());
    expect(earned).toBeGreaterThan(0);
    await expect(page.getByTestId('garage-balance')).toHaveText(
      `${xp(XP_TOTAL - SPENT + earned)} to spend in the Garage`,
    );

    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByTestId('sidebar-streak')).toHaveAttribute(
      'aria-label',
      new RegExp(`${xp(XP_TOTAL + earned)} XP earned$`),
    );
  });

  test('About says what XP is for and notes the guitar trademarks', async ({ page }) => {
    await freshStart(page, '/about');
    await expect(
      page.getByRole('region', { name: 'What XP is for' }).getByText(/right or wrong/),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guitar names' })).toContainText(
      'FretFree isn’t affiliated with or endorsed by either. The guitar drawings are our own.',
    );
  });
});
