import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M2-05: D5 "Name the interval from two dots". A choice drill whose
// distractors scale with the scope level, and whose context panel carries an
// interval legend that fades with the guide level.

// An independent answer key (deliberately not imported from app code).
const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const NAMES = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];

/** C3.thirds' shapes: m3 and M3 between neighbouring strings (wider spans overstretch). */
const THIRDS = [6, 5, 4, 3, 2].flatMap((from) =>
  ['m3', 'M3'].map((interval) => `${interval}@s${from}→s${from - 1}`),
);

/** Every skill but C3.thirds, so a session works on that one skill only. */
const OTHER_SKILLS = [
  'F1.alphabet',
  'F1.b-c-e-f',
  'F1.half-steps',
  'F1.whole-steps',
  'F2.string6-naturals',
  'F2.string5-naturals',
  'C2.all-notes',
  'F3.markers',
  'F3.repeat-12',
  'C1.octaves',
  'C1.octaves-gb-shift',
  'C1.double-octaves',
  'C3.fourths-fifths',
  'C3.sevenths',
  'C3.sixths',
  'C3.seconds',
];

interface Seed {
  /** Seed the interval-name cards as due reviews at this guide level; omit for new items. */
  reviewsAtLevel?: 0 | 1 | 2 | 3;
}

/**
 * Master every other skill, and file the tap direction (`interval:`, D6) as
 * known and far from due, so the session is D5 prompts only. Reloads.
 */
