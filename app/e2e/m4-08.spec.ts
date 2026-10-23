import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, F1_SKILLS, F3_SKILLS, freshStart } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';

// M4-08: D15 "Hear it, find it" (research/02 rule 13). The open string
// sounds, then a note on it, and the learner taps the note. On C2's find
// cards (after D2 has served them) the note is named; on I6's own ear-find
// cards it is found by ear.

const FIND = 'find:G@s4';
const EAR = 'ear-find:G@s4';
const DAY = 86_400_000;

/**
 * A learner past F1–F3 with one card due: C2's `find:G@s4`, last served by
 * D2 (so D15 serves it next), or I6's `ear-find:G@s4` at guide level 1.
 */
async function seedDueCard(page: Page, item: string): Promise<void> {
  const skillId = item === EAR ? 'I6.ear-find' : 'C2.all-notes';
  await page.evaluate(
    async ({ item, skillId, mastered, DAY }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['skillStates', 'cards', 'reviewLogs'], 'readwrite');
      const now = Date.now();
      for (const id of mastered) {
        tx.objectStore('skillStates').put({
          skillId: id,
          status: 'mastered',
          guideLevel: 0,
          rollingAccuracy: 1,
        });
      }
      tx.objectStore('skillStates').put({
        skillId,
        status: 'practising',
        guideLevel: 1,
        rollingAccuracy: 0.9,
      });
      tx.objectStore('cards').put({
        itemId: item,
        skillId,
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
      if (skillId === 'C2.all-notes') {
        tx.objectStore('reviewLogs').add({
          itemId: item,
          skillId,
          drillType: 'find-the-note',
          correct: true,
          responseMs: 1500,
          rating: 3,
          hintUsed: false,
          answerGiven: 's4f5',
          at: new Date(now - 3 * DAY),
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    {
      item,
      skillId,
      mastered: [...F1_SKILLS, ...F3_SKILLS, 'F2.string6-naturals', 'F2.string5-naturals'],
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
async function startD15(page: Page, item: string): Promise<void> {
  await page.goto(`/session?item=${encodeURIComponent(item)}`);
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
  test('finds a C2 note it names and plays @smoke', async ({ page }) => {
    await seedDueCard(page, FIND);
    await startD15(page, FIND);

    await expect(page.getByTestId('d15-prompt')).toHaveText('Find the G you hear on string 4');
    await expect(page.getByTestId('d15-explain')).toHaveText('First the open D, then the note.');
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

  test('finds an I6 ear card by ear', async ({ page }) => {
    await seedDueCard(page, EAR);
    await startD15(page, EAR);

    await expect(page.getByTestId('d15-prompt')).toHaveText('Find the note you hear on string 4');
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
  });

  test('shows a wrong tap by ear against the note, and how far off it was', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await seedDueCard(page, EAR);
    await startD15(page, EAR);

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

  test('asks for sound on an ear card with sound off, then plays it', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await seedDueCard(page, EAR);
    await soundOff(page);
    await startD15(page, EAR);

    await expect(page.getByTestId('d15-prompt')).toHaveText('Find the note you hear on string 4');
    await expect(page.getByTestId('d15-explain')).toHaveText(
      'Sound is off. Turn it on to hear the note.',
    );
    await page.getByRole('button', { name: 'Turn sound on' }).click();
    await expect(page.getByRole('button', { name: 'Hear it again' })).toBeEnabled();
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
      .toBeGreaterThan(0.01);
  });
});
