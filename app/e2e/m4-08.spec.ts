import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, F1_SKILLS, F3_SKILLS, freshStart } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';

// M4-08: D15 "Hear it, find it" (research/02 rule 13). The open string
// sounds, then a note on it, and the learner taps the note. It serves C2's
// find cards on the reps D2 doesn't (the picker varies the drill), and the
// note's name fades with the skill's guide level.

const ITEM = 'find:G@s4';
const DAY = 86_400_000;

/**
 * A learner past F1–F3 whose C2 card for G on string 4 is due, last served
 * by D2, so D15 serves it first. C2 sits at `guideLevel`: 2+ names the note,
 * 0–1 is by ear.
 */
async function seedDueCard(page: Page, guideLevel: number): Promise<void> {
  await page.evaluate(
    async ({ item, mastered, guideLevel, DAY }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['skillStates', 'cards', 'reviewLogs'], 'readwrite');
      const now = Date.now();
      for (const skillId of mastered) {
        tx.objectStore('skillStates').put({
          skillId,
          status: 'mastered',
          guideLevel: 0,
          rollingAccuracy: 1,
        });
      }
      tx.objectStore('skillStates').put({
        skillId: 'C2.all-notes',
        status: 'practising',
        guideLevel,
        rollingAccuracy: 0.9,
      });
      tx.objectStore('cards').put({
        itemId: item,
        skillId: 'C2.all-notes',
        fsrs: {
          due: new Date(now - 60_000),
          stability: 3,
          difficulty: 5,
          elapsed_days: 3,
          scheduled_days: 3,
          learning_steps: 0,
          reps: 3,
          lapses: 0,
          state: 2,
          last_review: new Date(now - 3 * DAY),
        },
        createdAt: new Date(now - 6 * DAY),
        lastReviewedAt: new Date(now - 3 * DAY),
      });
      tx.objectStore('reviewLogs').add({
        itemId: item,
        skillId: 'C2.all-notes',
        drillType: 'find-the-note',
        correct: true,
        responseMs: 1500,
        rating: 3,
        hintUsed: false,
        answerGiven: 's4f5',
        at: new Date(now - 3 * DAY),
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    {
      item: ITEM,
      mastered: [...F1_SKILLS, ...F3_SKILLS, 'F2.string6-naturals', 'F2.string5-naturals'],
      guideLevel,
      DAY,
    },
  );
}

/** Turns sound off, as Settings → Sound does. */
async function soundOff(page: Page): Promise<void> {
  await page.evaluate(async () => {
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
      const req = store().put({ ...row, key: 'singleton', soundOn: false });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  });
}

/** A session on the one item, the way "Quiz me on this" focuses one; D15 serves it. */
async function startD15(page: Page): Promise<void> {
  await page.goto(`/session?item=${encodeURIComponent(ITEM)}`);
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', 'hear-it-find-it');
}

const neck = (page: Page) => page.locator('svg[data-fret-from]');

/** Taps a fret on string 4, sliding a compact window to it first. */
async function tapFret(page: Page, fret: number): Promise<void> {
  const cell = neck(page).locator(`[data-cell="s4f${fret}"]`);
  for (let i = 0; i < 4 && (await cell.count()) === 0; i += 1) {
    await page.getByRole('button', { name: 'Higher frets' }).click();
  }
  await cell.click();
}

test.beforeEach(async ({ page }) => {
  await tapAudioOutput(page);
  await freshStart(page);
});

test.describe('D15 "Hear it, find it"', () => {
  test('plays the open string and the note, and grades the tap by ear @smoke', async ({ page }) => {
    await seedDueCard(page, 1);
    await startD15(page);

    const prompt = page.getByTestId('d15-prompt');
    await expect(prompt).toHaveText('Find the note you hear on string 4');
    await expect(page.getByTestId('d15-explain')).toHaveText('First the open D, then the note.');
    // Only the reference is marked: the open string, named.
    await expect(page.getByTestId('marker-root')).toHaveAttribute('data-fret', '0');
    await expect(page.getByTestId('marker-root')).toHaveText('D');
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Hear it again' }).click();
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
      .toBeGreaterThan(0.01);

    await tapFret(page, 5);
    await expect(page.getByTestId('feedback-correct')).toContainText('G');
    await expect(page.getByTestId('d15-explain')).toHaveText(
      'G is at fret 5 on string 4, a perfect 4th above the open D.',
    );
    await expect(page.getByTestId('marker-correct')).toHaveAttribute('data-fret', '5');
  });

  test('shows a wrong tap against the note, and how far off it was', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await seedDueCard(page, 1);
    await startD15(page);

    await tapFret(page, 3);
    await expect(page.getByTestId('feedback-wrong')).toContainText('That was G.');
    await expect(page.getByTestId('d15-explain')).toHaveText(
      'You tapped F (fret 3), 2 frets too low. G is at fret 5 on string 4, a perfect 4th above the open D.',
    );
    await expect(page.getByTestId('marker-correct')).toHaveAttribute('data-fret', '5');
    await expect(page.getByTestId('marker-wrong')).toHaveAttribute('data-fret', '3');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('names the note while the guides are up', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await seedDueCard(page, 3);
    await startD15(page);

    await expect(page.getByTestId('d15-prompt')).toHaveText('Find the G you hear on string 4');
    // The neck still doesn't mark the answer.
    await expect(page.getByTestId('marker-target')).toHaveCount(0);
    await tapFret(page, 5);
    await expect(page.getByTestId('feedback-correct')).toContainText('G');
  });

  test('names the note when sound is off', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await seedDueCard(page, 1);
    await soundOff(page);
    await startD15(page);

    await expect(page.getByTestId('d15-prompt')).toHaveText('Find the G you hear on string 4');
    await expect(page.getByTestId('d15-explain')).toContainText('Sound is off');
    await expect(page.getByRole('button', { name: 'Hear it again' })).toBeDisabled();
  });
});
