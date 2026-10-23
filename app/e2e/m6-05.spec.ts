import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { TARGET_MARKERS } from './helpers/targets';

// M6-05: I2 arpeggio skills on D8. After C5's 3rd and 7th of the 7th-chord
// shapes, I2 finds their root, then their 5th, in both directions, so every
// tone of the 7, maj7 and m7 arpeggios is found in a shape.

/** Design §5: Arpeggios opens after CAGED and Pentatonic, and C5's 7th-chord tones. */
const PREREQS = ['C5.tones-sevenths', 'C6.dominant7-shapes', 'C7.minor-boxes'];

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
  shape: Cell[];
  /** Tap: the asked degree. Name: the ringed note's degree, from the key. */
  degree: string;
}

async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const mode = (await drill(page).getAttribute('data-mode')) as 'tap' | 'name';
  const text = (await promptText(page).innerText()).trim();
  const chord = /of ([A-G][♯♭]?(?:maj7|m7|m|7)?)(?=[\s.?]|$)/.exec(text)?.[1];
  expect(chord, text).toBeDefined();
  const root = rootChroma(chord!);
  const shape = await cellsOf(neck(page).locator('[data-testid^="marker-"]'));
  const guided = /(marked|^The ringed note is)/.test(text);
  if (mode === 'name') {
    const [ringed] = await cellsOf(neck(page).locator(TARGET_MARKERS));
    expect(ringed).toBeDefined();
    return { mode, guided, chord: chord!, root, shape, degree: degreeOf(root, ringed!) };
  }
  const asked = /the (root|♭?\d(?:rd|th))s? of/i.exec(text)?.[1];
  expect(asked, text).toBeDefined();
  return { mode, guided, chord: chord!, root, shape, degree: PROSE[asked!]! };
}

/** Answer whatever is on screen correctly and wait for the next prompt. */
async function solve(page: Page): Promise<Task> {
  const task = await readTask(page);
  if (task.mode === 'tap') {
    const cells = task.shape.filter((c) => degreeOf(task.root, c) === task.degree);
    expect(cells.length, `${task.degree} of ${task.chord}`).toBeGreaterThan(0);
    await cellAt(page, cells[0]!).click();
  } else {
    await drill(page).getByRole('button', { name: SPOKEN[task.degree], exact: true }).click();
  }
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return task;
}

test.describe('M6-05 I2 arpeggios on D8', () => {
  test('the root of a 7th-chord shape, as a worked example, then both directions @smoke', async ({
    page,
  }) => {
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'I2.sevenths-roots');

    // The first card taps the root of a dominant 7 shape, as a worked example.
    const first = await readTask(page);
    expect(first).toMatchObject({ mode: 'tap', guided: true, degree: '1' });
    expect(first.chord).toMatch(/^[A-G][♯♭]?7$/);

    const seen = new Set<string>();
    for (let i = 0; i < 24 && !(seen.has('tap:recall') && seen.has('name:recall')); i++) {
      const task = await readTask(page);
      expect(task.degree).toBe('1');
      expect(task.chord).toMatch(/7$/);
      if (task.mode === 'name') {
        // Both 3rds and both 7ths are offered, so the quality stays in play (rule 6).
        await expect(
          drill(page)
            .getByRole('group', { name: /ringed note/ })
            .getByRole('button'),
        ).toHaveText(['R', '♭3', '3', '5', '♭7', '7']);
      }
      await solve(page);
      seen.add(`${task.mode}:${task.guided ? 'guided' : 'recall'}`);
    }
    // Both directions, recalled without the worked example (rule 12).
    expect([...seen]).toEqual(expect.arrayContaining(['tap:recall', 'name:recall']));
    await expectNoHorizontalOverflow(page);
  });

  test('the 5th stage finds the 5th in shapes that hold one @layout', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, [...PREREQS, 'I2.sevenths-roots']);
    await focusSession(page, 'I2.sevenths-fifths');

    const first = await readTask(page);
    expect(first).toMatchObject({ mode: 'tap', guided: true, degree: '5' });

    // iPad landscape shows the whole neck (design §7), and every cell is a
    // comfortable target (≥ 44pt).
    if (info.project.name !== 'ipad-portrait') {
      const from = Number(await neck(page).getAttribute('data-fret-from'));
      const to = Number(await neck(page).getAttribute('data-fret-to'));
      expect([from, to]).toEqual([0, 15]);
    }
    const box = await cellAt(page, { string: 3, fret: 7 }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);

    const seen = new Set<string>();
    for (let i = 0; i < 24 && !(seen.has('tap:recall') && seen.has('name:recall')); i++) {
      // `solve` fails a tap card whose shape has no 5th to tap.
      const task = await solve(page);
      expect(task.degree).toBe('5');
      expect(task.chord).toMatch(/7$/);
      seen.add(`${task.mode}:${task.guided ? 'guided' : 'recall'}`);
    }
    expect([...seen]).toEqual(expect.arrayContaining(['tap:recall', 'name:recall']));
    await expectNoHorizontalOverflow(page);
  });
});
