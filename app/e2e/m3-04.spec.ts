import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { TARGET_MARKERS } from './helpers/targets';

// M3-04: D8 "Find the chord tone in a shape". A chord shape (open, barre or
// CAGED) is drawn on the neck; the learner taps the asked degree, or names a
// ringed note. The root comes first, then the 3rd and 5th, then the 7ths.
// Naming a ♭3 as a 3 is logged as that confusion (m3 vs M3).

/** Rule 7: natural notes on strings 6 and 5, and spelling triads (C5). */
const PREREQS = ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads'];

interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code): open
// strings as chromas, letters as chromas, and semitones above the root as degrees.
const OPEN: Record<number, number> = { 1: 4, 2: 11, 3: 7, 4: 2, 5: 9, 6: 4 };
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEGREE: Record<number, string> = { 0: '1', 3: 'b3', 4: '3', 7: '5', 10: 'b7', 11: '7' };
/** The degree's button name (screen-reader wording) and its prose in prompts. */
const SPOKEN: Record<string, string> = {
  '1': 'root',
  b3: 'flat 3rd',
  '3': '3rd',
  '5': '5th',
  b7: 'flat 7th',
  '7': '7th',
};
const PROSE: Record<string, string> = {
  root: '1',
  '♭3rd': 'b3',
  '3rd': '3',
  '5th': '5',
  '♭7th': 'b7',
  '7th': '7',
};

const drill = (page: Page) => page.getByTestId('d8-drill');
const promptText = (page: Page) => page.getByTestId('d8-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`);

function rootChroma(symbol: string): number {
  const letter = LETTER[symbol[0]!]!;
  const accidental = symbol[1] === '♯' ? 1 : symbol[1] === '♭' ? -1 : 0;
  return (letter + accidental + 12) % 12;
}

function degreeOf(root: number, c: Cell): string {
  return DEGREE[(OPEN[c.string]! + c.fret - root + 24) % 12]!;
}

async function cellsOf(markers: Locator): Promise<Cell[]> {
  const out: Cell[] = [];
  for (const m of await markers.all()) {
    out.push({
      string: Number(await m.getAttribute('data-string')),
      fret: Number(await m.getAttribute('data-fret')),
    });
  }
  return out;
}

interface Task {
  mode: 'tap' | 'name';
  guided: boolean;
  chord: string;
  root: number;
  /** Every note of the shape on the neck. */
  shape: Cell[];
  /** Tap: the asked degree. Name: the ringed note's degree, from the key. */
  degree: string;
  ringed: Cell | null;
}

/** Read the prompt and the shape on the neck. */
async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const mode = (await drill(page).getAttribute('data-mode')) as 'tap' | 'name';
  const text = (await promptText(page).innerText()).trim();
  const chord = /of ([A-G][♯♭]?(?:maj7|m7|m|7)?)(?=[\s.?]|$)/.exec(text)?.[1];
  expect(chord, text).toBeDefined();
  const root = rootChroma(chord!);
  const shape = await cellsOf(neck(page).locator('[data-testid^="marker-"]'));
  expect(shape.length).toBeGreaterThanOrEqual(4);
  const guided = /(marked|^The ringed note is)/.test(text);
  if (mode === 'name') {
    const [ringed] = await cellsOf(neck(page).locator(TARGET_MARKERS));
    expect(ringed).toBeDefined();
    return {
      mode,
      guided,
      chord: chord!,
      root,
      shape,
      degree: degreeOf(root, ringed!),
      ringed: ringed!,
    };
  }
  const asked = /the (root|♭?\d(?:rd|th))s? of/i.exec(text)?.[1];
  expect(asked, text).toBeDefined();
  return { mode, guided, chord: chord!, root, shape, degree: PROSE[asked!]!, ringed: null };
}

/** The shape's cells of a degree, from the key. */
function cellsOfDegree(task: Task, degree: string): Cell[] {
  return task.shape.filter((c) => degreeOf(task.root, c) === degree);
}

