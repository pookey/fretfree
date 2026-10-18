import { expect, test, type Page } from '@playwright/test';
import { F1_SKILLS, expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';

// M2-06: D6 "Tap the M3/P5/b7 from a root". Any correct position in the
// active region counts, and G–B shift shapes are drilled among the others.

// An independent answer key (deliberately not imported from app code).
const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const SEMITONES: Record<string, number> = {
  'minor 2nd': 1,
  'major 2nd': 2,
  'minor 3rd': 3,
  'major 3rd': 4,
  'perfect 4th': 5,
  tritone: 6,
  'perfect 5th': 7,
  'minor 6th': 8,
  'major 6th': 9,
  'minor 7th': 10,
  'major 7th': 11,
};

const NON_C3_SKILLS = [
  ...F1_SKILLS,
  'F2.string6-naturals',
  'F2.string5-naturals',
  'F3.markers',
  'F3.repeat-12',
  'C1.octaves',
  'C1.octaves-gb-shift',
  'C1.double-octaves',
  'C2.all-notes',
];
const C3_SKILLS = ['C3.thirds', 'C3.fourths-fifths', 'C3.sevenths', 'C3.sixths', 'C3.seconds'];

/** The G–B shift item, seen longest ago so it leads the session. */
const SHIFT_ITEM = 'interval:M3@s3→s2';
const DUE_ITEMS: [string, string][] = [
  [SHIFT_ITEM, 'C3.thirds'],
  ['interval:m3@s6→s5', 'C3.thirds'],
  ['interval:M3@s6→s5', 'C3.thirds'],
  ['interval:m3@s5→s4', 'C3.thirds'],
  ['interval:M3@s5→s4', 'C3.thirds'],
  ['interval:m3@s4→s3', 'C3.thirds'],
  ['interval:M3@s4→s3', 'C3.thirds'],
  ['interval:m3@s3→s2', 'C3.thirds'],
  ['interval:m3@s2→s1', 'C3.thirds'],
  ['interval:M3@s2→s1', 'C3.thirds'],
  ['interval:P5@s6→s5', 'C3.fourths-fifths'],
  ['interval:P4@s3→s2', 'C3.fourths-fifths'],
  ['interval:P5@s5→s4', 'C3.fourths-fifths'],
];

interface Cell {
  string: number;
  fret: number;
}

const midi = (c: Cell) => OPEN_MIDI[c.string]! + c.fret;
const promptText = (page: Page) => page.getByTestId('d6-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`);

async function markerCell(page: Page, style: string): Promise<Cell> {
  const m = neck(page).getByTestId(`marker-${style}`).first();
  await expect(m).toBeVisible();
  return {
    string: Number(await m.getAttribute('data-string')),
    fret: Number(await m.getAttribute('data-fret')),
  };
}

async function question(page: Page): Promise<string> {
  await expect(promptText(page)).toBeVisible();
  return (await promptText(page).innerText()).trim();
}

/** Every C3 skill mastered (no new items) and the D6 items above due now. */
async function seedDueIntervals(page: Page): Promise<void> {
  await page.evaluate(
    async ({ mastered, due }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
      const now = Date.now();
      due.forEach(([itemId, skillId], i) => {
        // The first item was reviewed longest ago at the lowest stability, so it comes first.
        const ago = (20 - i) * DAY;
        tx.objectStore('cards').put({
          itemId,
          skillId,
          fsrs: {
            due: new Date(now - DAY),
            stability: i === 0 ? 1 : 3,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: 3,
            learning_steps: 0,
            reps: 3,
            lapses: 0,
            state: 2,
            last_review: new Date(now - ago),
          },
          createdAt: new Date(now - ago - 3 * DAY),
          lastReviewedAt: new Date(now - ago),
        });
      });
      for (const skillId of mastered) {
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
    },
    { mastered: [...NON_C3_SKILLS, ...C3_SKILLS], due: DUE_ITEMS },
  );
  await page.reload();
}

/** The cell a shape-scope prompt asks for: the interval above the root on the named string. */
async function shapeAnswer(page: Page): Promise<Cell> {
  const m = /^Tap the (.+) above the root on string (\d)$/.exec(await question(page));
  if (!m) throw new Error(`Unexpected D6 prompt: ${await question(page)}`);
  const root = await markerCell(page, 'root');
  const string = Number(m[2]);
  return { string, fret: midi(root) + SEMITONES[m[1]!]! - OPEN_MIDI[string]! };
}

/** Every live cell holding the asked degree, in any octave, at a widened scope. */
async function degreeCells(page: Page): Promise<Cell[]> {
  const m = /^Tap a (.+) from the root, on any string$/.exec(await question(page));
  if (!m) throw new Error(`Unexpected D6 prompt: ${await question(page)}`);
  const root = await markerCell(page, 'root');
  const drill = page.locator('[data-scope]');
  const from = Number(await drill.getAttribute('data-active-from'));
  const to = Number(await drill.getAttribute('data-active-to'));
  const chroma = (midi(root) + SEMITONES[m[1]!]!) % 12;
  const out: Cell[] = [];
  for (let string = 1; string <= 6; string++) {
    for (let fret = from; fret <= to; fret++) {
      if (midi({ string, fret }) % 12 === chroma) out.push({ string, fret });
    }
  }
  return out;
}

async function expectCorrect(page: Page): Promise<void> {
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

test.describe('M2-06 D6 interval tap', () => {
  test('a new shape opens as a worked example, answered on the neck @smoke', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, NON_C3_SKILLS);
    await page.getByTestId('start-session').click();

    await expect(promptText(page)).toHaveText(
      'This is the minor 3rd above the root: string 5, 2 frets toward the nut. Tap it to continue.',
    );
    const root = await markerCell(page, 'root');
    const target = await markerCell(page, 'target');
    expect(target.string).toBe(5);
    expect(midi(target) - midi(root)).toBe(3);
    await expect(neck(page).getByTestId('marker-target')).toHaveText('b3');
    await expectNoHorizontalOverflow(page);

    await cellAt(page, target).click();
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ m3');
    await expect(neck(page).getByTestId('marker-correct')).toHaveText('b3');
  });

  test('a forgotten G–B shift is wrong, and named', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedDueIntervals(page);
    await page.getByTestId('start-session').click();

    await expect(promptText(page)).toHaveText('Tap the major 3rd above the root on string 2');
    await expect(page.getByTestId('d6-explain')).toHaveText('Tap the fret on string 2.');
    const answer = await shapeAnswer(page);
    const root = await markerCell(page, 'root');
    expect(root.string).toBe(3);
    // The G–B pair is a major 3rd apart, so the M3 sits at the root's own fret.
    expect(answer.fret).toBe(root.fret);

    // Nothing gives the answer away: no target marker, no note names in tap targets.
    await expect(neck(page).getByTestId('marker-target')).toHaveCount(0);
    const labels = await neck(page)
      .getByRole('button')
      .evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-label')));
    for (const label of labels) expect(label).toMatch(/^string \d, fret \d+$/);

    // Neck cells stay at least 44pt on iPad, even the narrowest (highest) fret.
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    const box = (await cellAt(page, { string: 1, fret: to }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    // The all-fourths shape, one fret short: the classic slip.
    const slip = { string: 2, fret: answer.fret - 1 };
    await cellAt(page, slip).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('That was M3 (G–B shift)');
    await expect(page.getByTestId('d6-explain')).toContainText(
      "That's the shape without the G–B shift.",
    );
    const wrong = neck(page).getByTestId('marker-wrong');
    await expect(wrong).toHaveAttribute('data-fret', String(slip.fret));
    await expect(wrong).toHaveText('b3');
    const correct = neck(page).getByTestId('marker-correct');
    await expect(correct).toHaveAttribute('data-string', '2');
    await expect(correct).toHaveAttribute('data-fret', String(answer.fret));
    await expect(correct).toHaveText('3');

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
    await expect(promptText(page)).not.toHaveText('Tap the major 3rd above the root on string 2');
  });

  test('accuracy widens the scope, and then any right position counts', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    test.setTimeout(60_000);
    await freshStart(page);
    await seedDueIntervals(page);
    await page.getByTestId('start-session').click();

    // Ten right answers at the shape scope widen it (the 80–90% band, rule 5).
    for (let i = 0; i < 10; i++) {
      await expect(page.locator('[data-scope]')).toHaveAttribute('data-scope', 'shape');
      await cellAt(page, await shapeAnswer(page)).click();
      await expectCorrect(page);
    }

    await expect(page.locator('[data-scope]')).toHaveAttribute('data-scope', 'box');
    await expect(page.getByTestId('d6-explain')).toContainText(
      'Above or below the root both count.',
    );
    const cells = await degreeCells(page);
    expect(cells.length).toBeGreaterThanOrEqual(2);
    // Any right cell will do: take the lowest-pitched one.
    const lowest = cells.reduce((a, b) => (midi(b) < midi(a) ? b : a));
    await cellAt(page, lowest).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    // Feedback marks every right cell in the hand position.
    await expect(neck(page).getByTestId('marker-correct')).toHaveCount(cells.length);
  });
});
