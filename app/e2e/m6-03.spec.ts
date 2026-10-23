import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M6-03: I1 triad inversions on a string set (D18). A build card draws the
// root as a square and the learner taps the inversion's other two notes; a
// name card draws a triad and the learner names its inversion. Picking the
// wrong inversion, or the ♭3 for the 3, is logged against that other card.

interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code).
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN_MIDI: Record<number, number> = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };
const INVERSIONS = ['root position', '1st inversion', '2nd inversion'];

const chroma = (name: string) =>
  (CHROMATIC.indexOf(name[0]!) + (name[1] === '♯' ? 1 : name[1] === '♭' ? 11 : 0)) % 12;
const midiAt = (c: Cell) => OPEN_MIDI[c.string]! + c.fret;
const key = (c: Cell) => `s${c.string}f${c.fret}`;

/** The close triad on `low` and the two strings above it, in this inversion, holding `root`. */
function solveTriad(rootPc: number, minor: boolean, inversion: number, low: number, root: Cell) {
  const tones = [0, minor ? 3 : 4, 7];
  const want = [0, 1, 2].map((i) => tones[(i + inversion) % 3]!);
  const strings = [low, low - 1, low - 2];
  const frets = (s: number, semis: number) =>
    Array.from({ length: 16 }, (_, f) => f).filter(
      (f) => (OPEN_MIDI[s]! + f) % 12 === (rootPc + semis) % 12,
    );
  for (const f0 of frets(strings[0]!, want[0]!)) {
    for (const f1 of frets(strings[1]!, want[1]!)) {
      for (const f2 of frets(strings[2]!, want[2]!)) {
        const cells = [f0, f1, f2].map((fret, i) => ({ string: strings[i]!, fret }));
        const m = cells.map(midiAt);
        const fs = [f0, f1, f2];
        if (!(m[0]! < m[1]! && m[1]! < m[2]! && m[2]! - m[0]! < 12)) continue;
        if (Math.max(...fs) - Math.min(...fs) > 4) continue;
        if (cells.some((c) => key(c) === key(root))) return cells;
      }
    }
  }
  throw new Error(`No ${INVERSIONS[inversion]} on string ${low} holds ${key(root)}`);
}

const drill = (page: Page) => page.getByTestId('d18-drill');
const promptText = (page: Page) => page.getByTestId('d18-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="${key(c)}"]`);

async function markersOf(page: Page, styles: readonly string[]): Promise<Cell[]> {
  const out: Cell[] = [];
  for (const style of styles) {
    for (const m of await neck(page).getByTestId(`marker-${style}`).all()) {
      out.push({
        string: Number(await m.getAttribute('data-string')),
        fret: Number(await m.getAttribute('data-fret')),
      });
    }
  }
  return out;
}

interface Task {
  mode: 'build' | 'name';
  guided: boolean;
  minor: boolean;
  /** Build: the cells to tap. */
  answer: Cell[];
  /** Name: the inversion, 0–2. */
  inversion: number;
}

/** Read the prompt and the neck, and solve from the independent key. */
async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const mode = (await drill(page).getAttribute('data-mode')) as Task['mode'];
  const text = (await promptText(page).innerText()).trim();
  if (mode === 'build') {
    const m =
      /^(Build|This is) ([A-G][♯♭]?)(m?) in (root position|1st inversion|2nd inversion) on strings (\d)/.exec(
        text,
      );
    expect(m, text).not.toBeNull();
    const [root] = await markersOf(page, ['root']);
    const minor = m![3] === 'm';
    const inversion = INVERSIONS.indexOf(m![4]!);
    const triad = solveTriad(chroma(m![2]!), minor, inversion, Number(m![5]), root!);
    const answer = triad.filter((c) => key(c) !== key(root!));
    return { mode, guided: m![1] === 'This is', minor, answer, inversion };
  }
  const m = /^(Which inversion of|This is) ([A-G][♯♭]?)(m?)/.exec(text);
  expect(m, text).not.toBeNull();
  const notes = await markersOf(page, ['tone', 'root', 'third', 'fifth']);
  expect(notes).toHaveLength(3);
  const bass = notes.reduce((a, b) => (b.string > a.string ? b : a));
  const semis = (((midiAt(bass) - chroma(m![2]!)) % 12) + 12) % 12;
  const inversion = semis === 0 ? 0 : semis === 7 ? 2 : 1;
  return { mode, guided: m![1] === 'This is', minor: m![3] === 'm', answer: [], inversion };
}

const BUTTONS = ['Root position', '1st inversion', '2nd inversion'];

/** Answer whatever is on screen correctly and wait for the next prompt. */
async function solve(page: Page): Promise<Task> {
  const task = await readTask(page);
  if (task.mode === 'build') {
    if (task.guided) {
      // A worked example marks the notes to copy (rule 8).
      await expect(neck(page).getByTestId('marker-target')).toHaveCount(2);
    }
    for (const c of task.answer) await cellAt(page, c).click();
  } else {
    await page.getByRole('button', { name: BUTTONS[task.inversion]! }).click();
  }
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return task;
}