/** Answer whatever is on screen correctly and wait for the next prompt. */
async function solve(page: Page): Promise<Task> {
  const task = await readTask(page);
  if (task.mode === 'tap') {
    const cells = cellsOfDegree(task, task.degree);
    expect(cells.length, `${task.degree} of ${task.chord}`).toBeGreaterThan(0);
    if (task.guided) {
      // A worked example marks the notes to tap (rule 8).
      await expect(neck(page).locator(TARGET_MARKERS)).toHaveCount(cells.length);
    }
    await cellAt(page, cells[0]!).click();
  } else {
    await drill(page).getByRole('button', { name: SPOKEN[task.degree], exact: true }).click();
  }
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return task;
}

/** The root, 3rd and 5th stages' cards (M3-17): each tone, tapped then named. */
const TRIAD_TONES = (
  [
    ['C5.tones-roots', ['1@major', '1@minor']],
    ['C5.tones-thirds', ['3@major', 'b3@minor']],
    ['C5.tones-fifths', ['5@major', '5@minor']],
  ] as const
).flatMap(([skillId, tones]) =>
  tones.flatMap((t) => [
    { itemId: `chord-tone:${t}`, skillId },
    { itemId: `chord-tone-name:${t}`, skillId },
  ]),
);
const DUE = ['chord-tone-name:3@major', 'chord-tone-name:b3@minor'];

/**
 * File the 3rd stage's name cards for the 3rd and ♭3 as due reviews, at
 * `guideLevel`, and its other cards as not due, so the session serves just
 * those two, unguided and side by side. Reloads.
 */
