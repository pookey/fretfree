import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName } from './helpers';
import { seedDueItems } from './helpers/octaves';

// M2-03: D4 "Octave finder". On iPad "tap every G" runs across the whole
// neck, with each tap marked at once and the round graded on completion
// time; compact screens run it region by region. Single octave items show
// the G–B shift.

interface Cell {
  string: number;
  fret: number;
}

const EVERY_G = [{ itemId: 'octaves:G', skillId: 'C1.every-octave' }];

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`);
const prompt = (page: Page) => page.getByTestId('d4-prompt');
const same = (a: Cell) => (b: Cell) => a.string === b.string && a.fret === b.fret;

async function markerCells(page: Page, style: string): Promise<Cell[]> {
  return neck(page)
    .getByTestId(`marker-${style}`)
    .evaluateAll((els) =>
      els.map((el) => ({
        string: Number(el.getAttribute('data-string')),
        fret: Number(el.getAttribute('data-fret')),
      })),
    );
}

/** Every cell sounding `note` in frets `from`–`to` (an independent answer key). */
function cellsOf(note: string, from = 0, to = 12): Cell[] {
  const out: Cell[] = [];
  for (let string = 1; string <= 6; string++) {
    for (let fret = from; fret <= to; fret++) {
      if (noteName(string, fret) === note) out.push({ string, fret });
    }
  }
  return out;
}

/**
 * Start a session focused on one seeded item (`/session?item=<id>`), so the
 * spec never depends on which drill an unfocused session serves first. Waits
 * until the session is planned and its drill is on screen; under a loaded
 * machine that can outlast the default assertion timeout.
 */
async function focusItem(page: Page, itemId: string): Promise<void> {
  await page.goto(`/session?${new URLSearchParams({ item: itemId }).toString()}`);
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
}

async function startEveryG(page: Page, guideLevel: 0 | 1 | 2 | 3 = 2): Promise<Cell> {
  await freshStart(page);
  await seedDueItems(page, EVERY_G, guideLevel);
  await focusItem(page, EVERY_G[0]!.itemId);
  await expect(prompt(page)).toContainText('Tap every G');
  const [dot] = await markerCells(page, 'root');
  expect(noteName(dot!.string, dot!.fret)).toBe('G');
  return dot!;
}

/** The frets the prompt asks about: a region on compact screens, else frets 0–12. */
async function askedFrets(page: Page): Promise<[number, number]> {
  const m = /in frets (\d+)–(\d+)/.exec(await prompt(page).innerText());
  return m ? [Number(m[1]), Number(m[2])] : [0, 12];
}

test.describe('M2-03 D4 octave finder', () => {
  test('taps every G, region by region on compact screens @smoke', async ({ page }) => {
    const dot = await startEveryG(page);
    // Compact screens ask region by region; the iPad asks for the whole neck at once.
    const region = page.getByTestId('d4-region');
    const rounds =
      (await region.count()) > 0 ? Number(/of (\d+)/.exec(await region.innerText())![1]) : 1;
    for (let round = 0; round < rounds; round++) {
      const [from, to] = await askedFrets(page);
      const found = await markerCells(page, 'correct');
      const todo = cellsOf('G', from, to).filter((c) => !same(dot)(c) && !found.some(same(c)));
      expect(todo.length).toBeGreaterThan(0);
      for (const cell of todo) await cellAt(page, cell).click();
    }
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ G');
    await expect(page.getByTestId('d4-explain')).toHaveText("That's every G in frets 0–12.");
    await expectNoHorizontalOverflow(page);
  });

  test('shows the whole neck on iPad, marking each G as it is found', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    const dot = await startEveryG(page);
    await expect(page.getByTestId('d4-region')).toHaveCount(0);
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    expect(to).toBeGreaterThanOrEqual(12);
    if (to > 12) await expect(page.getByTestId('dimmed-fret')).toHaveCount(to - 12);

    // Neck cells stay at least 44pt, even the narrowest fret.
    const box = (await cellAt(page, { string: 1, fret: to }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    const targets = cellsOf('G').filter((c) => !same(dot)(c));
    expect(targets).toHaveLength(6);
    await expect(page.getByTestId('d4-count')).toHaveText('Found 0 of 6');
    for (const [i, cell] of targets.entries()) {
      await cellAt(page, cell).click();
      if (i < targets.length - 1) {
        // Per-target feedback: the cell turns green and the count goes up.
        await expect(page.getByTestId('d4-count')).toHaveText(`Found ${i + 1} of 6`);
        expect(await markerCells(page, 'correct')).toContainEqual(cell);
        await expect(page.getByTestId('feedback-correct')).toHaveCount(0);
      }
    }
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ G');
  });

  test('a wrong tap ends the round and rings the Gs left', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    const dot = await startEveryG(page, 1);
    // Guides at 1: no count, and no string names that would name a G.
    await expect(page.getByTestId('d4-count')).toHaveText('Found 0');
    await expect(neck(page).getByTestId('string-name')).toHaveCount(0);

    const [first] = cellsOf('G').filter((c) => !same(dot)(c));
    await cellAt(page, first!).click();
    await cellAt(page, { string: 4, fret: 6 }).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('That was G.');
    await expect(page.getByTestId('d4-explain')).toHaveText(
      'You tapped G♯ (string 4, fret 6). 5 are still to find, ringed on the neck.',
    );
    expect(await markerCells(page, 'wrong')).toEqual([{ string: 4, fret: 6 }]);
    expect(await markerCells(page, 'ghost')).toHaveLength(5);
    expect(await markerCells(page, 'correct')).toEqual([first]);
  });

  test('"Done" with Gs left is wrong', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await startEveryG(page);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    expect(await markerCells(page, 'ghost')).toHaveLength(6);
  });

  test('a single octave across the G–B shift: the unshifted fret is wrong', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await seedDueItems(page, [{ itemId: 'octave:s4f5→s2', skillId: 'C1.octaves-gb-shift' }], 1);
    await focusItem(page, 'octave:s4f5→s2');
    await expect(prompt(page)).toHaveText('Tap the octave of G on string 2');
    expect(await markerCells(page, 'root')).toEqual([{ string: 4, fret: 5 }]);

    // Narrowest scope: only string 2 is live.
    await cellAt(page, { string: 3, fret: 7 }).click();
    await expect(page.getByTestId('feedback-wrong')).toHaveCount(0);

    // Two frets up, as below the G string: one fret short across the G–B shift.
    await cellAt(page, { string: 2, fret: 7 }).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText(
      'That was 2 strings up (toward string 1), 3 frets higher.',
    );
    await expect(page.getByTestId('d4-explain')).toContainText('without the G–B shift');
    expect(await markerCells(page, 'correct')).toEqual([{ string: 2, fret: 8 }]);

    // The miss comes back; the shifted fret is right.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(prompt(page)).toHaveText('Tap the octave of G on string 2');
    await cellAt(page, { string: 2, fret: 8 }).click();
    await expect(page.getByTestId('feedback-correct')).toHaveText(
      '✓ 2 strings up (toward string 1), 3 frets higher',
    );
  });
});

test.describe('M2-03 D4 on a phone in portrait', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('runs "tap every G" region by region, starting at the dot', async ({ page }) => {
    const dot = await startEveryG(page);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId('d4-region')).toHaveText(`Region ${i + 1} of 3`);
      const [from, to] = await askedFrets(page);
      if (i === 0) expect(dot.fret >= from && dot.fret <= to).toBe(true);
      seen.push(from);
      for (const cell of cellsOf('G', from, to).filter((c) => !same(dot)(c))) {
        await cellAt(page, cell).click();
      }
    }
    // Frets 0–12 in balanced windows of at most 5 frets.
    expect(seen.sort((a, b) => a - b)).toEqual([0, 5, 9]);
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ G');
    await expectNoHorizontalOverflow(page);
  });
});
