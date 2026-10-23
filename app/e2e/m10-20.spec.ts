import { expect, test, type Page } from '@playwright/test';
import { firstLaunch, noteName } from './helpers';
import { skipInstallTip } from './helpers/install';

// M10-20: placement probes only some C2 stages (string 2's naturals and the
// last sharps-and-flats stage). A known later stage doesn't imply the stages
// it skips, so each gets one short probe once the later stage is known, and
// only what the learner shows is seeded. This player knows the neck except
// string 1: strings 4 and 3 and the low sharps and flats are seeded, string 1
// is taught as new cards.

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Calibration is step 7 of 9; the placement test is last.
const STEPS = 9;
/** Correct answers move on by themselves after this long. */
const AUTO_ADVANCE_MS = 700;

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Placement test' });
const probe = (page: Page) => page.getByTestId('placement-probe');

type Answer = { kind: 'button'; label: string } | { kind: 'cell'; string: number; fret: number };

/** A natural-note probe on `string` (named or found), or on strings 6 and 5 for its sharps. */
function naturalOn(string: number, itemId: string): boolean {
  const note = /^note@s(\d)f(\d+)$/.exec(itemId);
  if (note) return Number(note[1]) === string && !noteName(string, Number(note[2])).includes('#');
  const find = /^find:([A-G]#?)@s(\d)$/.exec(itemId);
  return !!find && Number(find[2]) === string && !find[1]!.includes('#');
}

/** A sharp or flat on string 6 or 5. */
function lowAccidental(itemId: string): boolean {
  const note = /^note@s([56])f(\d+)$/.exec(itemId);
  if (note) return noteName(Number(note[1]), Number(note[2])).includes('#');
  return /^find:[A-G]#@s[56]$/.test(itemId);
}

/** The right answer to an F1, F2 or C2 probe, bar string 1's naturals; null for anything else. */
function solve(itemId: string): Answer | null {
  if (naturalOn(1, itemId)) return null;
  const letter = /^letter:([+-]\d+)@([A-G])$/.exec(itemId);
  if (letter) {
    const i = LETTERS.indexOf(letter[2]!) + Number(letter[1]);
    return { kind: 'button', label: LETTERS[(i + 7) % 7]! };
  }
  const step = /^step:([+-]\d+)@([A-G]#?)$/.exec(itemId);
  if (step) {
    const i = CHROMATIC.indexOf(step[2]!) + Number(step[1]);
    return { kind: 'button', label: CHROMATIC[(i + 12) % 12]! };
  }
  const note = /^note@s(\d)f(\d+)$/.exec(itemId);
  if (note) return { kind: 'button', label: noteName(Number(note[1]), Number(note[2])) };
  const find = /^find:([A-G]#?)@s(\d)$/.exec(itemId);
  if (find) {
    const string = Number(find[2]);
    for (let fret = 0; fret <= 12; fret++) {
      if (noteName(string, fret) === find[1]) return { kind: 'cell', string, fret };
    }
  }
  return null;
}

async function answer(page: Page, itemId: string): Promise<void> {
  const a = solve(itemId);
  if (!a) {
    await dialog(page).getByRole('button', { name: 'Not sure' }).click();
    return;
  }
  if (a.kind === 'button') {
    await dialog(page)
      .locator('[role="group"][aria-labelledby="drill-prompt"]')
      .getByRole('button', { name: a.label.replace('#', '♯'), exact: true })
      .click();
  } else {
    await dialog(page)
      .locator('svg[data-fret-from]')
      .locator(`[data-cell="s${a.string}f${a.fret}"]`)
      .click();
  }
  await expect(dialog(page).getByTestId('feedback-correct')).toBeVisible();
}

/** The skills that have cards. */
async function seededSkills(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const cards = await new Promise<{ skillId: string }[]>((resolve, reject) => {
      const req = db.transaction('cards').objectStore('cards').getAll();
      req.onsuccess = () => resolve(req.result as { skillId: string }[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return [...new Set(cards.map((c) => c.skillId))].sort();
  });
}

test.beforeEach(({ page }) => skipInstallTip(page));

test('placement probes the C2 stages it skips, and seeds only what the player shows', async ({
  page,
}) => {
  // A few dozen probes; leave room for a loaded machine.
  test.setTimeout(120_000);
  await page.clock.install();
  await firstLaunch(page);
  await page.getByRole('button', { name: 'Get started' }).click();
  for (let n = 1; n < STEPS; n++)
    await page.getByRole('button', { name: 'Skip this step' }).click();
  await expect(page.getByRole('heading', { name: 'Already play a bit?', level: 1 })).toBeVisible();
  // The page clock is paused while probing, so answers are timed as instant.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await page.getByRole('button', { name: 'Start the test' }).click();
  await expect(dialog(page)).toBeVisible();

  const result = page.getByTestId('placement-result');
  const seen: string[] = [];
  for (let n = 0; n < 120 && !(await result.isVisible()); n++) {
    const id = (await probe(page).getAttribute('data-item'))!;
    seen.push(id);
    await answer(page, id);
    await page.clock.runFor(AUTO_ADVANCE_MS);
    await expect(probe(page).or(result)).toBeVisible();
    if (await probe(page).isVisible()) {
      await expect(probe(page)).not.toHaveAttribute('data-item', id);
    }
  }
  await page.clock.resume();
  await expect(result).toBeVisible();

  // One short probe each for strings 1, 4 and 3 and the sharps and flats on 6 and 5,
  // asked after string 2's own probes.
  for (const string of [1, 4, 3])
    expect(
      seen.filter((id) => naturalOn(string, id)),
      `string ${string}`,
    ).toHaveLength(1);
  expect(seen.filter(lowAccidental)).toHaveLength(1);
  const lastString2 = seen.findLastIndex((id) => naturalOn(2, id));
  expect(seen.findIndex((id) => naturalOn(1, id))).toBeGreaterThan(lastString2);

  const known = page.getByRole('list', { name: 'Already known' });
  for (const title of [
    'Natural notes on string 2',
    'Natural notes on string 4',
    'Natural notes on string 3',
    'Sharps and flats on strings 6 and 5',
    'Sharps and flats on strings 4 to 1',
  ])
    await expect(known.getByText(title, { exact: true })).toBeVisible();
  await expect(known.getByText('Natural notes on string 1', { exact: true })).toHaveCount(0);

  const skills = await seededSkills(page);
  expect(skills).toEqual(
    expect.arrayContaining([
      'C2.string2-naturals',
      'C2.string4-naturals',
      'C2.string3-naturals',
      'C2.low-accidentals',
      'C2.all-notes',
    ]),
  );
  expect(skills).not.toContain('C2.string1-naturals');
});