async function seedThirdReviews(page: Page, guideLevel: 0 | 1 | 2): Promise<void> {
  await page.evaluate(
    async ({ prereqs, guideLevel, cards, due }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
      const now = Date.now();
      for (const { itemId, skillId } of cards) {
        tx.objectStore('cards').put({
          itemId,
          skillId,
          fsrs: {
            due: new Date(due.includes(itemId) ? now - DAY : now + 30 * DAY),
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
      for (const skillId of [...prereqs, 'C5.tones-roots']) {
        states.put({ skillId, status: 'mastered', guideLevel: 0, rollingAccuracy: 1 });
      }
      states.put({
        skillId: 'C5.tones-thirds',
        status: 'practising',
        guideLevel,
        rollingAccuracy: 0.85,
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { prereqs: PREREQS, guideLevel, cards: TRIAD_TONES, due: DUE },
  );
  await page.reload();
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

test.describe('M3-04 D8 finds the chord tone in a shape', () => {
  test('the root first, as a worked example, then both directions @smoke @layout', async ({
    page,
  }, info) => {
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C5.tones-roots');

    // The first card taps the root of a major shape, as a worked example
    // with the full guides: the outline is drawn (design §3.5, level 3).
    const first = await readTask(page);
    expect(first).toMatchObject({ mode: 'tap', guided: true, degree: '1' });
    await expect(neck(page).getByTestId('shape-outline')).toHaveCount(1);
    // The only root squares are the ringed answers: a worked example shows the
    // answer in its degree's shape (M6-11), so no unringed square gives it away.
    await expect(
      neck(page).locator('[data-testid="marker-root"]:not([data-emphasis])'),
    ).toHaveCount(0);
    await expect(neck(page).locator(TARGET_MARKERS)).toHaveCount(
      await neck(page).getByTestId('marker-root').count(),
    );

    // iPad landscape shows the whole neck (design §7); portrait a 12-fret
    // neck and a phone a window, each holding the whole shape.
    const from = Number(await neck(page).getAttribute('data-fret-from'));
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    if (info.project.name === 'ipad-portrait') expect(to - from).toBe(12);
    else if (info.project.name !== 'iphone-smoke') expect([from, to]).toEqual([0, 15]);
    for (const c of first.shape) {
      expect(c.fret).toBeGreaterThanOrEqual(from);
      expect(c.fret).toBeLessThanOrEqual(to);
    }
    if (info.project.name !== 'iphone-smoke') {
      // Every cell is a comfortable target on iPad (design §7: ≥ 44pt).
      const box = await cellAt(page, { string: 3, fret: 7 }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }

    const seen = new Set<string>();
    for (let i = 0; i < 24 && !(seen.has('tap:recall') && seen.has('name:recall')); i++) {
      const task = await solve(page);
      seen.add(`${task.mode}:${task.guided ? 'guided' : 'recall'}`);
      seen.add(`degree:${task.degree}`);
    }
    // Both directions, recalled without the worked example (rule 12).
    expect([...seen]).toEqual(expect.arrayContaining(['tap:recall', 'name:recall', 'degree:1']));
    await expectNoHorizontalOverflow(page);
  });

  test('naming a ♭3 as a 3 is a confusion, and both 3rds are offered', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedThirdReviews(page, 1);
    await focusSession(page, 'C5.tones-thirds');

    let task: Task | null = null;
    for (let i = 0; i < 2; i++) {
      const t = await readTask(page);
      if (t.mode === 'name' && t.degree === 'b3' && !t.guided) {
        task = t;
        break;
      }
      await solve(page);
    }
    expect(task).not.toBeNull();
    // Guide level 1: no outline, no root squares, no note names (rule 9).
    await expect(neck(page).getByTestId('shape-outline')).toHaveCount(0);
    await expect(neck(page).getByTestId('marker-root')).toHaveCount(0);
    const buttons = drill(page)
      .getByRole('group', { name: /ringed note/ })
      .getByRole('button');
    await expect(buttons).toHaveText(['R', '♭3', '3', '5']);

    await drill(page).getByRole('button', { name: '3rd', exact: true }).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('the ♭3rd of');
    await expect(page.getByTestId('d8-explain')).toContainText('not the 3rd');
    // Feedback names every note's degree, by shape as well as colour.
    await expect(neck(page).getByTestId('marker-correct')).toHaveText('♭3');
    await expect(neck(page).getByTestId('marker-fifth').first()).toHaveText('5');
    await expect(neck(page).getByTestId('marker-root').first()).toHaveText('R');
    await expectNoHorizontalOverflow(page);
    expect(await confusionPairs(page)).toEqual([['M3', 'm3']]);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('the outline and root squares show from guide level 2', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedThirdReviews(page, 2);
    await focusSession(page, 'C5.tones-thirds');

    const task = await readTask(page);
    expect(task).toMatchObject({ mode: 'name', guided: false });
    await expect(neck(page).getByTestId('shape-outline')).toHaveCount(1);
    const roots = await cellsOf(neck(page).getByTestId('marker-root'));
    expect(roots.length).toBeGreaterThan(0);
    for (const r of roots) expect(degreeOf(task.root, r)).toBe('1');
  });

  test('7th chords offer both 7ths, and the ♭7 is found in the shape', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, [
      ...PREREQS,
      'C5.tones-roots',
      'C5.tones-thirds',
      'C5.tones-fifths',
      'C5.sevenths',
    ]);
    await focusSession(page, 'C5.tones-sevenths');

    // The 3rd of a 7 chord comes first, then its ♭7.
    const first = await readTask(page);
    expect(first).toMatchObject({ mode: 'tap', guided: true, degree: '3' });
    expect(first.chord).toMatch(/7$/);
    const seen = new Set<string>();
    for (let i = 0; i < 24 && !(seen.has('tap:b7') && seen.has('name')); i++) {
      const task = await readTask(page);
      if (task.mode === 'name') {
        await expect(
          drill(page)
            .getByRole('group', { name: /ringed note/ })
            .getByRole('button'),
        ).toHaveText(['R', '♭3', '3', '5', '♭7', '7']);
        seen.add('name');
      } else {
        seen.add(`tap:${task.degree}`);
      }
      await solve(page);
    }
    expect([...seen]).toEqual(expect.arrayContaining(['tap:3', 'tap:b7', 'name']));
    await expectNoHorizontalOverflow(page);
  });
});
