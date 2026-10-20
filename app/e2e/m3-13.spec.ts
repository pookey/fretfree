import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M3-13: D36 "What chord is this?". A voicing (open, barre or CAGED shape)
// is drawn on the neck or as a chord diagram, with no root, label or name;
// the learner names its root, then its quality. Wrong answers label every
// dot with its degree and say which note decided the quality; naming a
// minor chord major is logged as that confusion.

/** Rule 7: finding the tones in a shape, and what that needs. */
const PREREQS = [
  'F2.string6-naturals',
  'F2.string5-naturals',
  'C5.triads',
  'C5.tones-roots',
  'C5.tones-thirds',
];

interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code): open
// strings as MIDI notes, and the semitones above the root of each quality.
const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** Each quality's button name (screen-reader wording) and its intervals, 5th optional. */
const QUALITIES: readonly (readonly [string, readonly number[]])[] = [
  ['major', [4]],
  ['minor', [3]],
  ['dominant seventh', [4, 10]],
  ['major seventh', [4, 11]],
  ['minor seventh', [3, 10]],
  ['half-diminished seventh', [3, 6, 10]],
  ['suspended second', [2]],
  ['suspended fourth', [5]],
];

const drill = (page: Page) => page.getByTestId('d36-drill');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const chart = (page: Page) => drill(page).getByRole('img', { name: /diagram:/ });
const roots = (page: Page) => drill(page).getByRole('group', { name: 'Root' });
const qualities = (page: Page) => drill(page).getByRole('group', { name: 'Quality' });

async function cellsOf(dots: Locator): Promise<Cell[]> {
  const out: Cell[] = [];
  for (const m of await dots.all()) {
    out.push({
      string: Number(await m.getAttribute('data-string')),
      fret: Number((await m.getAttribute('data-fret')) ?? 0),
    });
  }
  return out;
}

interface Task {
  display: 'neck' | 'diagram';
  guided: boolean;
  cells: Cell[];
  /** The root's button text, sharps spelled. */
  root: string;
  /** The quality's button name. */
  quality: string;
}

/** The chord from its dots: the lowest note is the root, and the intervals above it decide. */
function nameOf(cells: readonly Cell[]): { root: string; quality: string } {
  const midis = cells.map((c) => OPEN_MIDI[c.string]! + c.fret);
  const bass = Math.min(...midis);
  const intervals = new Set(midis.map((m) => (m - bass) % 12));
  const fits = ([, need]: readonly [string, readonly number[]]) => {
    const allowed = new Set([0, 7, ...need]);
    return need.every((i) => intervals.has(i)) && [...intervals].every((i) => allowed.has(i));
  };
  const quality = QUALITIES.find(fits)?.[0];
  expect(quality, `intervals ${[...intervals].join(' ')}`).toBeDefined();
  return { root: SHARPS[bass % 12]!, quality: quality! };
}

/** Read the voicing from the neck or the chart. */
async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const display = (await drill(page).getAttribute('data-display')) as 'neck' | 'diagram';
  const cells =
    display === 'neck'
      ? await cellsOf(neck(page).locator('[data-testid^="marker-"]'))
      : await cellsOf(chart(page).locator('[data-testid="chord-dot"], [data-testid="chord-open"]'));
  expect(cells.length).toBeGreaterThanOrEqual(3);
  const guided = /^This is/.test(await page.getByTestId('d36-prompt').innerText());
  return { display, guided, cells, ...nameOf(cells) };
}

async function answer(page: Page, root: string, quality: string): Promise<void> {
  await roots(page).getByRole('button', { name: root, exact: true }).click();
  await qualities(page).getByRole('button', { name: quality, exact: true }).click();
}

/** Answer whatever is on screen correctly and wait for the next prompt. */
async function solve(page: Page): Promise<Task> {
  const task = await readTask(page);
  await answer(page, task.root, task.quality);
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return task;
}