/** Solve until a card is served as recall, not as a worked example. */
async function nextRecall(page: Page): Promise<Task> {
  for (let i = 0; i < 20; i++) {
    const t = await readTask(page);
    if (!t.guided) return t;
    await solve(page);
  }
  throw new Error('No recall prompt within 20 cards');
}

async function confusionPairs(page: Page): Promise<string[][]> {
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

async function focusItem(page: Page, itemId: string): Promise<void> {
  await page.goto(`/session?item=${encodeURIComponent(itemId)}`);
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
}

test.describe('M6-03 triad inversions on a string set', () => {
  test('a worked example, then each inversion built from its root @smoke @layout', async ({
    page,
  }, info) => {
    await freshStart(page);
    await masterSkills(page, ['C6.triad-cores']);
    await focusSession(page, 'I1.major-top-sets');

    // The first card is root position on strings 3–1, as a worked example.
    const first = await readTask(page);
    expect(first).toMatchObject({ mode: 'build', guided: true, minor: false, inversion: 0 });
    await expect(promptText(page)).toContainText('in root position on strings 3–1');
    await expect(page.getByTestId('d18-count')).toHaveText('Found 0 of 2');

    // iPad landscape shows the whole neck (design §7); portrait a 12-fret
    // neck and a phone a window, each holding the triad.
    const from = Number(await neck(page).getAttribute('data-fret-from'));
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    if (info.project.name === 'ipad-portrait') expect(to - from).toBe(12);
    else if (info.project.name !== 'iphone-smoke') expect([from, to]).toEqual([0, 15]);
    for (const c of [...(await markersOf(page, ['root'])), ...first.answer]) {
      expect(c.fret).toBeGreaterThanOrEqual(from);
      expect(c.fret).toBeLessThanOrEqual(to);
    }

    let recalled = 0;
    for (let i = 0; i < 20 && recalled < 2; i++) {
      const task = await solve(page);
      if (!task.guided) recalled++;
    }
    expect(recalled).toBe(2);
    await expectNoHorizontalOverflow(page);
  });

  test('a wrong inversion is that confusion, and the panel names the CAGED shape', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, ['C6.triad-cores']);
    await focusItem(page, 'inversion-name:1@s3/major');

    const task = await nextRecall(page);
    expect(task).toMatchObject({ mode: 'name', inversion: 1 });
    await expect(promptText(page)).toContainText(/^Which inversion of [A-G][♯♭]? is this\?/);
    // Recall: the triad's dots carry no degrees and the answer isn't marked (rule 4).
    await expect(neck(page).getByTestId('marker-tone')).toHaveCount(3);
    await expect(neck(page).getByTestId('marker-tone').first()).toHaveText('');

    await page.keyboard.press('r');
    await expect(page.getByTestId('feedback-wrong')).toContainText('1st inversion');
    await expect(page.getByRole('button', { name: 'Root position' })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    await expect(page.getByRole('button', { name: '1st inversion' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    await expect(page.getByTestId('d18-explain')).toContainText(
      'Root position has the root in the bass.',
    );
    // The answer labels each degree, and the panel puts the triad in its shape.
    await expect(neck(page).getByTestId('marker-third')).toHaveText('3');
    await expect(page.getByTestId('d18-core')).toContainText('E shape');
    expect(await confusionPairs(page)).toEqual([
      ['inversion-name:0@s3/major', 'inversion-name:1@s3/major'],
    ]);
    await expectNoHorizontalOverflow(page);
  });

  test('the ♭3 for the 3 is logged against the minor card @layout', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, ['C6.triad-cores']);
    await focusItem(page, 'inversion:1@s3/major');

    const task = await nextRecall(page);
    expect(task).toMatchObject({ mode: 'build', inversion: 1 });
    await expect(neck(page).getByTestId('marker-target')).toHaveCount(0);

    // In 1st inversion the 3rd is the bass, on string 3: a fret lower is the ♭3.
    const third = task.answer.find((c) => c.string === 3)!;
    await cellAt(page, { string: 3, fret: third.fret - 1 }).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('in 1st inversion');
    await expect(page.getByTestId('d18-explain')).toContainText(/the ♭3 of [A-G][♯♭]?m/);
    await expect(neck(page).getByTestId('marker-wrong')).toHaveCount(1);
    await expect(neck(page).getByTestId('marker-ghost')).toHaveCount(2);
    expect(await confusionPairs(page)).toEqual([['inversion:1@s3/major', 'inversion:1@s3/minor']]);

    // Every cell is a comfortable target on iPad (design §7: ≥ 44pt).
    const box = await cellAt(page, { string: 3, fret: 7 }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });
});
