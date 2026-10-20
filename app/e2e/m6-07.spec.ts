import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M6-07: I7, the major scale in five positions, on the box-overlay drill. A
// position card draws its major pentatonic box and the learner fills in the
// rest; a run card draws only the roots and the learner plays the position
// up from a degree, in order. Starting a run on another degree's lowest note
// is logged against that degree's run card.

interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code).
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN_MIDI: Record<number, number> = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];
const DEGREE: Record<string, number> = {
  root: 1,
  '2nd': 2,
  '3rd': 3,
  '4th': 4,
  '5th': 5,
  '6th': 6,
  '7th': 7,
};

const chroma = (name: string) =>
  (CHROMATIC.indexOf(name[0]!) + (name[1] === '♯' ? 1 : name[1] === '♭' ? 11 : 0)) % 12;
const midiOf = (c: Cell) => OPEN_MIDI[c.string]! + c.fret;
const semis = (c: Cell, tonic: number) => (((midiOf(c) - tonic) % 12) + 12) % 12;
const degreeOf = (c: Cell, tonic: number) => MAJOR.indexOf(semis(c, tonic)) + 1;
const key = (c: Cell) => `s${c.string}f${c.fret}`;
const byPitch = (cells: Cell[]) => [...cells].sort((a, b) => midiOf(a) - midiOf(b));

/** Major pentatonic box N: two notes per string from string 6, from the scale's Nth note. */
function boxAt(tonic: number, box: number, startFret: number): Cell[] {
  const cells: Cell[] = [];
  let midi = OPEN_MIDI[6]! + startFret;
  let i = box - 1;
  for (let s = 6; s >= 1; s--) {
    for (let k = 0; k < 2; k++) {
      if (cells.length > 0) {
        i = (i + 1) % 5;
        do midi++;
        while (midi % 12 !== (tonic + PENTA[i]!) % 12);
      }
      cells.push({ string: s, fret: midi - OPEN_MIDI[s]! });
    }
  }
  return cells;
}

/** The box N that holds every given note. */
function solveBox(tonic: number, box: number, given: Cell[]): Cell[] {
  for (let start = 0; start <= 15; start++) {
    if ((OPEN_MIDI[6]! + start) % 12 !== (tonic + PENTA[box - 1]!) % 12) continue;
    const cells = boxAt(tonic, box, start);
    const keys = new Set(cells.map(key));
    if (given.every((g) => keys.has(key(g)))) return cells;
  }
  throw new Error(`No box ${box} holds ${given.map(key).join(' ')}`);
}

/**
 * The position around a box: each scale note between two box notes on
 * whichever of their strings keeps it nearer the box's frets (the lower
 * fret on a tie), plus the scale note just past each end on the same string
 * when it is inside the box's frets.
 */
function fillPosition(tonic: number, box: Cell[]): Cell[] {
  const notes = byPitch(box);
  const from = Math.min(...box.map((c) => c.fret));
  const to = Math.max(...box.map((c) => c.fret));
  const inScale = (m: number) => MAJOR.includes((((m - tonic) % 12) + 12) % 12);
  const outside = (f: number) => (f < from ? from - f : f > to ? f - to : 0);
  const cellOf = (string: number, midi: number) => ({ string, fret: midi - OPEN_MIDI[string]! });
  const out: Cell[] = [];
  const first = notes[0]!;
  const low = cellOf(first.string, midiOf(first) - (inScale(midiOf(first) - 1) ? 1 : 2));
  if (low.fret >= from) out.push(low);
  notes.forEach((a, i) => {
    out.push(a);
    const b = notes[i + 1];
    if (!b) return;
    for (let m = midiOf(a) + 1; m < midiOf(b); m++) {
      if (!inScale(m)) continue;
      const options = [cellOf(a.string, m), cellOf(b.string, m)].filter((c) => c.fret >= 0);
      options.sort((x, y) => outside(x.fret) - outside(y.fret) || x.fret - y.fret);
      out.push(options[0]!);
    }
  });
  const last = notes[notes.length - 1]!;
  const high = cellOf(last.string, midiOf(last) + (inScale(midiOf(last) + 1) ? 1 : 2));
  if (high.fret <= to) out.push(high);
  return out;
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
  mode: 'position' | 'run';
  guided: boolean;
  tonic: number;
  position: number;
  degree: number;
  /** The whole position, low to high. */
  notes: Cell[];
  /** The cells to tap, in order. */
  answer: Cell[];
  /** The roots drawn as squares. */
  roots: Cell[];
}

/** Read the prompt and the neck, and solve from the independent key. */
async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const mode = (await drill(page).getAttribute('data-mode')) as Task['mode'];
  const text = (await promptText(page).innerText()).trim();
  const m = /^(This is|Fill in|Play) ([A-G][♯♭]?) major position (\d)(?:,| around| up| from)/.exec(
    text,
  );
  expect(m, text).not.toBeNull();
  const tonic = chroma(m![2]!);
  const position = Number(m![3]);
  const degree = mode === 'run' ? DEGREE[/from the (\w+)/.exec(text)![1]!]! : 1;
  const guided = m![1] === 'This is';
  const roots = await markersOf(page, ['root']);
  if (guided) {
    // A worked example marks every note to tap (rule 8).
    const targets = byPitch(await markersOf(page, ['target']));
    return { mode, guided, tonic, position, degree, notes: [], answer: targets, roots };
  }
  expect(roots.length).toBeGreaterThan(0);
  const box =
    mode === 'position'
      ? await markersOf(page, ['root', 'tone'])
      : solveBox(tonic, position, roots);
  expect(box).toHaveLength(12);
  const notes = byPitch(fillPosition(tonic, box));
  const boxKeys = new Set(box.map(key));
  let answer: Cell[];
  if (mode === 'position') answer = notes.filter((c) => !boxKeys.has(key(c)));
  else {
    const first = notes.findIndex((c) => degreeOf(c, tonic) === degree);
    const last = notes.map((c) => degreeOf(c, tonic)).lastIndexOf(degree);
    answer = notes.slice(first, last + 1);
  }
  return { mode, guided, tonic, position, degree, notes, answer, roots };
}

