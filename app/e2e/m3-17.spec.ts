import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M3-17: D8's chord tones in stages (user request, 2026-10-18: "find the
// root first, then the 3rd, 5th and 7th"). Each stage opens once the one
// before is mastered (research/02 rule 7), and the root stage on the notes
// of strings 6 and 5 and spelling triads.

/** Rule 7: natural notes on strings 6 and 5, and spelling triads (C5). */
const PREREQS = ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads'];
const STAGES = ['C5.tones-roots', 'C5.tones-thirds', 'C5.tones-fifths'];

const drill = (page: Page) => page.getByTestId('d8-drill');
const promptText = (page: Page) => page.getByTestId('d8-prompt');

/** The skill of every answer logged so far, in order. */
async function answeredSkills(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ skillId: string; at: Date }[]>((resolve) => {
      const req = db.transaction('reviewLogs').objectStore('reviewLogs').getAll();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return rows.sort((a, b) => a.at.getTime() - b.at.getTime()).map((r) => r.skillId);
  });
}

/**
 * Answer the prompt on screen, right or wrong: tap a marked target if the
 * worked example shows one, else any cell; name it the root. Which stage
 * served it is read from the review log, not from the answer.
 */
async function answer(page: Page): Promise<void> {
  if ((await drill(page).getAttribute('data-mode')) === 'tap') {
    const target = page.getByTestId('marker-target');
    const cell =
      (await target.count()) > 0
        ? target.first()
        : page.locator('svg[data-fret-from] [data-cell]').first();
    await cell.click();
  } else {
    await drill(page).getByRole('button', { name: 'root', exact: true }).click();
  }
  const correct = page.getByTestId('feedback-correct');
  const wrong = page.getByTestId('feedback-wrong');
  await expect(correct.or(wrong)).toBeVisible();
  if (await wrong.isVisible()) await page.getByRole('button', { name: 'Continue' }).click();
  else await expect(correct).toBeHidden();
}

/** Answer `count` prompts of a focused session on the stages. */
async function practise(page: Page, count: number): Promise<string[]> {
  await focusSession(page, STAGES);
  for (let i = 0; i < count; i++) {
    await expect(drill(page)).toBeVisible();
    await answer(page);
  }
  return answeredSkills(page);
}

/** File the root stage as practising, as a learner part-way through it. */
async function practisingRoots(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('skillStates', 'readwrite');
      tx.objectStore('skillStates').put({
        skillId: 'C5.tones-roots',
        status: 'practising',
        guideLevel: 3,
        rollingAccuracy: 0.8,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

async function statusOf(page: Page, skillId: string): Promise<string | null> {
  await page.goto('/learn?module=chords');
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
  return page.getByTestId(`skill-${skillId}`).getAttribute('data-status');
}

test.describe('M3-17 chord tones in stages', () => {
  test('a fresh learner finds the root first @smoke', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, PREREQS);
    expect(await statusOf(page, 'C5.tones-roots')).toBe('unlocked');
    expect(await statusOf(page, 'C5.tones-thirds')).toBe('locked');

    await focusSession(page, STAGES);
    // The first prompt is the root, as a worked example.
    await expect(promptText(page)).toContainText(/the root of/i);
    await expect(page.getByTestId('marker-target').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const skills = await practise(page, 6);
    expect(skills).toHaveLength(6);
    expect(new Set(skills)).toEqual(new Set(['C5.tones-roots']));
  });

  test('3rds open once the root stage is mastered, 5ths after them', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, PREREQS);
    // Practising the roots isn't enough: rule 7 gates on mastery.
    await practisingRoots(page);
    expect(await statusOf(page, 'C5.tones-thirds')).toBe('locked');
    expect(new Set(await practise(page, 4))).toEqual(new Set(['C5.tones-roots']));

    await masterSkills(page, ['C5.tones-roots']);
    expect(await statusOf(page, 'C5.tones-thirds')).toBe('unlocked');
    expect(await statusOf(page, 'C5.tones-fifths')).toBe('locked');
    const after = (await practise(page, 4)).slice(4);
    expect(after).toContain('C5.tones-thirds');
    expect(after).not.toContain('C5.tones-fifths');
  });
});
