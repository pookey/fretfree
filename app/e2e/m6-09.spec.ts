import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import {
  MAJOR_AT,
  answerVisualise,
  readVisualise,
  solveVisualise,
  visualiseDrill,
  type Shape,
} from './helpers/visualise';

// M6-09: D21 "Visualise it", mental practice (research/02 rule 14). The
// prompt names a CAGED shape and its position ("Picture the A shape at fret
// 5, then tap every root") and the neck stays blank: the learner pictures
// the shape and taps its roots. Tapping a root of the C shape for the A shape
// is logged as that confusion.

/** Rule 7 and C6's own order: what the whole-shape skills stand on. */
const PREREQS = ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads', 'C6.triad-cores'];

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: { string: number; fret: number }) =>
  neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`);
const shapeMarkers = (page: Page) => neck(page).locator('[data-testid^="marker-"]');

/** A fixed Math.random, so the positions drawn are the same every run. */
async function seedRandom(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let a = 0x2f6b7d39;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
}

/**
 * File major whole-shape cards as due reviews at guide level 1, each last
 * served by D10, so the picker hands them to D21 (the next in C6's list).
 * Reloads.
 */
async function seedShapeReviews(page: Page, shapes: readonly Shape[]): Promise<void> {
  await page.evaluate(
    async ({ shapes, prereqs }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates', 'reviewLogs'], 'readwrite');
      const now = Date.now();
      for (const shape of shapes) {
        const itemId = `caged:${shape}-shape@major`;
        tx.objectStore('cards').put({
          itemId,
          skillId: 'C6.major-shapes',
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
          createdAt: new Date(now - 8 * DAY),
          lastReviewedAt: new Date(now - 4 * DAY),
        });
        tx.objectStore('reviewLogs').add({
          itemId,
          skillId: 'C6.major-shapes',
          drillType: 'which-shape',
          correct: true,
          responseMs: 2000,
          rating: 3,
          hintUsed: false,
          answerGiven: '',
          at: new Date(now - 4 * DAY),
        });
      }
      const states = tx.objectStore('skillStates');
      for (const skillId of prereqs) {
        states.put({ skillId, status: 'mastered', guideLevel: 0, rollingAccuracy: 1 });
      }
      states.put({
        skillId: 'C6.major-shapes',
        status: 'practising',
        guideLevel: 1,
        rollingAccuracy: 0.85,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { shapes, prereqs: PREREQS },
  );
  await page.reload();
}

const MAJOR: readonly Shape[] = ['C', 'A', 'G', 'E', 'D'];

test.describe('M6-09 D21 pictures a CAGED shape and taps its roots', () => {
  test('pictures shapes at varied positions on a blank neck @smoke @layout', async ({
    page,
  }, info) => {
    await seedRandom(page);
    await freshStart(page);
    await seedShapeReviews(page, MAJOR);
    await focusSession(page, 'C6.major-shapes');
    const phone = info.project.name === 'iphone-smoke';

    const positions = new Set<number>();
    for (let i = 0; i < MAJOR.length; i++) {
      const task = await readVisualise(page);
      expect(task.guided).toBe(false);
      expect(task.degree).toBe('R');
      positions.add(task.position);

      // Recall (rule 4): nothing of the shape is drawn, the count hides its total.
      await expect(shapeMarkers(page)).toHaveCount(0);
      await expect(page.getByTestId('d21-count')).toHaveText('Found 0');

      // iPad landscape shows the whole neck (design §7); portrait a 12-fret
      // neck and a phone a window, each holding the shape.
      const from = Number(await neck(page).getAttribute('data-fret-from'));
      const to = Number(await neck(page).getAttribute('data-fret-to'));
      if (info.project.name === 'ipad-portrait') expect(to - from).toBe(12);
      else if (!phone) expect([from, to]).toEqual([0, 15]);
      const cells = solveVisualise(task);
      const lastFret =
        task.position + Math.max(...Object.values(MAJOR_AT[task.shape]).map(([f]) => f));
      expect(from).toBeLessThanOrEqual(task.position);
      expect(to).toBeGreaterThanOrEqual(lastFret);

      if (i === 0) {
        // The prompt's neck window (at least 7 frets on a phone) fits the
        // screen: neither the page nor the drill scrolls sideways (design §7).
        await expectNoHorizontalOverflow(page);
        const drillOverflow = await visualiseDrill(page).evaluate(
          (el) => el.scrollWidth - el.clientWidth,
        );
        expect(drillOverflow).toBeLessThanOrEqual(1);
      }
      if (i === 0 && !phone) {
        // Every cell is a comfortable target on iPad (design §7: ≥ 44pt).
        const box = await cellAt(page, cells[0]!).boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      // Each root turns green as it is found (M6-13).
      await cellAt(page, cells[0]!).click();
      await expect(neck(page).getByTestId('marker-correct')).toHaveCount(1);
      for (const c of cells.slice(1)) await cellAt(page, c).click();

      const correct = page.getByTestId('feedback-correct');
      await expect(correct).toContainText(`the ${task.shape} shape of`);
      // Feedback draws the whole pictured shape, by degree (sound, sight and name).
      await expect(shapeMarkers(page)).toHaveCount(Object.keys(MAJOR_AT[task.shape]).length);
      if (i === 0) await expectNoHorizontalOverflow(page);
      await expect(correct).toBeHidden();
    }
    // Rule 12: the same shapes met at different positions. How many depends
    // on the session's random draws, which differ by platform even with a
    // seeded Math.random; the spread itself is unit-tested (logic.test.ts,
    // "varies them (rule 12)").
    expect(positions.size, `positions: ${[...positions].join(', ')}`).toBeGreaterThanOrEqual(2);
  });

  test('tapping a root of the C shape for the A shape is that confusion', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await seedRandom(page);
    await freshStart(page);
    // Every shape is due, so no new one is introduced first; the C and A
    // cards are the seed pair, so they come side by side (rule 6).
    await seedShapeReviews(page, MAJOR);
    await focusSession(page, 'C6.major-shapes');

    let task = await readVisualise(page);
    for (let i = 0; i < MAJOR.length && task.shape !== 'A'; i++) {
      await answerVisualise(page);
      task = await readVisualise(page);
    }
    expect(task.shape).toBe('A');
    // The panel gives the method, not the answer (guide level 1).
    const panel = visualiseDrill(page).getByRole('complementary');
    await expect(panel.getByRole('heading', { name: 'Picture it' })).toBeVisible();
    await expect(panel.getByRole('img')).toHaveCount(0);

    // The C shape at the same fret roots on string 2 one fret up; the A shape
    // has its 3rd there one fret further.
    const [low] = solveVisualise(task);
    await cellAt(page, low!).click();
    await cellAt(page, { string: 2, fret: task.position + 1 }).click();

    await expect(page.getByTestId('feedback-wrong')).toContainText(`the A shape of`);
    const explain = page.getByTestId('d21-explain');
    await expect(explain).toContainText(
      `That's a root of the C shape ${task.position === 0 ? 'in open position' : `at fret ${task.position}`}.`,
    );
    await expect(neck(page).getByTestId('marker-wrong')).toHaveCount(1);
    // The missed root at full strength, a ringed root square (M6-13).
    await expect(neck(page).locator('[data-testid="marker-root"][data-emphasis]')).toHaveCount(1);
    await expectNoHorizontalOverflow(page);

    const confusions = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const rows = await new Promise<{ a: string; b: string }[]>((resolve) => {
        const req = db.transaction('confusions').objectStore('confusions').getAll();
        req.onsuccess = () => resolve(req.result);
      });
      db.close();
      return rows.map((r) => [r.a, r.b].sort());
    });
    expect(confusions).toEqual([['caged:A', 'caged:C']]);
    await expect(visualiseDrill(page)).toHaveAttribute('data-ask', 'root');
  });
});
