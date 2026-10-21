import { expect, test, type Page } from '@playwright/test';
import { F1_SKILLS, expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import {
  C3_SKILLS,
  KNOWN_THIRDS_NAMES,
  SKILLS_BEFORE_C3,
  seedIntervals,
  startIntervalSession,
} from './helpers/intervals';
import { C4_SKILLS } from './helpers/keys';
import { enableMicMode, failNextMicStart, fakeMicReady, useFakeMic } from './helpers/mic';
import { seedDueItems } from './helpers/octaves';

// M10-08: one vocabulary in the drills. D2, D4 and D16 spell notes with ♯/♭;
// D6 and D7 write ♭3/♭7; D7 says what W and H mean; D4 says which way its
// shapes go and how a tap-every round ends; D16 and D17 share their mic copy.

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cell = (page: Page, string: number, fret: number) =>
  neck(page).locator(`[data-cell="s${string}f${fret}"]`);
const drillArea = (page: Page) => page.locator('[data-drill]');
const panel = (page: Page) => page.getByTestId('context-panel');

/** A session on one item, the way "Quiz me on this" focuses one. */
async function focusItem(page: Page, itemId: string): Promise<void> {
  await page.goto(`/session?${new URLSearchParams({ item: itemId }).toString()}`);
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
  await expect(drillArea(page)).toHaveAttribute('data-drill', /./);
}

/** The shared mic lines (D17's wording), from an independent copy. */
const MIC_IDLE =
  'Play it on your guitar. FretFree listens through the mic; nothing is recorded or sent.';
const MIC_DENIED =
  "FretFree can't use the mic. Allow the microphone for this site in your browser's settings, then try again.";

test.describe('M10-08 ♯ and ♭ in the first drills', () => {
  test('D2 names F♯ in its prompt, feedback and markers @smoke', async ({ page }) => {
    await freshStart(page);
    await seedDueItems(page, [{ itemId: 'find:F#@s6', skillId: 'C2.all-notes' }], 1);
    await focusItem(page, 'find:F#@s6');
    await expect(drillArea(page)).toHaveAttribute('data-drill', 'find-the-note');
    await expect(page.getByTestId('d2-prompt')).toHaveText('Find F♯ on string 6');

    await cell(page, 6, 3).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('That was F♯.');
    await expect(page.getByTestId('d2-explain')).toContainText(
      'You tapped G (string 6, fret 3). F♯ is at fret',
    );
    await expect(neck(page).getByTestId('marker-correct').first()).toHaveText('F♯');
    await expect(page.getByTestId('session')).not.toContainText('#');
    await expectNoHorizontalOverflow(page);
  });

  test('D4 spells F♯, says how a round ends, and which way a shape goes', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedDueItems(page, [{ itemId: 'octaves:F#', skillId: 'C1.every-octave' }], 2);
    await focusItem(page, 'octaves:F#');
    await expect(drillArea(page)).toHaveAttribute('data-drill', 'octave-finder');
    await expect(page.getByTestId('d4-prompt')).toContainText('Tap every F♯');
    await expect(page.getByTestId('d4-rule')).toHaveText(
      "Tap the notes in any order. A wrong tap ends the round; tap Done if you can't find the rest.",
    );
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // A♯ on string 5 is not an F♯: the round ends there.
    await cell(page, 5, 1).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('That was F♯.');
    await expect(page.getByTestId('d4-explain')).toContainText('You tapped A♯ (string 5, fret 1).');
    await expect(page.getByTestId('d4-rule')).toHaveCount(0);

    await freshStart(page);
    await seedDueItems(page, [{ itemId: 'octave:s6f2→s4', skillId: 'C1.octaves' }], 1);
    await focusItem(page, 'octave:s6f2→s4');
    await expect(page.getByTestId('d4-prompt')).toHaveText('Tap the octave of F♯ on string 4');
    // One fret too far: the G–B shift where there is none.
    await cell(page, 4, 5).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText(
      'That was 2 strings up (toward string 1), 2 frets higher.',
    );
    await expect(page.getByTestId('d4-explain')).toContainText('You tapped G (string 4, fret 5).');
  });
});

