import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { TARGET_MARKERS } from './helpers/targets';

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
    // The target marker pulses, so tap the cell under it.
    const target = page.locator(TARGET_MARKERS).first();
    const cells = page.locator('svg[data-fret-from] [data-cell]');
    const cell =
      (await target.count()) > 0
        ? cells.and(
            page.locator(
              `[data-cell="s${await target.getAttribute('data-string')}f${await target.getAttribute('data-fret')}"]`,
            ),
          )
        : cells.first();
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

/**
 * A schema v2 database, as a device had it before M3-17, built with the raw
 * IndexedDB API (Dexie stores version n as 10n): the learner had mastered
 * the old `C5.tones-triads` skill and holds its twelve cards. Seeded from a
 * static file, so the app hasn't opened the database yet.
 */
async function seedV2Learner(page: Page): Promise<void> {
  await page.goto('/favicon.svg');
  await page.evaluate(async (prereqs) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork', 20);
      req.onupgradeneeded = () => {
        const d = req.result;
        const store = (
          name: string,
          keyPath: string | string[] | null,
          indexes: [string, string | string[], boolean?][] = [],
          autoIncrement = false,
        ) => {
          const s = d.createObjectStore(name, { keyPath, autoIncrement });
          for (const [i, path, unique] of indexes) s.createIndex(i, path, { unique: !!unique });
        };
        store('settings', 'key');
        store('cards', 'itemId', [
          ['skillId', 'skillId'],
          ['fsrs.due', 'fsrs.due'],
        ]);
        /** One index per field, plus the unique `uid` sync gave append-only rows. */
        const logIndexes = (...fields: string[]): [string, string, boolean?][] => [
          ...fields.map((f): [string, string] => [f, f]),
          ['uid', 'uid', true],
        ];
        store('reviewLogs', 'id', logIndexes('itemId', 'skillId', 'drillType', 'at'), true);
        store('skillStates', 'skillId');
        store(
          'confusions',
          ['a', 'b'],
          [
            ['a', 'a'],
            ['b', 'b'],
          ],
        );
        store('sessionLogs', 'id', logIndexes('startedAt'), true);
        store('gamification', 'key');
        store('dailyProgress', 'date');
        store('achievements', 'id');
        store('gamificationEvents', 'id', logIndexes('type', 'at'), true);
        store('syncMeta', ['table', 'id'], [['updatedAt', 'updatedAt']]);
        store('outbox', ['table', 'id']);
        store('syncState', 'key');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['settings', 'cards', 'skillStates'], 'readwrite');
    const now = Date.now();
    const DAY = 86_400_000;
    tx.objectStore('settings').put({ key: 'singleton', onboardedAt: new Date(now - 30 * DAY) });
    for (const tone of ['1@major', '1@minor', '3@major', 'b3@minor', '5@major', '5@minor']) {
      for (const kind of ['chord-tone', 'chord-tone-name']) {
        tx.objectStore('cards').put({
          itemId: `${kind}:${tone}`,
          skillId: 'C5.tones-triads',
          fsrs: {
            due: new Date(now + 10 * DAY),
            stability: 12,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: 12,
            learning_steps: 0,
            reps: 6,
            lapses: 0,
            state: 2,
            last_review: new Date(now - 2 * DAY),
          },
          createdAt: new Date(now - 20 * DAY),
          lastReviewedAt: new Date(now - 2 * DAY),
        });
      }
    }
    for (const skillId of [...prereqs, 'C5.tones-triads']) {
      tx.objectStore('skillStates').put({
        skillId,
        status: 'mastered',
        guideLevel: 0,
        rollingAccuracy: 1,
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, PREREQS);
}

/** Every card's skill, by item. */
async function cardSkills(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ itemId: string; skillId: string }[]>((resolve) => {
      const req = db.transaction('cards').objectStore('cards').getAll();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return Object.fromEntries(rows.map((r) => [r.itemId, r.skillId]));
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
    await expect(promptText(page)).toContainText(/the roots? of/i);
    await expect(page.locator(TARGET_MARKERS).first()).toBeVisible();
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

  test('an existing learner keeps their chord-tone progress', async ({ page }) => {
    await seedV2Learner(page);
    // Opening the app upgrades the database: the old skill's cards and
    // mastery move onto its stages, so the learner's next stage is the 7th.
    for (const stage of STAGES) expect(await statusOf(page, stage)).toBe('mastered');
    const cards = await cardSkills(page);
    expect(Object.keys(cards)).toHaveLength(12);
    expect(cards['chord-tone:1@minor']).toBe('C5.tones-roots');
    expect(cards['chord-tone-name:b3@minor']).toBe('C5.tones-thirds');
    expect(cards['chord-tone:5@major']).toBe('C5.tones-fifths');
    expect(Object.values(cards)).not.toContain('C5.tones-triads');
  });
});
