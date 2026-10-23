import { expect, test, type Page } from '@playwright/test';
import {
  F1_SKILLS,
  answer,
  expectNoHorizontalOverflow,
  freshStart,
  masterSkills,
  targetNote,
} from './helpers';

// M2-10: three daily quests on Today, drawn from the date; completing one
// pays bonus XP and is logged (design §3.7 daily quests).

const quests = (page: Page) => page.getByRole('region', { name: 'Daily quests' });
const quest = (page: Page, id: string) => quests(page).locator(`[data-quest="${id}"]`);

/**
 * Store `count` fluent, unguided first answers to new items as the runner
 * does (a review log and an `answer` event at the same instant), then reload.
 */
async function seedNewAnswers(page: Page, count: number): Promise<void> {
  await expect(quests(page).getByTestId('quest')).toHaveCount(3);
  await page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['reviewLogs', 'gamificationEvents'], 'readwrite');
    for (let i = 0; i < count; i++) {
      const at = new Date(Date.now() - (count - i) * 1000);
      const itemId = `note@s6f${i + 1}`;
      const skillId = 'F2.string6-naturals';
      tx.objectStore('reviewLogs').add({
        itemId,
        skillId,
        drillType: 'name-the-note',
        correct: true,
        responseMs: 600,
        rating: 4,
        hintUsed: false,
        answerGiven: 'F',
        at,
      });
      tx.objectStore('gamificationEvents').add({
        type: 'answer',
        at,
        data: { itemId, skillId, correct: true, rating: 4, kind: 'new', xp: 12 },
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, count);
  await page.reload();
}

/** The logged `quest-completed` events and the stored XP total. */
async function storedQuestXp(page: Page): Promise<{ events: unknown[]; xpTotal: number }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['gamificationEvents', 'gamification']);
    const get = <T>(req: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const events = await get(
      tx.objectStore('gamificationEvents').index('type').getAll('quest-completed'),
    );
    const g = await get(tx.objectStore('gamification').get('singleton'));
    db.close();
    return {
      events: (events as { data: unknown }[]).map((e) => e.data),
      xpTotal: (g as { xpTotal?: number } | undefined)?.xpTotal ?? 0,
    };
  });
}

test.describe('M2-10 daily quests', () => {
  test('a first day shows three quests, and completing one pays bonus XP once @smoke', async ({
    page,
  }) => {
    await freshStart(page);
    // No history yet, so the draw holds the three everyday quests.
    await expect(quests(page).getByRole('heading', { name: 'Daily quests' })).toBeVisible();
    await expect(quests(page).getByTestId('quest')).toHaveCount(3);
    for (const id of ['new-ground', 'fluent', 'fix-slips']) {
      await expect(quest(page, id)).toHaveAttribute('data-done', 'false');
    }
    await expect(quests(page).getByTestId('quests-tally')).toHaveText('0 of 3 done');
    await expect(
      quests(page).getByRole('progressbar', { name: 'Learn 3 new items' }),
    ).toHaveAttribute('aria-valuetext', '0 of 3');
    await expectNoHorizontalOverflow(page);

    await seedNewAnswers(page, 3);
    await expect(quest(page, 'new-ground')).toHaveAttribute('data-done', 'true');
    await expect(quest(page, 'new-ground').getByTestId('quest-progress')).toHaveText('Done');
    await expect(quests(page).getByTestId('quests-tally')).toHaveText('1 of 3 done');
    await expect(
      quests(page).getByRole('progressbar', { name: 'Recall 5 items fluently' }),
    ).toHaveAttribute('aria-valuetext', '3 of 5');
    await expect.poll(async () => (await storedQuestXp(page)).events).toHaveLength(1);
    const first = await storedQuestXp(page);
    expect(first.events[0]).toMatchObject({ questId: 'new-ground', xp: 20 });
    expect(first.xpTotal).toBe(20);

    // Reopening Today never pays the same quest twice.
    await page.reload();
    await expect(quest(page, 'new-ground')).toHaveAttribute('data-done', 'true');
    expect(await storedQuestXp(page)).toEqual(first);
    await expectNoHorizontalOverflow(page);
  });

  test('a session moves quest progress, shown back on Today', async ({ page }) => {
    await freshStart(page);
    // Skip the F1 note-wheel skills so the session serves D1 prompts.
    await masterSkills(page, F1_SKILLS);
    await expect(quests(page).getByTestId('quest')).toHaveCount(3);

    await page.getByTestId('start-session').click();
    for (let i = 0; i < 8; i++) {
      const note = await targetNote(page);
      await answer(page, note);
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    await page.getByRole('button', { name: 'End session' }).click();
    await page.getByRole('link', { name: 'Done' }).click();

    // New notes recalled on their own count toward "Learn 3 new items".
    const bar = quests(page).getByRole('progressbar', { name: 'Learn 3 new items' });
    await expect
      .poll(async () => Number(await bar.getAttribute('aria-valuenow')))
      .toBeGreaterThan(0);
  });

  test('quests sit between the hero and the stats, inside the content column @layout', async ({
    page,
  }) => {
    await freshStart(page);
    await expect(quests(page).getByTestId('quest')).toHaveCount(3);
    const hero = (await page.getByRole('region', { name: 'Streak and daily goal' }).boundingBox())!;
    const box = (await quests(page).boundingBox())!;
    const stats = (await page.getByTestId('due-count').boundingBox())!;
    expect(box.y).toBeGreaterThan(hero.y + hero.height - 1);
    expect(stats.y).toBeGreaterThan(box.y + box.height - 1);
    for (const q of await quests(page).getByTestId('quest').all()) {
      const b = (await q.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(box.x);
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
  });
});
