import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M6-02: C7 pentatonic skills and the box-overlay drill. A box's CAGED chord
// is drawn and the learner taps the rest of the box around it; then, in a
// whole box, the relative major's or minor's root. Tapping the box's own
// root there is logged against the relative card with the same fingering.

interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code).
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN_MIDI: Record<number, number> = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };
const SCALE = { minor: [0, 3, 5, 7, 10], major: [0, 2, 4, 7, 9] } as const;
type Quality = keyof typeof SCALE;

const chroma = (name: string) =>
  (CHROMATIC.indexOf(name[0]!) + (name[1] === '♯' ? 1 : name[1] === '♭' ? 11 : 0)) % 12;
const chromaAt = (c: Cell) => (OPEN_MIDI[c.string]! + c.fret) % 12;
const key = (c: Cell) => `s${c.string}f${c.fret}`;

/**
 * Box N: two notes per string from string 6, starting on the scale's Nth
 * note at `startFret` and walking up the scale.
 */
function boxAt(root: number, quality: Quality, box: number, startFret: number): Cell[] {
  const semis = SCALE[quality];
  const cells: Cell[] = [];
  let midi = OPEN_MIDI[6]! + startFret;
  let i = box - 1;
  for (let s = 6; s >= 1; s--) {
    for (let k = 0; k < 2; k++) {
      if (cells.length > 0) {
        i = (i + 1) % 5;
        do midi++;
        while (midi % 12 !== (root + semis[i]!) % 12);
      }
      cells.push({ string: s, fret: midi - OPEN_MIDI[s]! });
    }
  }
  return cells;
}

/** The box around the given chord: the octave of box N that holds every given note. */
function solveBox(root: number, quality: Quality, box: number, given: Cell[]): Cell[] {
  for (let start = -12; start <= 27; start++) {
    if ((OPEN_MIDI[6]! + start) % 12 !== (root + SCALE[quality][box - 1]!) % 12) continue;
    const cells = boxAt(root, quality, box, start);
    if (cells.some((c) => c.fret < 0 || c.fret > 15)) continue;
    const keys = new Set(cells.map(key));
    if (given.every((g) => keys.has(key(g)))) return cells;
  }
  throw new Error(`No box ${box} holds ${given.map(key).join(' ')}`);
}

const drill = (page: Page) => page.getByTestId('dpb-drill');
const promptText = (page: Page) => page.getByTestId('dpb-prompt');
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
  mode: 'overlay' | 'relative';
  guided: boolean;
  root: number;
  quality: Quality;
  box: number;
  /** The cells to tap. */
  answer: Cell[];
  /** The roots drawn as squares. */
  roots: Cell[];
}

/** Read the prompt and the neck, and solve from the independent key. */
async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const mode = (await drill(page).getAttribute('data-mode')) as Task['mode'];
  const text = (await promptText(page).innerText()).trim();
  const roots = await markersOf(page, ['root']);
  expect(roots.length).toBeGreaterThan(0);
  if (mode === 'overlay') {
    const m = /^(Build|This is) ([A-G][♯♭]?)(m?) pentatonic box (\d)/.exec(text);
    expect(m, text).not.toBeNull();
    const root = chroma(m![2]!);
    const quality: Quality = m![3] ? 'minor' : 'major';
    const box = Number(m![4]);
    const given = await markersOf(page, ['root', 'third', 'fifth']);
    const shape = new Set(given.map(key));
    const answer = solveBox(root, quality, box, given).filter((c) => !shape.has(key(c)));
    return { mode, guided: m![1] === 'This is', root, quality, box, answer, roots };
  }
  const m = /(?:of|In this) ([A-G][♯♭]?)(m?)(?:’s relative| box)/.exec(text);
  expect(m, text).not.toBeNull();
  const root = chroma(m![1]!);
  const quality: Quality = m![2] ? 'minor' : 'major';
  const relative = (root + (quality === 'minor' ? 3 : 9)) % 12;
  const box = await markersOf(page, ['root', 'tone', 'target']);
  expect(box).toHaveLength(12);
  const answer = box.filter((c) => chromaAt(c) === relative);
  return { mode, guided: text.startsWith('In this'), root, quality, box: 0, answer, roots };
}

