import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { answerWhichShape } from './helpers/which-shape';

// M3-05: C6 CAGED skills and D9 "Build the shape at a root". Triad cores come
// before whole shapes; the root is a square on the neck and the learner taps
// the template around it. Building the A shape where the C shape was asked
// (they share string 5) is logged as that confusion.

/** Rule 7: natural notes on strings 6 and 5, and triads (C5), open CAGED. */
const PREREQS = ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads'];

type Shape = 'C' | 'A' | 'G' | 'E' | 'D';
interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code): each
// major shape as string → frets from the root, plus its root string.
const SHAPES: Record<Shape, { rootString: number; offsets: Record<number, number> }> = {
  C: { rootString: 5, offsets: { 5: 0, 4: -1, 3: -3, 2: -2, 1: -3 } },
  A: { rootString: 5, offsets: { 5: 0, 4: 2, 3: 2, 2: 2, 1: 0 } },
  G: { rootString: 6, offsets: { 6: 0, 5: -1, 4: -3, 3: -3, 2: -3, 1: 0 } },
  E: { rootString: 6, offsets: { 6: 0, 5: 2, 4: 2, 3: 1, 2: 0, 1: 0 } },
  D: { rootString: 4, offsets: { 4: 0, 3: 2, 2: 3, 1: 2 } },
};

const drill = (page: Page) => page.getByTestId('d9-drill');
const promptText = (page: Page) => page.getByTestId('d9-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`);

async function cellOf(page: Page, testId: string): Promise<Cell> {
  const m = neck(page).getByTestId(testId).first();
  await expect(m).toBeVisible();
  return {
    string: Number(await m.getAttribute('data-string')),
    fret: Number(await m.getAttribute('data-fret')),
  };
}

interface Task {
  guided: boolean;
  shape: Shape;
  /** The strings to build on, e.g. [3, 2, 1] for a triad core; all but the root's for a shape. */
  strings: number[];
  root: Cell;
}

/** Read the prompt: which shape, which part, and where the root square is. */
async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const text = (await promptText(page).innerText()).trim();
  const m =
    /(?:Build|This is) the ([CAGED])[- ]shape (triad )?of \S+?(?: on strings (\d)–(\d))?(?:[ .]|$)/.exec(
      text,
    );
  expect(m, text).not.toBeNull();
  const shape = m![1] as Shape;
  const root = await cellOf(page, 'marker-root');
  const t = SHAPES[shape];
  expect(root.string).toBe(t.rootString);
  const strings = m![2]
    ? [Number(m![3]), Number(m![3]) - 1, Number(m![4])]
    : Object.keys(t.offsets)
        .map(Number)
        .filter((s) => s !== t.rootString)
        .sort((a, b) => b - a);
  return { guided: text.startsWith('This is'), shape, strings, root };
}

/** The cells to tap, from the independent key. */
function solve(task: Task): Cell[] {
  const offsets = SHAPES[task.shape].offsets;
  return task.strings.map((s) => ({ string: s, fret: task.root.fret + offsets[s]! }));
}

/** Build whatever is on screen correctly and wait for the next prompt. */
async function build(page: Page): Promise<Task> {
  const task = await readTask(page);
  const cells = solve(task);
  if (task.guided) {
    // A worked example marks the notes to copy (rule 8).
    await expect(neck(page).getByTestId('marker-target')).toHaveCount(cells.length);
  }
  for (const c of cells) await cellAt(page, c).click();
  await expect(page.getByTestId('feedback-correct')).toContainText(`${task.shape}`);
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return task;
}

/**
 * File C, G and A triad-core cards as due reviews at guide level 1, so the
 * session serves them unguided (and pairs C with A). Reloads.
 */