/** A recall prompt prints nothing that names the chord (M1-25). */
async function expectAnswerHidden(page: Page, task: Task): Promise<void> {
  await expect(page.getByTestId('d36-prompt')).toHaveText('What chord is this?');
  if (task.display === 'neck') {
    await expect(neck(page).getByTestId('marker-root')).toHaveCount(0);
    for (const m of await neck(page).locator('[data-testid^="marker-"]').all()) {
      await expect(m).toHaveText('');
    }
  } else {
    await expect(chart(page)).toHaveAccessibleName(/^Chord diagram:/);
    await expect(chart(page).locator('[data-style="root"]')).toHaveCount(0);
    await expect(chart(page).locator('figcaption')).toHaveCount(0);
  }
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

test.describe('M3-13 D36 names the chord from its dots', () => {
  test('a worked example, then recall on the neck and the chart @smoke', async ({ page }, info) => {
    // Up to 20 cards: about 20 s on an idle machine, past 30 s under lane load.
    test.slow();
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C5.name-triads');

    // The first card is an E-shape major chord, walked through (rule 8).
    const first = await readTask(page);
    expect(first).toMatchObject({ guided: true, quality: 'major' });
    await expect(page.getByTestId('d36-explain')).toContainText('The root is');
    await expect(page.getByTestId('d36-explain')).toContainText('a major 3rd above');
    await expect(roots(page).getByRole('button')).toHaveCount(12);
    await expect(qualities(page).getByRole('button')).toHaveCount(8);
    // The quality waits for a root.
    await expect(
      qualities(page).getByRole('button', { name: 'major', exact: true }),
    ).toBeDisabled();

    if (info.project.name !== 'iphone-smoke') {
      // Answer buttons are comfortable targets on iPad (design §7: ≥ 44pt).
      const box = await roots(page).getByRole('button').first().boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }

    const seen = new Set<string>();
    const done = () => seen.has('recall:neck') && seen.has('recall:diagram');
    for (let i = 0; i < 20 && !done(); i++) {
      const task = await readTask(page);
      if (!task.guided) {
        await expectAnswerHidden(page, task);
        if (task.display === 'neck' && info.project.name !== 'iphone-smoke') {
          // iPad landscape shows the whole neck (design §7); portrait a 12-fret neck.
          const from = Number(await neck(page).getAttribute('data-fret-from'));
          const to = Number(await neck(page).getAttribute('data-fret-to'));
          if (info.project.name === 'ipad-portrait') expect(to - from).toBe(12);
          else expect([from, to]).toEqual([0, 15]);
        }
      }
      await solve(page);
      seen.add(`${task.guided ? 'guided' : 'recall'}:${task.display}`);
      seen.add(task.quality);
    }
    expect([...seen]).toEqual(expect.arrayContaining(['recall:neck', 'recall:diagram']));
    await expectNoHorizontalOverflow(page);
  });

  test('naming a minor chord major labels the degrees and logs the confusion', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C5.name-triads');

    // Answer right until a recall prompt on the neck, then swap its quality.
    let task: Task | null = null;
    for (let i = 0; i < 20; i++) {
      const t = await readTask(page);
      if (!t.guided && t.display === 'neck') {
        task = t;
        break;
      }
      await solve(page);
    }
    expect(task).not.toBeNull();
    const wrong = task!.quality === 'major' ? 'minor' : 'major';
    await answer(page, task!.root, wrong);

    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    const explain = page.getByTestId('d36-explain');
    await expect(explain).toContainText(`a ${task!.quality} 3rd above`);
    await expect(explain).toContainText(/^It's .+, not /);
    // Every dot is labelled with its degree, by shape as well as colour.
    await expect(neck(page).getByTestId('marker-root').first()).toHaveText('R');
    await expect(neck(page).getByTestId('marker-third').first()).toHaveText(
      task!.quality === 'major' ? '3' : '♭3',
    );
    await expect(neck(page).getByTestId('marker-fifth').first()).toHaveText('5');
    await expect(qualities(page).getByRole('button', { name: wrong, exact: true })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    await expect(
      qualities(page).getByRole('button', { name: task!.quality, exact: true }),
    ).toHaveAttribute('data-state', 'expected');
    expect(await confusionPairs(page)).toEqual([['triad:maj', 'triad:min']]);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('an open chord on the chart labels every string, open ones too', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    // Every draw at 0.3: a natural root of E, drawn as a chart, so the
    // E-shape cards are the open E and Em chords.
    await page.addInitScript(() => {
      Math.random = () => 0.3;
    });
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C5.name-triads');

    let task: Task | null = null;
    for (let i = 0; i < 8; i++) {
      const t = await readTask(page);
      if (!t.guided) {
        task = t;
        break;
      }
      await solve(page);
    }
    expect(task).toMatchObject({ display: 'diagram', root: 'E' });
    // E 022100 or Em 022000: the low and high E strings and the B string ring open.
    const opens = chart(page).getByTestId('chord-open');
    await expect(opens).toHaveCount(task!.quality === 'major' ? 3 : 4);
    await expectAnswerHidden(page, task!);
    await expect(opens.first()).toHaveText('');

    await answer(page, 'E', task!.quality === 'major' ? 'minor' : 'major');
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    // Every dot is labelled with its degree, by shape as well as colour.
    const dots = chart(page).locator('[data-testid="chord-dot"], [data-testid="chord-open"]');
    await expect(dots).toHaveCount(6);
    for (const d of await dots.all()) await expect(d).toHaveText(/^(R|♭?3|5)$/);
    await expect(opens.first()).toHaveAttribute('data-style', 'root');
    await expect(opens.first()).toHaveText('R');
    await expect(chart(page).locator('[data-testid="chord-open"][data-style="fifth"]')).toHaveText(
      '5',
    );
    if (task!.quality === 'minor') {
      // Em's open G string is the ♭3 that made it minor.
      await expect(
        chart(page).locator('[data-testid="chord-open"][data-style="third"]'),
      ).toHaveText('♭3');
    }
    await expect(page.getByTestId('d36-explain')).toContainText(`a ${task!.quality} 3rd above E`);
  });

  test('7th chords bring in 7 and maj7 side by side', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, [...PREREQS, 'C5.name-triads', 'C5.sevenths', 'C5.tones-sevenths']);
    await focusSession(page, 'C5.name-sevenths');

    const first = await readTask(page);
    expect(first).toMatchObject({ guided: true, quality: 'dominant seventh' });
    await expect(page.getByTestId('d36-explain')).toContainText('a minor 7th');
    const seen = new Set<string>();
    for (let i = 0; i < 24 && !seen.has('major seventh'); i++) {
      seen.add((await solve(page)).quality);
    }
    expect([...seen]).toEqual(expect.arrayContaining(['dominant seventh', 'major seventh']));
  });
});