test.describe('M10-08 ♭3 and ♭7, and whole and half steps', () => {
  test('D6 labels the minor 3rd ♭3, says "flat 3", and names it in full', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedIntervals(page, { mastered: SKILLS_BEFORE_C3, cards: KNOWN_THIRDS_NAMES });
    await startIntervalSession(page, ['C3.thirds']);
    await expect(page.getByTestId('d6-prompt')).toContainText(
      'This is the minor 3rd above the root',
    );
    const target = neck(page).getByTestId('marker-target');
    await expect(target).toHaveText('♭3');
    await expect(target).toHaveAccessibleName('flat 3');
    const cell = {
      string: Number(await target.getAttribute('data-string')),
      fret: Number(await target.getAttribute('data-fret')),
    };
    await neck(page).locator(`[data-cell="s${cell.string}f${cell.fret}"]`).click();
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ a minor 3rd (m3)');
  });

  test('D7 spells out W and H for a key', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, F1_SKILLS);
    await focusSession(page, 'C4.sharp-keys');
    await expect(page.locator('#drill-prompt')).toContainText(
      'uses each letter once, going up in whole and half steps (W W H W W W H):',
    );
    await expect(panel(page)).toContainText(
      'Steps: W W H W W W H (W = whole step, 2 frets; H = half step, 1).',
    );
    await expectNoHorizontalOverflow(page);
  });

  test('D7 writes chord formulas with ♭', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    // Chord construction is gated on mastered intervals and keys.
    await masterSkills(page, [...SKILLS_BEFORE_C3, ...C3_SKILLS, ...C4_SKILLS, 'C5.triads']);
    await focusSession(page, 'C5.sevenths');
    await expect(page.getByTestId('d7-drill')).toBeVisible();
    await expect(panel(page)).toContainText(/[A-G][♯♭]?(7|maj7|m7|m7♭5) = 1 ♭?3 ♭?5 ♭?7/);
    await expect(panel(page)).not.toContainText(/\bb\d/);
    await expect(page.getByTestId('d7-drill')).not.toContainText(/\bb\d/);
  });
});

test.describe('M10-08 one mic voice', () => {
  test('D16 says what D17 says about the mic', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await useFakeMic(page);
    await freshStart(page);
    await enableMicMode(page);
    await focusItem(page, 'find:A@s6');
    // D2 serves a find item before D16 does (the picker varies the drill).
    for (let i = 0; i < 6; i += 1) {
      if ((await drillArea(page).getAttribute('data-drill')) === 'play-the-note') break;
      await cell(page, 6, 5).click();
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    await expect(drillArea(page)).toHaveAttribute('data-drill', 'play-the-note');
    await expect(page.getByTestId('d16-mic')).toContainText(MIC_IDLE);

    await fakeMicReady(page);
    await failNextMicStart(page, 'denied');
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.getByRole('alert')).toHaveText(MIC_DENIED);
  });

  test('D17 names its give-up button', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await useFakeMic(page);
    await freshStart(page);
    await seedSpelledKey(page, 'spell-key:G', 'C4.sharp-keys');
    await enableMicMode(page);
    await focusSession(page, 'C4.sharp-keys');
    await expect(drillArea(page)).toHaveAttribute('data-drill', 'play-sequence');
    await expect(page.locator('[data-drill]')).toContainText(MIC_IDLE);
    await expect(page.getByRole('button', { name: 'Show me the answer' })).toBeVisible();

    await failNextMicStart(page, 'denied');
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.getByRole('alert')).toHaveText(MIC_DENIED);
  });
});

/** A due key last spelled with D7, so the picker turns to D17 next. */
async function seedSpelledKey(page: Page, itemId: string, skillId: string): Promise<void> {
  await page.evaluate(
    async ({ itemId, skillId }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'reviewLogs'], 'readwrite');
      const now = Date.now();
      const last = new Date(now - 30 * DAY);
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
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { itemId, skillId },
  );
}