/** Answer whatever is on screen correctly and wait for the next prompt. */
async function solve(page: Page): Promise<Task> {
  const task = await readTask(page);
  if (task.guided) {
    // A worked example marks the notes to copy (rule 8).
    await expect(neck(page).getByTestId('marker-target')).toHaveCount(task.answer.length);
  }
  for (const c of task.answer) await cellAt(page, c).click();
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return task;
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

test.describe('M6-02 pentatonic boxes over their CAGED shapes', () => {
  test('minor boxes: a worked example, then built around the chord @smoke', async ({
    page,
  }, info) => {
    await freshStart(page);
    await masterSkills(page, ['C6.minor-shapes']);
    await focusSession(page, 'C7.minor-boxes');

    // The first card is minor box 1, around the E shape, as a worked example.
    const first = await readTask(page);
    expect(first).toMatchObject({ mode: 'overlay', guided: true, quality: 'minor', box: 1 });
    await expect(promptText(page)).toContainText('around the E shape');
    await expect(page.getByTestId('dpb-count')).toHaveText(`Found 0 of ${first.answer.length}`);

    // iPad landscape shows the whole neck (design §7); portrait a 12-fret
    // neck and a phone a window, each holding the box.
    const from = Number(await neck(page).getAttribute('data-fret-from'));
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    if (info.project.name === 'ipad-portrait') expect(to - from).toBe(12);
    else if (info.project.name !== 'iphone-smoke') expect([from, to]).toEqual([0, 15]);
    for (const c of [...first.roots, ...first.answer]) {
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

  test('a tap in the next box is that confusion, and the box is shown', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, ['C6.minor-shapes']);
    await focusSession(page, 'C7.minor-boxes');

    let task: Task | null = null;
    for (let i = 0; i < 20; i++) {
      const t = await readTask(page);
      if (!t.guided && t.box === 1) {
        task = t;
        break;
      }
      await solve(page);
    }
    expect(task).not.toBeNull();
    // Recall: no notes of the box are marked (rule 4).
    await expect(neck(page).getByTestId('marker-target')).toHaveCount(0);

    // Box 1 holds the root and the ♭3 on string 1 (frets r and r + 3, with r
    // the root's fret on string 6). Box 2 holds the ♭3 and the 4 (r + 3,
    // r + 5); box 5, below, the ♭7 and the root (r − 2, r). Tap box 2's 4, or
    // box 5's ♭7 when the neck shown ends before it.
    const r = Math.min(...task!.roots.filter((c) => c.string === 6).map((c) => c.fret));
    const shownTo = Number(await neck(page).getAttribute('data-fret-to'));
    const above = r + 5 <= shownTo;
    const wrong = { string: 1, fret: above ? r + 5 : r - 2 };
    const other = above ? 2 : 5;
    expect(chromaAt(wrong)).toBe((task!.root + (above ? 5 : 10)) % 12);
    await cellAt(page, wrong).click();

    await expect(page.getByTestId('feedback-wrong')).toContainText('pentatonic box 1');
    await expect(page.getByTestId('dpb-explain')).toContainText(`in box ${other}`);
    await expect(neck(page).getByTestId('marker-wrong')).toHaveCount(1);
    await expect(neck(page).getByTestId('marker-ghost')).toHaveCount(task!.answer.length);
    expect(await confusionPairs(page)).toEqual([
      ['penta-box:1@minor', `penta-box:${other}@minor`].sort(),
    ]);

    // Every cell is a comfortable target on iPad (design §7: ≥ 44pt).
    const box = await cellAt(page, { string: 3, fret: 7 }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('dpb-explain')).not.toContainText(`in box ${other}`);
  });

  test('the relative root in a box, and the own root as its confusion', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, ['C6.minor-shapes', 'C7.minor-boxes', 'C7.major-boxes']);
    await focusSession(page, 'C7.relative');

    // A worked example first: minor box 1 and its relative major's roots.
    const first = await readTask(page);
    expect(first).toMatchObject({ mode: 'relative', guided: true, quality: 'minor' });
    await solve(page);

    let task: Task | null = null;
    for (let i = 0; i < 20; i++) {
      const t = await readTask(page);
      if (!t.guided) {
        task = t;
        break;
      }
      await solve(page);
    }
    expect(task).not.toBeNull();
    // The box's dots carry no names before an answer (rule 4).
    await expect(neck(page).getByTestId('marker-tone').first()).toHaveText('');

    await cellAt(page, task!.roots[0]!).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('the relative');
    await expect(page.getByTestId('dpb-explain')).toContainText("the box's own root");
    await expect(page.getByTestId('dpb-relative')).toContainText(
      'the same notes at the same frets',
    );
    const [pair] = await confusionPairs(page);
    expect(pair).toHaveLength(2);
    expect(pair!.every((id) => id.startsWith('penta-relative:'))).toBe(true);
    expect(pair!.map((id) => id.split('@')[1]).sort()).toEqual(['major', 'minor']);
    await expectNoHorizontalOverflow(page);
  });
});
