import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import {
  AFTER,
  BEFORE,
  readWhichShape,
  shapeCells,
  whichShapeDrill,
  type Shape,
} from './helpers/which-shape';

// M3-06: D10 "Which shape, and which comes next?". A choice drill on C6's
// whole-shape cards: name the drawn CAGED shape, or the one after or before
// a named shape along the chain, at varied roots and positions (rule 12).
// Naming the C shape where the A shape is drawn is logged as that confusion.

/** Rule 7 and C6's own order: what the whole-shape skills stand on. */
const PREREQS = ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads', 'C6.triad-cores'];

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const choices = (page: Page) => whichShapeDrill(page).getByRole('button');

/**
 * A fixed Math.random, so the drill's draws (question, root, position) are
 * the same every run: the spec checks they vary without leaning on chance.
 */
async function seedRandom(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let a = 0x6d2b79f5;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
}

/**
 * File whole-shape cards as due reviews at guide level 1, each last served by
 * D9, so the picker hands them to D10 (it moves away from the last drill).
 * Reloads.
 */
async function seedShapeReviews(
  page: Page,
  cards: readonly { itemId: string; skillId: string }[],
): Promise<void> {
  await page.evaluate(
    async ({ cards, prereqs }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates', 'reviewLogs'], 'readwrite');
      const now = Date.now();
      for (const { itemId, skillId } of cards) {
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
          createdAt: new Date(now - 8 * DAY),
          lastReviewedAt: new Date(now - 4 * DAY),
        });
        tx.objectStore('reviewLogs').add({
          itemId,
          skillId,
          drillType: 'build-caged',
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
      for (const skillId of new Set(cards.map((c) => c.skillId))) {
        states.put({ skillId, status: 'practising', guideLevel: 1, rollingAccuracy: 0.85 });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { cards, prereqs: PREREQS },
  );
  await page.reload();
}

const MAJOR: readonly Shape[] = ['C', 'A', 'G', 'E', 'D'];

test.describe('M3-06 D10 names CAGED shapes and their neighbours', () => {
  test('names shapes and the next along the chain, in varied keys and positions @smoke', async ({
    page,
  }, info) => {
    await seedRandom(page);
    await freshStart(page);
    await seedShapeReviews(
      page,
      MAJOR.map((s) => ({ itemId: `caged:${s}-shape@major`, skillId: 'C6.major-shapes' })),
    );
    await focusSession(page, 'C6.major-shapes');

    // The narrowest scope: three shapes to choose from, in CAGED order.
    await expect(whichShapeDrill(page)).toBeVisible();
    await expect(choices(page)).toHaveCount(3);
    const phone = info.project.name === 'iphone-smoke';
    if (!phone) {
      const box = await choices(page).first().boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    const asks = new Set<string>();
    const places = new Set<string>();
    for (let i = 0; i < MAJOR.length; i++) {
      const task = await readWhichShape(page);
      expect(task.guided).toBe(false);
      asks.add(task.ask);
      const { roots, all } = await shapeCells(page);
      places.add(roots.map((r) => `s${r.string}f${r.fret}`).join(' '));

      // iPad landscape shows the whole neck (design §7); portrait a 12-fret
      // neck and a phone a window, each around the shape.
      const from = Number(await neck(page).getAttribute('data-fret-from'));
      const to = Number(await neck(page).getAttribute('data-fret-to'));
      if (info.project.name === 'ipad-portrait') expect(to - from).toBe(12);
      else if (!phone) expect([from, to]).toEqual([0, 15]);
      for (const c of all) {
        expect(c.fret).toBeGreaterThanOrEqual(from);
        expect(c.fret).toBeLessThanOrEqual(to);
      }

      // A hardware keyboard answers by letter on iPad; a tap elsewhere.
      if (phone || i % 2 === 0) {
        await page.getByRole('button', { name: `${task.answer} shape` }).click();
      } else {
        await page.keyboard.press(task.answer.toLowerCase());
      }
      await expect(page.getByTestId('feedback-correct')).toContainText(`the ${task.answer} shape`);
      if (i === 0) await expectNoHorizontalOverflow(page);
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    // Rule 12: the same cards met as different questions, roots and positions.
    expect(asks.size).toBeGreaterThanOrEqual(2);
    expect(places.size).toBeGreaterThanOrEqual(3);
  });

  test('naming the C shape where the A shape is drawn is a confusion', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await seedRandom(page);
    await freshStart(page);
    const skills = ['C6.major-shapes', 'C6.minor-shapes', 'C6.dominant7-shapes'];
    const qualities = ['major', 'minor', 'dominant7'];
    await seedShapeReviews(
      page,
      qualities.flatMap((q, i) =>
        (['C', 'A'] as const).map((s) => ({
          itemId: `caged:${s}-shape@${q}`,
          skillId: skills[i]!,
        })),
      ),
    );
    await focusSession(page, skills);

    let drawn: Shape | null = null;
    for (let i = 0; i < 6 && !drawn; i++) {
      await expect(whichShapeDrill(page)).toBeVisible();
      const ask = await whichShapeDrill(page).getAttribute('data-ask');
      if (ask === 'name') {
        // Only C and A cards are due, and both root on string 5: the C shape
        // reaches back toward the nut, the A shape up from the root.
        const { roots, all } = await shapeCells(page);
        const root = roots.find((r) => r.string === 5)!;
        drawn = all.some((c) => c.fret < root.fret) ? 'C' : 'A';
        break;
      }
      const text = await page.getByTestId('d10-prompt').innerText();
      const shown = /This is the ([CAGED]) shape/.exec(text)![1] as Shape;
      const answer = ask === 'next' ? AFTER[shown] : BEFORE[shown];
      await page.getByRole('button', { name: `${answer} shape` }).click();
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    expect(drawn).not.toBeNull();
    const other: Shape = drawn === 'C' ? 'A' : 'C';
    await page.getByRole('button', { name: `${other} shape` }).click();

    await expect(page.getByTestId('feedback-wrong')).toContainText(
      `That was the ${drawn} shape of`,
    );
    await expect(page.getByTestId('d10-explain')).toContainText(
      `You picked the ${other} shape. Both root on string 5`,
    );
    await expect(page.getByRole('button', { name: `${other} shape` })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    await expect(page.getByRole('button', { name: `${drawn} shape` })).toHaveAttribute(
      'data-state',
      'expected',
    );
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

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });
});
