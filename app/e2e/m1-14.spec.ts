import { expect, test, type Page } from '@playwright/test';
import {
  F1_SKILLS,
  answer,
  expectNoHorizontalOverflow,
  freshStart,
  masterSkills,
  targetNote,
} from './helpers';

const DAY = 86_400_000;

interface SeedCard {
  itemId: string;
  stabilityDays: number;
  /** Correct answers to log for the card, in ms. */
  answersMs?: number[];
}

/**
 * Write reviewed FSRS cards and their answers straight into IndexedDB, as if
 * sessions had produced them, then reload so Progress reads them.
 */
async function seed(page: Page, cards: SeedCard[]): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await page.evaluate(
    async ({ cards, DAY }) => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('fretwork');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      let db = await open();
      while (!db.objectStoreNames.contains('cards')) {
        db.close();
        await new Promise((r) => setTimeout(r, 100));
        db = await open();
      }
      const now = Date.now();
      const tx = db.transaction(['cards', 'reviewLogs'], 'readwrite');
      for (const c of cards) {
        tx.objectStore('cards').put({
          itemId: c.itemId,
          skillId: 'F2.string5-naturals',
          fsrs: {
            due: new Date(now + c.stabilityDays * DAY),
            stability: c.stabilityDays,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: c.stabilityDays,
            learning_steps: 0,
            reps: 3,
            lapses: 0,
            state: 2, // State.Review
            last_review: new Date(now),
          },
          createdAt: new Date(now - DAY),
          lastReviewedAt: new Date(now),
        });
        (c.answersMs ?? []).forEach((ms, i) =>
          tx.objectStore('reviewLogs').add({
            itemId: c.itemId,
            skillId: 'F2.string5-naturals',
            drillType: 'name-the-note',
            correct: true,
            responseMs: ms,
            rating: 3,
            hintUsed: false,
            answerGiven: '?',
            at: new Date(now - (i + 1) * 60_000),
          }),
        );
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { cards, DAY },
  );
  await page.reload();
}

async function openProgress(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Progress' })
    .click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
}

const map = (page: Page) => page.getByRole('region', { name: 'Mastery map' });
const tile = (page: Page, cell: string) =>
  map(page).locator(`[data-testid="heat-tile"][data-cell="${cell}"]`);

