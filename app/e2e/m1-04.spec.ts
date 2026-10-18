import { expect, test, type Page } from '@playwright/test';
import {
  F1_SKILLS,
  F3_SKILLS,
  expectNoHorizontalOverflow,
  freshStart,
  masterSkills,
  noteName,
} from './helpers';

// D2 "Find the note" (design §6 D2, §7 session, §8): tap the named note on
// the named string.

const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Mark every F2 note@ item as known and not due, so the session goes
 * straight to the find:<pc>@s<n> items D2 tests.
 */
async function seedKnownNotes(page: Page): Promise<void> {
  const ids: string[] = [];
  for (const string of [6, 5]) {
    for (let fret = 0; fret <= 12; fret++) {
      if (NATURALS.includes(noteName(string, fret))) ids.push(`note@s${string}f${fret}`);
    }
  }
  await page.evaluate(async (itemIds) => {
    const now = new Date();
    const due = new Date(now.getTime() + 30 * 86_400_000);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('cards', 'readwrite');
      for (const itemId of itemIds) {
        const string = itemId.match(/@s(\d)/)![1];
        tx.objectStore('cards').put({
          itemId,
          skillId: `F2.string${string}-naturals`,
          fsrs: {
            due,
            stability: 30,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: 30,
            learning_steps: 0,
            reps: 1,
            lapses: 0,
            state: 2,
            last_review: now,
          },
          createdAt: now,
          lastReviewedAt: now,
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, ids);
}

async function startFindSession(page: Page): Promise<void> {
  await freshStart(page);
  // The F1 note-wheel skills (D3) lead a fresh session; skip them.
  await masterSkills(page, [...F1_SKILLS, ...F3_SKILLS]);
  await seedKnownNotes(page);
  await page.reload();
  // 7 naturals to find on each of strings 6 and 5, the 14 musical-alphabet items
  // and the 10 fret-marker items: new counts every root skill, mastered or not.
  await expect(page.getByTestId('new-count')).toHaveText('38');
  await page.getByTestId('start-session').click();
  await expect(page.getByTestId('d2-prompt')).toBeVisible();
}

interface Ask {
  pc: string;
  string: number;
  frets: number[];
}

/** Reads the prompt and works out the answer independently of app code. */
async function ask(page: Page): Promise<Ask> {
  const text = (await page.getByTestId('d2-prompt').textContent()) ?? '';
  const m = /(?:This is|Find) ([A-G]#?) on string (\d)/.exec(text);
  expect(m, text).not.toBeNull();
  const pc = m![1]!;
  const string = Number(m![2]);
  const frets = Array.from({ length: 13 }, (_, f) => f).filter((f) => noteName(string, f) === pc);
  return { pc, string, frets };
}

const cell = (page: Page, string: number, fret: number) =>
  page.locator(`[data-cell="s${string}f${fret}"]`);

/** Slide the compact window until a fret is on screen (no-op on iPad). */
async function bringIntoView(page: Page, fret: number): Promise<void> {
  const neck = page.locator('svg[data-fret-from]');
  for (let i = 0; i < 5; i++) {
    const from = Number(await neck.getAttribute('data-fret-from'));
    const to = Number(await neck.getAttribute('data-fret-to'));
    if (fret >= from && fret <= to) return;
    await page.getByRole('button', { name: fret < from ? 'Lower frets' : 'Higher frets' }).click();
  }
}

async function tapCorrect(page: Page): Promise<Ask> {
  const a = await ask(page);
  await bringIntoView(page, a.frets[0]!);
  await cell(page, a.string, a.frets[0]!).click();
  await expect(page.getByTestId('feedback-correct')).toHaveText(`✓ ${a.pc}`);
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return a;
}

test.describe('M1-04 D2 "Find the note"', () => {
  test('runs a full find prompt on the iPad neck', async ({ page }, info) => {
    await startFindSession(page);
    const landscape = info.project.name !== 'ipad-portrait';
    const neck = page.locator('svg[data-fret-from]');
    await expect(neck).toHaveAttribute('data-fret-from', '0');
    await expect(neck).toHaveAttribute('data-fret-to', landscape ? '15' : '12');
    // The whole neck is shown; frets outside the live region are dimmed, not hidden.
    await expect(page.getByTestId('dimmed-fret')).toHaveCount(landscape ? 3 : 0);

    // Guided first reps: a worked example shows where the note is.
    const first = await ask(page);
    expect(first).toEqual({ pc: 'C', string: 6, frets: [8] });
    await expect(page.getByTestId('d2-prompt')).toHaveText(
      'This is C on string 6. Tap it to continue.',
    );
    const target = page.getByTestId('marker-target');
    await expect(target).toHaveAttribute('data-string', '6');
    await expect(target).toHaveAttribute('data-fret', '8');
    // A tap on a dimmed string is ignored.
    await cell(page, 5, 3).click();
    await expect(page.getByTestId('feedback-wrong')).toHaveCount(0);
    for (let i = 0; i < 4; i++) await tapCorrect(page);

    // Second pass: recall. Nothing on the neck or in its labels gives the answer away.
    const recall = await ask(page);
    await expect(page.getByTestId('d2-prompt')).toHaveText(`Find ${recall.pc} on string 6`);
    await expect(page.locator('[data-testid^="marker-"]')).toHaveCount(0);
    const labels = await page
      .getByRole('button', { name: /^string \d, fret \d+/ })
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(labels).toHaveLength((landscape ? 16 : 13) * 6);
    for (const l of labels) expect(l).toMatch(/^string \d, fret \d+$/);

    // Neck cells stay ≥ 44pt on iPad.
    const sizes = await page
      .locator('[data-cell^="s6f"]')
      .evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect()));
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
    await tapCorrect(page);

    // A wrong tap shows both positions and waits for Continue.
    const miss = await ask(page);
    const wrongFret = (miss.frets[0]! + 1) % 12;
    const wrongPc = noteName(miss.string, wrongFret);
    await cell(page, miss.string, wrongFret).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${miss.pc}`);
    await expect(page.getByTestId('marker-wrong')).toHaveAttribute('data-fret', String(wrongFret));
    await expect(page.getByTestId('marker-wrong')).toHaveText(wrongPc);
    await expect(page.getByTestId('marker-correct').first()).toHaveAttribute(
      'data-fret',
      String(miss.frets[0]),
    );
    await expect(page.getByTestId('d2-explain')).toContainText(
      `You tapped ${wrongPc} (string ${miss.string}, fret ${wrongFret}).`,
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
    await expect(page.locator('[data-testid^="marker-"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('summary-items')).toHaveText('6');
  });

  test('answers with the arrow keys and Enter', async ({ page }) => {
    await startFindSession(page);
    const { string, frets } = await ask(page);
    // The first arrow key puts the focus cell on the open string.
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, string, 0)).toBeFocused();
    for (let f = 0; f < frets[0]!; f++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, string, frets[0]!)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('feedback-correct')).toBeVisible();

    await expect(page.getByTestId('feedback-correct')).toBeHidden();
    const next = await ask(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${next.pc}`);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('finds notes on the phone with a sliding window @smoke', async ({ page }, info) => {
    await startFindSession(page);
    for (let i = 0; i < 4; i++) await tapCorrect(page);
    if (info.project.name === 'iphone-smoke') {
      // Compact: a window that starts at the nut, so it gives nothing away. A
      // phone on its side gets a wider one (M1-20).
      const neck = page.locator('svg[data-fret-from]');
      await expect(neck).toHaveAttribute('data-fret-from', '0');
      await expect(neck).toHaveAttribute('data-fret-to', '9');
      await expect(page.getByTestId('d2-window')).toHaveText('Frets 0–9');
    }
    const a = await tapCorrect(page);
    expect(a.string).toBe(6);
    await expectNoHorizontalOverflow(page);
  });
});
