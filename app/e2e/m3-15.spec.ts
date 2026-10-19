import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M3-15: D38 "Build the chord". The chord symbol and its root (a square) are
// given; the learner taps one note per string above the root, then checks.
// Any playable voicing with the chord's tones counts. Feedback names each
// note's degree and the tones that are missing, and building the minor chord
// for the major is logged as that confusion.

/** Rule 7: finding the tones in a shape opens building chords. */
const PREREQS = ['C5.tones-fifths'];

interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code): the
// movable E, A and D shapes, as frets above the root by string, keyed by the
// root's string. Every offset is ≥ 0, so each fits at any root fret.
const SHAPES: Record<'major' | 'minor', Record<number, Record<number, number>>> = {
  major: {
    6: { 5: 2, 4: 2, 3: 1, 2: 0, 1: 0 },
    5: { 4: 2, 3: 2, 2: 2, 1: 0 },
    4: { 3: 2, 2: 3, 1: 2 },
  },
  minor: {
    6: { 5: 2, 4: 2, 3: 0, 2: 0, 1: 0 },
    5: { 4: 2, 3: 2, 2: 1, 1: 0 },
    4: { 3: 2, 2: 3, 1: 1 },
  },
};

const drill = (page: Page) => page.getByTestId('d38-drill');
const promptText = (page: Page) => page.getByTestId('d38-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`);

async function cellsOf(page: Page, testId: string): Promise<Cell[]> {
  const ms = neck(page).getByTestId(testId);
  const out: Cell[] = [];
  for (const m of await ms.all()) {
    out.push({
      string: Number(await m.getAttribute('data-string')),
      fret: Number(await m.getAttribute('data-fret')),
    });
  }
  return out;
}

interface Task {
  guided: boolean;
  quality: 'major' | 'minor';
  root: Cell;
}

/** Read the prompt: the chord's quality and where the root square is. */
async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const text = (await promptText(page).innerText()).trim();
  const chord = (await promptText(page).locator('strong').innerText()).trim();
  expect(chord, text).toMatch(/^[A-G][♯♭]?m?$/);
  const [root] = await cellsOf(page, 'marker-root');
  expect(root).toBeDefined();
  return {
    guided: text.startsWith('This is one voicing'),
    quality: chord.endsWith('m') ? 'minor' : 'major',
    root: root!,
  };
}

/** A voicing of the chord from the key, as taps above the root. */
function solve(task: Task, quality = task.quality): Cell[] {
  const offsets = SHAPES[quality][task.root.string]!;
  return Object.entries(offsets).map(([s, by]) => ({
    string: Number(s),
    fret: task.root.fret + by,
  }));
}

async function check(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Check' }).click();
}

/** Build whatever is on screen correctly and wait for the next prompt. */
async function build(page: Page): Promise<Task> {
  const task = await readTask(page);
  // A worked example marks the notes of one voicing to copy (rule 8); any other works too.
  const cells = task.guided ? await cellsOf(page, 'marker-target') : solve(task);
  expect(cells.length).toBeGreaterThan(0);
  for (const c of cells) await cellAt(page, c).click();
  await check(page);
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('d38-explain')).toContainText("Yes: that's");
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return task;
}

async function confusionRows(page: Page): Promise<string[][]> {
  return page.evaluate(async () => {
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
}

test.describe('M3-15 D38 builds the chord from a root', () => {
  test('a worked example, then any voicing built from the root @smoke', async ({ page }, info) => {
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C5.build-triads');

    const first = await readTask(page);
    expect(first).toMatchObject({ guided: true, quality: 'major' });
    expect(first.root.string).toBe(6);
    await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();

    // iPad landscape shows the whole neck (design §7), portrait a 12-fret
    // neck and a phone a window, each around the root.
    const from = Number(await neck(page).getAttribute('data-fret-from'));
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    if (info.project.name === 'ipad-portrait') expect(to - from).toBe(12);
    else if (info.project.name !== 'iphone-smoke') expect([from, to]).toEqual([0, 15]);
    for (const c of [first.root, ...(await cellsOf(page, 'marker-target'))]) {
      expect(c.fret).toBeGreaterThanOrEqual(from);
      expect(c.fret).toBeLessThanOrEqual(to);
    }

    let recalled = 0;
    const qualities = new Set<string>();
    for (let i = 0; i < 20 && (recalled < 2 || qualities.size < 2); i++) {
      const task = await build(page);
      qualities.add(task.quality);
      if (!task.guided) recalled++;
    }
    // Major and minor, the confusable pair, enter side by side (rule 6).
    expect(recalled).toBeGreaterThanOrEqual(2);
    expect([...qualities].sort()).toEqual(['major', 'minor']);
    await expectNoHorizontalOverflow(page);
  });

  test('feedback names each degree and the missing tones; the minor for the major is a confusion', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C5.build-triads');

    // Find an unguided major prompt.
    let task: Task | null = null;
    for (let i = 0; i < 12; i++) {
      const t = await readTask(page);
      if (!t.guided && t.quality === 'major') {
        task = t;
        break;
      }
      await build(page);
    }
    expect(task).not.toBeNull();
    // Recall: no notes are marked before the check (rule 4).
    await expect(neck(page).getByTestId('marker-target')).toHaveCount(0);

    // One note only, the shape's first above the root (a 5th or the octave):
    // the 3rd is missing, so it's wrong, but no other chord: not a confusion.
    const [fifth] = solve(task!);
    await cellAt(page, fifth!).click();
    await expect(neck(page).getByTestId('marker-tone')).toHaveCount(1);
    await check(page);
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    const explain = page.getByTestId('d38-explain');
    await expect(explain).toContainText('Missing the 3rd');
    await expect(explain).toContainText('One that works:');
    // The placed note is drawn by its degree; the missing ones are ringed.
    await expect(neck(page).getByTestId('marker-ghost').first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Your voicing, low string first' })).toContainText(
      'R',
    );
    expect(await confusionRows(page)).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    // The minor chord where the major was asked: logged as that confusion.
    let next: Task | null = null;
    for (let i = 0; i < 12; i++) {
      const t = await readTask(page);
      if (!t.guided && t.quality === 'major') {
        next = t;
        break;
      }
      await build(page);
    }
    expect(next).not.toBeNull();
    for (const c of solve(next!, 'minor')) await cellAt(page, c).click();
    await check(page);
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(page.getByTestId('d38-explain')).toContainText('has the 3rd');
    // The ♭3 isn't in the major chord: a diamond, named by its degree.
    await expect(neck(page).getByTestId('marker-wrong')).toHaveText('♭3');
    expect(await confusionRows(page)).toEqual([['triad:maj', 'triad:min']]);

    // Every cell is a comfortable target on iPad (design §7: ≥ 44pt).
    const box = await cellAt(page, { string: 3, fret: 7 }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });
});
