import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { C3_SKILLS, SKILLS_BEFORE_C3 } from './helpers/intervals';

// M10-19: Explore's "Quiz me on this" walks a locked skill back through the
// gates it still waits for, as the progression player does since M10-02: a
// hard prerequisite not yet mastered, or a soft one not yet practising. The
// unmet soft gate is exactly what the learner should practise next.

type Status = 'practising' | 'mastered';

/** Store skill statuses, as a learner's progress would have them, then reload. */
async function seedStatuses(page: Page, statuses: Record<string, Status>): Promise<void> {
  await page.evaluate(async (rows) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('skillStates', 'readwrite');
      for (const [skillId, status] of rows) {
        tx.objectStore('skillStates').put({ skillId, status, guideLevel: 1, rollingAccuracy: 0.9 });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, Object.entries(statuses));
  await page.reload();
}

const mastered = (ids: readonly string[]) =>
  Object.fromEntries(ids.map((id) => [id, 'mastered' as const]));

/** The notes and every interval mastered: C4's sharp keys open, not yet practised. */
const INTERVALS_LEARNER: Record<string, Status> = mastered([...SKILLS_BEFORE_C3, ...C3_SKILLS]);

const quiz = (page: Page) => page.getByRole('link', { name: 'Quiz me on this' });

async function openSession(page: Page, href: string): Promise<void> {
  await expect(quiz(page)).toHaveAttribute('href', href);
  await quiz(page).click();
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.?]/g, '\\$&')}$`));
  await expect(page.getByTestId('session')).toBeVisible();
}

test.describe('M10-19 Explore walk-backs follow the gates still unmet', () => {
  test('CAGED offers triads while the shapes wait on them practising', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'The full flow runs on the iPad projects.');
    await freshStart(page, '/explore?view=caged');
    // F2's strings 6 and 5 are mastered (hard); C6 waits only on triads (soft).
    await seedStatuses(page, { ...INTERVALS_LEARNER, 'C4.sharp-keys': 'practising' });
    await openSession(page, '/session?skill=C5.triads');
    await expect(page.getByTestId('d7-drill')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('the chord finder offers the sharp keys while triads wait on them', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'The full flow runs on the iPad projects.');
    await freshStart(page, '/explore?view=chord-finder');
    // 3rds are mastered (hard); triads wait only on the sharp keys practising (soft).
    await seedStatuses(page, INTERVALS_LEARNER);
    await expect(quiz(page)).not.toHaveAttribute('href', /item=|C5\./);
    await openSession(page, '/session?skill=C4.sharp-keys');
    await expectNoHorizontalOverflow(page);
  });

  test('@smoke the circle offers the one step still unpractised', async ({ page }) => {
    await freshStart(page, '/explore?view=circle-of-fifths');
    // The sharp keys wait on both steps practising (soft); half steps are.
    await seedStatuses(page, {
      'F1.alphabet': 'mastered',
      'F1.b-c-e-f': 'mastered',
      'F1.half-steps': 'practising',
    });
    await openSession(page, '/session?skill=F1.whole-steps');
    await expectNoHorizontalOverflow(page);
  });
});
