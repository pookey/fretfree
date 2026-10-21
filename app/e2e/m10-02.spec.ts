import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { SKILLS_BEFORE_C3 } from './helpers/intervals';

// M10-02: the songs on-ramp. Triads open on mastered 3rds with the sharp
// keys practising, and Harmony's first stage (C, G and D) on mastered triads
// with the sharp-key degrees practising: no flat-key mastery on the way.

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

/** Everything before intervals mastered, 3rds mastered, the sharp keys practising. */
const THIRDS_LEARNER: Record<string, Status> = {
  ...Object.fromEntries(SKILLS_BEFORE_C3.map((id) => [id, 'mastered' as const])),
  'C3.thirds': 'mastered',
  'C4.sharp-keys': 'practising',
};

/** A few weeks on: triads mastered, the sharp-key degrees practising. */
const TRIADS_LEARNER: Record<string, Status> = {
  ...THIRDS_LEARNER,
  'C4.sharp-key-degrees': 'practising',
  'C5.triads': 'mastered',
};

const moduleCard = (page: Page, id: string) => page.getByTestId(`module-${id}`);
const skillRow = (page: Page, id: string) =>
  page.getByTestId('module-detail').getByTestId(`skill-${id}`);

async function chooseSongs(page: Page): Promise<void> {
  await page.goto('/learn');
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
  await page.getByRole('combobox', { name: 'Ordered for your goal' }).selectOption('songs');
  const cards = page.getByRole('region', { name: 'Modules' }).getByRole('link');
  await expect(cards.first()).toHaveAttribute('data-testid', 'module-harmony');
}

test.describe('M10-02 songs on-ramp', () => {
  test('Chords opens on mastered 3rds and practised sharp keys', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'The full flow runs on the iPad projects.');
    await freshStart(page);
    await seedStatuses(page, THIRDS_LEARNER);
    await chooseSongs(page);
    await expect(moduleCard(page, 'chords')).toHaveAttribute('data-state', 'open');
    // Harmony waits on mastered triads (rule 7), with the sharp-key degrees practised.
    await expect(moduleCard(page, 'harmony')).toHaveAttribute('data-state', 'locked');

    await page.goto('/learn?module=chords');
    await expect(skillRow(page, 'C5.triads')).toHaveAttribute('data-status', 'unlocked');
    await page.goto('/learn?module=harmony');
    await expect(skillRow(page, 'C8.numerals-major')).toContainText(
      "Preview only. It joins your sessions once you've mastered Spell major and minor triads and are practising Scale degrees in the sharp keys.",
    );
    await expectNoHorizontalOverflow(page);
  });

  test('@smoke a songs learner with triads sees Harmony open and practises in C, G or D', async ({
    page,
  }, info) => {
    await freshStart(page);
    await seedStatuses(page, TRIADS_LEARNER);
    await chooseSongs(page);
    await expect(moduleCard(page, 'chords')).toHaveAttribute('data-state', 'open');
    await expect(moduleCard(page, 'harmony')).toHaveAttribute('data-state', 'open');
    await expectNoHorizontalOverflow(page);

    if (info.project.name !== 'iphone-smoke') {
      // Only the first key stage opens: the others wait on it, and stage 3
      // on mastered flat-key degrees.
      await page.goto('/learn?module=harmony');
      await expect(skillRow(page, 'C8.numerals-major')).toHaveAttribute('data-status', 'unlocked');
      for (const id of ['C8.numerals-a-e-f', 'C8.numerals-other-keys'])
        await expect(skillRow(page, id)).toHaveAttribute('data-status', 'locked');
      await expect(skillRow(page, 'C8.numerals-other-keys')).toContainText(
        'Scale degrees in the flat keys',
      );
    }

    await focusSession(page, 'C8.numerals-major');
    await expect(page.getByTestId('d11-drill')).toBeVisible();
    await expect(page.getByTestId('d11-key')).toHaveText(/^(C|G|D) major$/);
    await expectNoHorizontalOverflow(page);
  });
});