async function seedCoreReviews(page: Page): Promise<void> {
  await page.evaluate(async (prereqs) => {
    const DAY = 86_400_000;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
    const now = Date.now();
    for (const shape of ['C', 'G', 'A']) {
      tx.objectStore('cards').put({
        itemId: `caged-core:${shape}-shape@major`,
        skillId: 'C6.triad-cores',
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
    }
    const states = tx.objectStore('skillStates');
    for (const skillId of prereqs) {
      states.put({ skillId, status: 'mastered', guideLevel: 0, rollingAccuracy: 1 });
    }
    states.put({
      skillId: 'C6.triad-cores',
      status: 'practising',
      guideLevel: 1,
      rollingAccuracy: 0.85,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, PREREQS);
  await page.reload();
}

test.describe('M3-05 D9 builds the CAGED shape at a root', () => {
  test('triad cores first: a worked example, then built from the root @smoke', async ({
    page,
  }, info) => {
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C6.triad-cores');

    // The first card is the C shape's triad core, as a worked example.
    const first = await readTask(page);
    expect(first).toMatchObject({ guided: true, shape: 'C', strings: [3, 2, 1] });
    await expect(page.getByTestId('d9-count')).toHaveText('Found 0 of 3');

    // iPad landscape shows the whole neck (design §7); portrait a 12-fret
    // neck and a phone a window, each around the root.
    const from = Number(await neck(page).getAttribute('data-fret-from'));
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    if (info.project.name === 'ipad-portrait') expect(to - from).toBe(12);
    else if (info.project.name !== 'iphone-smoke') expect([from, to]).toEqual([0, 15]);
    for (const c of [first.root, ...solve(first)]) {
      expect(c.fret).toBeGreaterThanOrEqual(from);
      expect(c.fret).toBeLessThanOrEqual(to);
    }

    const seen = new Set<string>();
    let recalled = 0;
    // C and A, the confusable pair, are both met early.
    for (let i = 0; i < 20 && (recalled < 2 || !seen.has('A')); i++) {
      const task = await build(page);
      seen.add(task.shape);
      if (!task.guided) recalled++;
    }
    expect(recalled).toBeGreaterThanOrEqual(2);
    expect([...seen]).toEqual(expect.arrayContaining(['C', 'A']));
    await expectNoHorizontalOverflow(page);
  });

  test('building the A shape where the C shape was asked is a confusion', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedCoreReviews(page);
    await focusSession(page, 'C6.triad-cores');

    let task: Task | null = null;
    for (let i = 0; i < 10; i++) {
      const t = await readTask(page);
      if (t.shape === 'C' && !t.guided) {
        task = t;
        break;
      }
      await build(page);
    }
    expect(task).not.toBeNull();
    // Recall: no notes are marked and the count hides its total (rule 9).
    await expect(neck(page).getByTestId('marker-target')).toHaveCount(0);
    await expect(page.getByTestId('d9-count')).toHaveText('Found 0');

    // String 1 at the root's fret: the A shape's 5th, not in the C shape.
    const [first] = solve(task!);
    await cellAt(page, first!).click();
    await expect(neck(page).getByTestId('marker-fifth')).toHaveCount(1);
    await cellAt(page, { string: 1, fret: task!.root.fret }).click();

    await expect(page.getByTestId('feedback-wrong')).toContainText('the C-shape triad of');
    const explain = page.getByTestId('d9-explain');
    await expect(explain).toContainText('That note is in the A shape.');
    await expect(explain).toContainText('the C shape reaches back toward the nut');
    // The wrong tap is a diamond; the two notes still to find are ringed.
    await expect(neck(page).getByTestId('marker-wrong')).toHaveCount(1);
    await expect(neck(page).getByTestId('marker-ghost')).toHaveCount(2);
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
    await expect(page.getByTestId('d9-explain')).not.toContainText('A shape');
  });

  test('whole shapes follow the cores, over the whole neck', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, [...PREREQS, 'C6.triad-cores']);
    await focusSession(page, 'C6.major-shapes');

    const first = await readTask(page);
    expect(first).toMatchObject({ guided: true, shape: 'C', strings: [4, 3, 2, 1] });
    await expect(page.getByTestId('d9-count')).toHaveText('Found 0 of 4');
    let recalled = 0;
    for (let i = 0; i < 20 && recalled < 1; i++) {
      // D10 names the whole shapes D9 builds, and the picker alternates them.
      if (await answerWhichShape(page)) continue;
      const task = await build(page);
      if (!task.guided) recalled++;
    }
    expect(recalled).toBe(1);

    // Every cell is a comfortable target on iPad (design §7: ≥ 44pt).
    const box = await cellAt(page, { string: 3, fret: 7 }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });
});