async function seedThirds(page: Page, seed: Seed = {}): Promise<void> {
  await page.evaluate(
    async ({ others, shapes, level }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
      const now = Date.now();
      const card = (itemId: string, due: number, stability: number) => ({
        itemId,
        skillId: 'C3.thirds',
        fsrs: {
          due: new Date(due),
          stability,
          difficulty: 5,
          elapsed_days: 0,
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
      const cards = tx.objectStore('cards');
      for (const s of shapes) {
        cards.put(card(`interval:${s}`, now + 30 * DAY, 60));
        if (level !== null) cards.put(card(`interval-name:${s}`, now - DAY, 3));
      }
      const states = tx.objectStore('skillStates');
      for (const skillId of others) {
        states.put({ skillId, status: 'mastered', guideLevel: 0, rollingAccuracy: 1 });
      }
      if (level !== null) {
        states.put({
          skillId: 'C3.thirds',
          status: 'practising',
          guideLevel: level,
          rollingAccuracy: 0.8,
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { others: OTHER_SKILLS, shapes: THIRDS, level: seed.reviewsAtLevel ?? null },
  );
  await page.reload();
}

const promptText = (page: Page) => page.locator('#drill-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const choices = (page: Page) => page.getByRole('group', { name: /interval|continue/i });
const legend = (page: Page) => page.getByTestId('interval-legend');

async function cellOf(page: Page, testId: string): Promise<{ string: number; fret: number }> {
  const m = neck(page).getByTestId(testId);
  await expect(m).toBeVisible();
  return {
    string: Number(await m.getAttribute('data-string')),
    fret: Number(await m.getAttribute('data-fret')),
  };
}

/** The interval between the two dots, from the lower (root) to the upper note. */
async function solve(page: Page): Promise<string> {
  const text = (await promptText(page).innerText()).trim();
  const guided = /Tap (\S+) to continue/.exec(text);
  if (guided) return guided[1]!;
  expect(text).toBe('Name the interval');
  const root = await cellOf(page, 'marker-root');
  const upper = await cellOf(page, 'marker-target');
  const semis = OPEN_MIDI[upper.string]! + upper.fret - (OPEN_MIDI[root.string]! + root.fret);
  expect(semis).toBeGreaterThan(0);
  return NAMES[semis]!;
}

async function choose(page: Page, name: string): Promise<void> {
  await choices(page).getByRole('button', { name, exact: true }).click();
}

/**
 * Open the session directly: the seeded masteries unlock achievements, and
 * Today's toast for them can cover the start button. The session screen is
 * full screen, outside the shell that shows it.
 */
async function startSession(page: Page): Promise<void> {
  await page.goto('/session');
  await expect(page.getByTestId('d5-drill')).toBeVisible();
}

test.describe('M2-05 D5 names the interval from two dots', () => {
  test('a fresh C3 session: worked examples, then recall by button @smoke', async ({ page }) => {
    await freshStart(page);
    await seedThirds(page);
    await startSession(page);

    // The first rep of a new item is a worked example that names the interval.
    await expect(promptText(page)).toContainText(/^This is a (minor|major) 3rd/);

    let recalled = 0;
    for (let i = 0; i < 12 && recalled < 2; i++) {
      await expect(page.getByTestId('d5-drill')).toBeVisible();
      const answer = await solve(page);
      if ((await promptText(page).innerText()).trim() === 'Name the interval') recalled++;
      await choose(page, answer);
      await expect(page.getByTestId('feedback-correct')).toHaveText(`✓ ${answer}`);
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
    expect(recalled).toBe(2);
    await expectNoHorizontalOverflow(page);
  });

  test('recall prompts: neighbour distractors, wrong-answer feedback', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedThirds(page, { reviewsAtLevel: 2 });
    await startSession(page);

    // The lowest scope level: four consecutive intervals around the answer.
    const expected = await solve(page);
    const buttons = await choices(page).getByRole('button').allTextContents();
    expect(buttons).toHaveLength(4);
    expect(buttons).toContain(expected);
    const idx = buttons.map((b) => NAMES.indexOf(b));
    expect(idx).toEqual(idx.map((_, k) => idx[0]! + k));

    // While a prompt is open, the upper dot is never labelled.
    await expect(neck(page).getByTestId('marker-target')).toHaveText('');

    // Pick the neighbour a half step away: it sits one fret off the answer.
    const upper = await cellOf(page, 'marker-target');
    const up = NAMES[NAMES.indexOf(expected) + 1]!;
    const wrong = buttons.includes(up) ? up : NAMES[NAMES.indexOf(expected) - 1]!;
    await choose(page, wrong);
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${expected}`);
    await expect(neck(page).getByTestId('marker-correct')).toHaveText(expected);
    const miss = neck(page).getByTestId('marker-wrong');
    await expect(miss).toHaveText(wrong);
    await expect(miss).toHaveAttribute('data-string', String(upper.string));
    await expect(miss).toHaveAttribute('data-fret', String(upper.fret + (wrong === up ? 1 : -1)));
    await expect(legend(page).locator(`[data-interval="${expected}"]`)).toHaveAttribute(
      'data-state',
      'expected',
    );
    await expect(legend(page).locator(`[data-interval="${wrong}"]`)).toHaveAttribute(
      'data-state',
      'wrong',
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();

    // The next prompt is still D5, and a right answer is accepted.
    const next = await solve(page);
    await choose(page, next);
    await expect(page.getByTestId('feedback-correct')).toHaveText(`✓ ${next}`);
  });

  test('the interval legend fades with the guide level', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);

    // Level 2: names and half-step counts, no tips.
    await seedThirds(page, { reviewsAtLevel: 2 });
    await startSession(page);
    const panel = page.getByTestId('context-panel');
    await expect(panel.getByRole('heading', { name: 'Intervals' })).toBeVisible();
    await expect(legend(page).locator('li')).toHaveCount(4);
    await expect(legend(page)).toContainText('half steps');
    await expect(panel).not.toContainText('from G to B');

    // "Hide help" removes the panel, and "Show help" brings it back.
    await page.getByRole('button', { name: 'Hide help' }).click();
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Show help' }).click();
    await expect(legend(page)).toBeVisible();

    // Level 3: the tips for reading shapes across strings, the G–B shift included.
    await freshStart(page);
    await seedThirds(page, { reviewsAtLevel: 3 });
    await startSession(page);
    await expect(panel).toContainText('from G to B');

    // Level 1: the names only.
    await freshStart(page);
    await seedThirds(page, { reviewsAtLevel: 1 });
    await startSession(page);
    await expect(legend(page).locator('li')).toHaveCount(4);
    await expect(legend(page)).not.toContainText('half step');

    // Level 0: no context panel at all.
    await freshStart(page);
    await seedThirds(page, { reviewsAtLevel: 0 });
    await startSession(page);
    await expect(promptText(page)).toHaveText('Name the interval');
    await expect(panel).toHaveCount(0);
  });
});