test.describe('M1-14 Progress fretboard heatmap', () => {
  test('shows per-cell mastery, a legend, cell stats and a retention forecast', async ({
    page,
  }) => {
    await freshStart(page);
    await seed(page, [
      { itemId: 'note@s5f7', stabilityDays: 30, answersMs: [900, 1100, 1000] },
      // Slow: a 4s median is over the default 2.7s target.
      { itemId: 'note@s6f3', stabilityDays: 3, answersMs: [4000, 4200, 3900] },
      // Name → position: covers both A cells on string 5 (frets 0 and 12).
      { itemId: 'find:A@s5', stabilityDays: 0.5 },
    ]);
    await openProgress(page);

    const panels = page.locator('[data-progress-panel]');
    await expect(panels.first()).toHaveAttribute('data-progress-panel', 'heatmap');

    // The whole neck: 15 frets on regular-wide, 12 below it.
    const neck = map(page).getByRole('group', { name: 'Fretboard mastery map' });
    await expect(neck).toBeVisible();
    const wide = page.viewportSize()!.width >= 1024;
    await expect(neck).toHaveAttribute('data-fret-to', wide ? '15' : '12');
    await expect(neck.getByRole('button')).toHaveCount(6 * (wide ? 16 : 13));

    // Colour = stability band; slow is a separate, non-colour cue.
    await expect(map(page).getByTestId('heat-tile')).toHaveCount(4);
    await expect(tile(page, 's5f7')).toHaveAttribute('data-band', '3');
    await expect(tile(page, 's5f7')).toHaveAttribute('data-slow', 'false');
    await expect(tile(page, 's6f3')).toHaveAttribute('data-band', '1');
    await expect(tile(page, 's6f3')).toHaveAttribute('data-slow', 'true');
    await expect(tile(page, 's5f0')).toHaveAttribute('data-band', '0');
    await expect(tile(page, 's5f12')).toHaveAttribute('data-band', '0');
    const fills = await map(page)
      .getByTestId('heat-tile')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
    expect(new Set(fills).size).toBe(3);

    const legend = map(page).getByTestId('heatmap-legend');
    await expect(
      legend.getByRole('list', { name: /memory stability/i }).getByRole('listitem'),
    ).toHaveCount(5);
    await expect(legend).toContainText('Not practised yet');
    await expect(legend).toContainText('slow');

    // Tapping a cell shows its stats.
    const detail = map(page).getByTestId('heat-cell-detail');
    await expect(detail).toContainText('Tap a cell');
    const cell = neck.getByRole('button', { name: 'string 5, fret 7, E: stable for 30 days' });
    const box = (await cell.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await cell.click();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await expect(detail.getByRole('heading')).toHaveText('String 5, fret 7 · E');
    await expect(detail.getByTestId('heat-stability')).toHaveText('30 days');
    await expect(detail.getByTestId('heat-median')).toHaveText('1.0s');
    await expect(detail.getByTestId('heat-answers')).toHaveText('3 of 3 right');

    await neck.getByRole('button', { name: /^string 6, fret 3, G: .*slow$/ }).click();
    await expect(detail.getByTestId('heat-median')).toHaveText('4.0s (target 2.7s)');

    // Retention forecasts from FSRS retrievability, per string.
    const forecast = map(page).getByTestId('retention-forecast');
    await expect(forecast.getByTestId('forecast-string-5')).toHaveText(
      /^You'll remember ~\d+% of string 5 next week\. \(2 facts practised\)$/,
    );
    await expect(forecast.getByTestId('forecast-string-6')).toContainText('of string 6 next week');
    await expect(forecast.getByTestId('forecast-string-1')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('answering in a session fills in that cell', async ({ page }) => {
    await freshStart(page);
    // Skip the F1 note-wheel frontier so the session reaches the D1 neck drill.
    await masterSkills(page, F1_SKILLS);
    await openProgress(page);
    await expect(map(page).getByTestId('heatmap-panel')).toHaveAttribute('data-loaded', 'true');
    await expect(map(page).getByTestId('heat-tile')).toHaveCount(0);
    await expect(map(page).getByTestId('retention-forecast')).toContainText('Practise a session');

    await page.goto('/session');
    const marker = page.getByTestId('marker-target');
    await expect(marker).toBeVisible();
    const cell = `s${await marker.getAttribute('data-string')}f${await marker.getAttribute('data-fret')}`;
    await answer(page, await targetNote(page));
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await page.getByRole('button', { name: 'End session' }).click();
    await page.getByRole('link', { name: 'Done' }).click();

    await openProgress(page);
    await expect(tile(page, cell)).toBeVisible();
    await expect(map(page).getByTestId('retention-forecast')).toContainText('next week');
  });

  test('a phone shows the map, scrolls the neck, and taps a cell @smoke', async ({ page }) => {
    await freshStart(page);
    await seed(page, [{ itemId: 'note@s5f3', stabilityDays: 10, answersMs: [1200] }]);
    await openProgress(page);

    const neck = map(page).getByRole('group', { name: 'Fretboard mastery map' });
    await expect(neck).toBeVisible();
    await expect(tile(page, 's5f3')).toHaveAttribute('data-band', '2');
    const cell = neck.getByRole('button', { name: /^string 5, fret 3, C: stable for 10 days$/ });
    await cell.scrollIntoViewIfNeeded();
    const box = (await cell.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await cell.click();
    await expect(map(page).getByTestId('heat-cell-detail')).toContainText('String 5, fret 3 · C');
    await expect(map(page).getByTestId('forecast-string-5')).toContainText('of string 5 next week');
    await expectNoHorizontalOverflow(page);
  });
});
