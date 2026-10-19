import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import {
  enableMicMode,
  failNextMicStart,
  playNotes,
  startListening,
  useFakeMic,
} from './helpers/mic';

// M5-06: D17 "Play the interval, arpeggio or scale" (design §6, §9). In mic
// mode, a key the learner has spelled with D7 comes back as "play its scale
// on your guitar", heard through the fake mic. Without mic mode it never does.

const SKILL = 'C4.sharp-keys';
/** G is older, so less retrievable, so served first. */
const DUE = ['spell-key:G', 'spell-key:D'];
const G3 = 55;
const D3 = 50;
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];

/** Due cards for the keys, last spelled with D7, so the picker turns to D17 next. */
async function seedSpelledKeys(page: Page): Promise<void> {
  await page.evaluate(
    async ({ items, skillId }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'reviewLogs'], 'readwrite');
      const now = Date.now();
      items.forEach((itemId, i) => {
        const last = new Date(now - (30 - 7 * i) * DAY);
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
          uid: crypto.randomUUID(),
        });
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { items: DUE, skillId: SKILL },
  );
}

async function openSession(page: Page, mic: boolean): Promise<void> {
  await useFakeMic(page);
  await freshStart(page);
  await seedSpelledKeys(page);
  if (mic) await enableMicMode(page);
  await focusSession(page, SKILL);
}

const prompt = (page: Page) => page.getByTestId('d17-prompt');
const slots = (page: Page) => page.getByTestId('d17-slots').getByRole('listitem');

test.describe('M5-06 D17 play the sequence', () => {
  test('plays a key as its scale, heard note by note @smoke', async ({ page }) => {
    await openSession(page, true);
    await expect(page.locator('[data-drill="play-sequence"]')).toBeVisible();
    await expect(prompt(page)).toHaveText('Play the G major scale, one octave up from G.');
    await expect(slots(page)).toHaveCount(8);
    await expectNoHorizontalOverflow(page);

    await startListening(page);
    await playNotes(page, [G3, G3 + 2]);
    await expect(slots(page).nth(1)).toHaveAttribute('aria-label', 'Note 2 of 8: heard A');
    await expect(page.getByTestId('d17-listening')).toHaveText('Heard A: 2 of 8.');

    await playNotes(
      page,
      MAJOR.slice(2).map((o) => G3 + o),
    );
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ G A B C D E F♯ G');
    await expect(page.getByTestId('d17-explain')).toHaveText('You played G A B C D E F♯ G.');
  });

  test('ends at a wrong note, explains it and shows one fingering', async ({ page }) => {
    await openSession(page, true);
    await startListening(page);
    await playNotes(
      page,
      MAJOR.map((o) => G3 + o),
    );
    await expect(page.getByTestId('feedback-correct')).toBeVisible();

    // The mic keeps listening into the next prompt, which auto-advances.
    await expect(prompt(page)).toHaveText('Play the D major scale, one octave up from D.');
    await expect(page.getByTestId('d17-listening')).toHaveText('Listening…');
    await playNotes(page, [D3, D3 + 2, D3 + 3]);
    await expect(page.getByTestId('feedback-wrong')).toContainText('D E F♯ G A B C♯ D');
    await expect(page.getByTestId('d17-explain')).toHaveText(
      'You played F. After E comes F♯. It goes D E F♯ G A B C♯ D.',
    );
    await expect(slots(page).nth(2)).toHaveAttribute('data-state', 'wrong');
    // Feedback draws the fingering on the neck: the root and seven more notes.
    const neck = page.getByRole('group', { name: /^Fretboard/ });
    await expect(neck.getByTestId('marker-root')).toHaveCount(1);
    await expect(neck.getByTestId('marker-correct')).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
  });

  test('explains a refused mic, and "Show me" moves on without one', async ({ page }) => {
    await openSession(page, true);
    await failNextMicStart(page, 'denied');
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.getByRole('alert')).toContainText("FretFree can't use the mic.");
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await page.getByRole('button', { name: 'Show me' }).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('G A B C D E F♯ G');
    await expect(page.getByTestId('d17-explain')).toHaveText(
      "It goes G A B C D E F♯ G. Play it along once you've heard it.",
    );
  });

  test('never serves the mic drill without mic mode', async ({ page }) => {
    await openSession(page, false);
    await expect(page.locator('[data-drill="spell-it"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start listening' })).toHaveCount(0);
  });
});