/** Answer whatever is on screen correctly and wait for the next prompt. */
async function solve(page: Page): Promise<Task> {
  const task = await readTask(page);
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

test.describe('M6-07 major scale in five positions', () => {
  test('positions: a worked example, then filled in around the box @smoke', async ({
    page,
  }, info) => {
    await freshStart(page);
    await masterSkills(page, ['C7.major-boxes']);
    await focusSession(page, 'I7.positions');

    // The first card is position 1, around box 1 and the E shape, as a worked example.
    const first = await readTask(page);
    expect(first).toMatchObject({ mode: 'position', guided: true, position: 1 });
    await expect(promptText(page)).toContainText('around box 1 (the E shape)');
    await expect(page.getByTestId('dpb-count')).toHaveText(`Found 0 of ${first.answer.length}`);

    // iPad landscape shows the whole neck (design §7); portrait a 12-fret
    // neck and a phone a window, each holding the position.
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
      if (!task.guided) {
        // The answer is the 4ths and 7ths the box leaves out.
        expect(new Set(task.answer.map((c) => degreeOf(c, task.tonic)))).toEqual(new Set([4, 7]));
        recalled++;
      }
    }
    expect(recalled).toBe(2);
    await expectNoHorizontalOverflow(page);
  });

  test('runs from a degree, in order, and a wrong start is that confusion', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, ['C7.major-boxes', 'I7.positions', 'I7.root-runs']);
    await focusSession(page, 'I7.degree-runs');

    // A worked example first: position 1 from the 2nd.
    const first = await readTask(page);
    expect(first).toMatchObject({ mode: 'run', guided: true, position: 1, degree: 2 });
    await solve(page);

    // Solve one run from recall, then start the next one on its lowest root.
    let solved = 0;
    let task: Task | null = null;
    for (let i = 0; i < 20; i++) {
      const t = await readTask(page);
      if (!t.guided && solved > 0) {
        task = t;
        break;
      }
      await solve(page);
      if (!t.guided) {
        expect(degreeOf(t.answer[0]!, t.tonic)).toBe(t.degree);
        expect(degreeOf(t.answer[t.answer.length - 1]!, t.tonic)).toBe(t.degree);
        solved++;
      }
    }
    expect(task).not.toBeNull();
    // Recall: only the roots are drawn (rule 4).
    await expect(neck(page).getByTestId('marker-target')).toHaveCount(0);
    await expect(neck(page).getByTestId('marker-tone')).toHaveCount(0);
    await expect(page.getByTestId('dpb-count')).toHaveText(`Played 0 of ${task!.answer.length}`);

    const lowestRoot = byPitch(task!.roots)[0]!;
    expect(key(lowestRoot)).toBe(key(task!.notes.find((c) => degreeOf(c, task!.tonic) === 1)!));
    await cellAt(page, lowestRoot).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText(
      `position ${task!.position} from the`,
    );
    await expect(page.getByTestId('dpb-explain')).toContainText('the lowest root');
    await expect(page.getByTestId('dps-run')).toBeVisible();
    await expect(neck(page).getByTestId('marker-ghost')).toHaveCount(task!.answer.length);
    const pairs = await confusionPairs(page);
    expect(pairs).toEqual([
      [`scale-run:${task!.position}@1`, `scale-run:${task!.position}@${task!.degree}`].sort(),
    ]);

    // Every cell is a comfortable target on iPad (design §7: ≥ 44pt).
    const cell = await cellAt(page, { string: 3, fret: 7 }).boundingBox();
    expect(cell!.width).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });

  test('a tap in the next position is that confusion', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, ['C7.major-boxes']);
    await focusSession(page, 'I7.positions');

    let task: Task | null = null;
    for (let i = 0; i < 20; i++) {
      const t = await readTask(page);
      if (!t.guided && t.position === 1) {
        task = t;
        break;
      }
      await solve(page);
    }
    expect(task).not.toBeNull();
    // On string 6, position 1 plays the 7, the root and the 2 (r − 1, r and
    // r + 2, with r the root's fret). Position 2 also plays the 3 there
    // (r + 4); position 5, below, the 6 (r − 3). Tap position 2's 3, or
    // position 5's 6 when the neck shown ends before it.
    const r = Math.min(...task!.roots.filter((c) => c.string === 6).map((c) => c.fret));
    const shownTo = Number(await neck(page).getAttribute('data-fret-to'));
    const above = r + 4 <= shownTo;
    const wrong = { string: 6, fret: above ? r + 4 : r - 3 };
    const other = above ? 2 : 5;
    expect(degreeOf(wrong, task!.tonic)).toBe(above ? 3 : 6);
    expect(task!.notes.map(key)).not.toContain(key(wrong));
    await cellAt(page, wrong).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('position 1');
    await expect(page.getByTestId('dpb-explain')).toContainText(`in position ${other}`);
    expect(await confusionPairs(page)).toEqual([
      ['scale-position:1', `scale-position:${other}`].sort(),
    ]);
  });
});
