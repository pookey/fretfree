import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { startChordTones } from './helpers/chord-tones';
import { focusSession } from './helpers/focus';

/** What every multi-target round says under its prompt (D9, D37, the pentatonic box). */
const ROUND_RULE =
  "Tap the notes in any order. A wrong tap ends the round; tap Done if you can't find the rest.";
/** A worked example draws every target, so its rule leaves Done out (rule 8). */
const GUIDED_RULE = 'Tap the notes in any order. A wrong tap ends the round.';

/**
 * Seed known cards, due now, with their skills mastered at guide level 1 (so
 * no new items or worked examples join), then focus a session on them.
 */
async function startKnown(page: Page, items: readonly { itemId: string; skillId: string }[]) {
  await page.evaluate(async (items) => {
    const DAY = 86_400_000;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
    const now = Date.now();
    for (const { itemId, skillId } of items) {
      tx.objectStore('cards').put({
        itemId,
        skillId,
        fsrs: {
          due: new Date(now - DAY),
          stability: 3,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: 3,
          learning_steps: 0,
          reps: 3,
          lapses: 0,
          state: 2,
          last_review: new Date(now - 4 * DAY),
        },
        createdAt: new Date(now - 6 * DAY),
        lastReviewedAt: new Date(now - 4 * DAY),
      });
    }
    for (const skillId of new Set(items.map((i) => i.skillId))) {
      tx.objectStore('skillStates').put({
        skillId,
        status: 'mastered',
        guideLevel: 1,
        rollingAccuracy: 1,
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, items);
  await focusSession(page, [...new Set(items.map((i) => i.skillId))]);
}

const prompt = (page: Page) => page.locator('#drill-prompt');

test.describe('M10-11 the later drills say what they mean', () => {
  test('D40 glosses its terms in the question @smoke', async ({ page }) => {
    await freshStart(page);
    await startKnown(page, [{ itemId: 'relative-minor:Eb', skillId: 'I3.relative-minors' }]);
    await expect(page.getByTestId('d40-subject')).toHaveText('E♭ major');
    await expect(prompt(page)).toHaveText(
      'Which minor key shares its key signature (its relative minor)?',
    );
    await expectNoHorizontalOverflow(page);
  });

  for (const [itemId, skillId, question] of [
    ['dominant:Eb', 'I3.dominants', 'Which key is its V, a 5th up?'],
    ['signature-key:3b', 'I3.flat-signatures', 'Which major key has this key signature?'],
  ] as const) {
    test(`D40 asks "${question}"`, async ({ page }) => {
      await freshStart(page);
      await startKnown(page, [{ itemId, skillId }]);
      await expect(prompt(page)).toHaveText(question);
    });
  }

  test('D36 asks for the root, then the chord type', async ({ page }) => {
    await freshStart(page);
    await startKnown(page, [{ itemId: 'chord-name:E-shape@major', skillId: 'C5.name-triads' }]);
    const explain = page.getByTestId('d36-explain');
    await expect(explain).toHaveText('Tap its root (the lowest note), then its type.');
    const types = page.getByRole('group', { name: 'Chord type' });
    await expect(types.getByRole('button', { name: 'major', exact: true })).toBeDisabled();
    await page
      .getByRole('group', { name: 'Root' })
      .getByRole('button', { name: 'C', exact: true })
      .click();
    await expect(explain).toHaveText('Root C. Now tap the chord type.');
    await expect(types.getByRole('button', { name: 'major', exact: true })).toBeEnabled();
  });

  test('D38 says "one way to play", and its span rule reads as a sentence', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['C5.tones-fifths']);
    await focusSession(page, 'C5.build-triads');
    // The first card is a worked example (rule 8).
    await expect(prompt(page)).toHaveText(
      /^This is one way to play \S+ from this root\. Tap its notes, then Check\.$/,
    );
    await expect(page.getByTestId('build-chord-panel')).toContainText(
      'Fretted notes fit within 4 frets, using 4 fingers at most',
    );
  });

  test('D9 says how a round ends, even on a worked example', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads']);
    await focusSession(page, 'C6.triad-cores');
    // The first card is a worked example: one clear instruction, no Done clause.
    await expect(prompt(page)).toContainText('Tap each note to continue.');
    await expect(page.getByTestId('d9-explain')).toHaveText(
      new RegExp(`^The square is the root, \\S+, on string \\d\\. ${escape(GUIDED_RULE)}$`),
    );
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  });

  test('D37 says how a round ends alongside its other hints', async ({ page }) => {
    await freshStart(page);
    await startChordTones(page, ['chord-tones:C'], 2);
    await expect(page.getByTestId('d37-explain')).toHaveText(
      new RegExp(`^These frets hold the \\w shape of C major\\. ${escape(ROUND_RULE)}$`),
    );
  });

  test('the pentatonic box says how a round ends, even on a worked example', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['C6.minor-cores', 'C6.minor-shapes']);
    await focusSession(page, 'C7.minor-boxes');
    // The first card is a worked example: one clear instruction, no Done clause.
    await expect(prompt(page)).toContainText('Tap each note to continue.');
    await expect(page.getByTestId('dpb-explain')).toHaveText(
      new RegExp(`^The squares are the roots, \\S+\\. ${escape(GUIDED_RULE)}$`),
    );
    await expect(prompt(page)).toContainText('pentatonic box 1');
  });

  test('D13 hints with a straight apostrophe, like the rest of the drills', async ({ page }) => {
    await freshStart(page);
    await startKnown(page, [{ itemId: 'capo-fret:G', skillId: 'C10.capo-g-c-d' }]);
    await expect(page.getByTestId('d13-hint')).toHaveText(
      "Count half steps up from the shapes to the song's key.",
    );
  });
});

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
