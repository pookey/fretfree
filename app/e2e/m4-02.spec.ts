import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M4-02: C8 skills and D11 "Roman numeral ↔ chord". A numeral or Nashville
// number is answered with a chord of the key, a chord with its numeral; the
// quality twin is always offered, and feedback lays out the key's chords.

/** Rule 7: the key's degrees (C4) and triads (C5) open C8 (design §5 M-Harmony). */
const C8_PREREQS = ['C4.sharp-key-degrees', 'C4.flat-key-degrees', 'C5.triads'];

// An independent answer key (deliberately not imported from app code).
const SCALES: Record<string, string[]> = {
  C: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  G: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  D: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  A: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  E: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  B: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
  'F#': ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'],
  F: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
  Bb: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
  Eb: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
  Ab: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
  Db: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],
};
const QUALITIES = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'];
const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const NASHVILLE = ['1', '2m', '3m', '4', '5', '6m', '7°'];

/** `F♯` → `F#`. */
const ascii = (s: string) => s.replace(/♯/g, '#').replace(/♭/g, 'b');
/** A chord button's accessible name: `F# minor`. */
const spokenChord = (root: string, quality: string) =>
  `${root.charAt(0)}${{ '': '', '#': ' sharp', b: ' flat' }[root.slice(1)] as string} ${quality}`;

const drill = (page: Page) => page.getByTestId('d11-drill');
const choices = (page: Page) => drill(page).getByRole('group');

async function keyOnScreen(page: Page): Promise<string[]> {
  const text = ascii((await page.getByTestId('d11-key').innerText()).trim());
  const m = /^([A-G][#b]?) major$/.exec(text);
  expect(m, text).not.toBeNull();
  return SCALES[(m as RegExpExecArray)[1] as string] as string[];
}

/** The accessible name of the right choice for the prompt on screen. */
async function rightChoice(page: Page): Promise<string> {
  const scale = await keyOnScreen(page);
  const cue = ascii((await page.getByTestId('d11-cue').innerText()).trim());
  const task = await page.locator('#drill-prompt').innerText();
  if (/which numeral|so it's/.test(task)) {
    const root = /^[A-G][#b]?/.exec(cue)?.[0] as string;
    const d = scale.indexOf(root);
    return `${d + 1} ${QUALITIES[d] as string}`;
  }
  const d = Math.max(ROMAN.indexOf(cue), NASHVILLE.indexOf(cue));
  expect(d, cue).toBeGreaterThan(0);
  return spokenChord(scale[d] as string, QUALITIES[d] as string);
}

async function answerCorrectly(page: Page): Promise<void> {
  await choices(page)
    .getByRole('button', { name: await rightChoice(page), exact: true })
    .click();
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

async function reviewLog(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ correct: boolean; rating: number; drillType: string }[]>(
      (resolve) => {
        const req = db.transaction('reviewLogs').objectStore('reviewLogs').getAll();
        req.onsuccess = () => resolve(req.result);
      },
    );
    db.close();
    return rows;
  });
}

test.describe('M4-02 D11 numerals', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, C8_PREREQS);
  });

  test('a worked example, then numerals both ways @layout', async ({ page }) => {
    await focusSession(page, 'C8.numerals-major');
    await expect(drill(page)).toBeVisible();

    // First rep of a new card: IV in C, walked through with the key's chords (rule 8).
    await expect(page.getByTestId('d11-key')).toHaveText('C major');
    await expect(page.getByTestId('d11-cue')).toHaveText('IV');
    await expect(page.locator('#drill-prompt')).toContainText(
      'IV is the chord on the 4th note of C major, F',
    );
    await expect(page.getByRole('list', { name: 'Chords in C major' })).toBeVisible();
    // The quality twin sits beside the answer.
    await expect(choices(page).getByRole('button', { name: 'F minor' })).toBeVisible();

    // iPad: every choice is a comfortable target (design §7).
    const sizes = await choices(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    expect(sizes.length).toBeGreaterThanOrEqual(4);
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);

    // Then whatever comes next, in either direction.
    for (let i = 0; i < 5; i++) await answerCorrectly(page);
    expect((await reviewLog(page)).every((r) => r.correct && r.drillType === 'numerals')).toBe(
      true,
    );
  });

  test('a quality slip is wrong, explained, and shows the key’s chords', async ({ page }) => {
    await focusSession(page, 'C8.numerals-major');
    await expect(page.getByTestId('d11-cue')).toHaveText('IV');
    await choices(page).getByRole('button', { name: 'F minor' }).click();

    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(choices(page).getByRole('button', { name: 'F minor' })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    await expect(choices(page).getByRole('button', { name: 'F major' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    await expect(page.getByTestId('d11-explanation')).toContainText(
      'Right root, wrong quality: the chord on F in C major is major',
    );
    const strip = page.getByRole('list', { name: 'Chords in C major' });
    await expect(strip.getByRole('listitem')).toHaveCount(7);
    await expect(strip.getByLabel('IV: F, the answer')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // The review log records it as wrong (FSRS "Again").
    expect(await reviewLog(page)).toEqual([
      expect.objectContaining({ correct: false, rating: 1, drillType: 'numerals' }),
    ]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('d11-explanation')).toBeHidden();
  });

  test('answers from a hardware keyboard', async ({ page }) => {
    await focusSession(page, 'C8.numerals-major');
    const right = await rightChoice(page);
    const names = await choices(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    await page.keyboard.press(String(names.indexOf(right) + 1));
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('reads Nashville numbers as chords', async ({ page }) => {
    await masterSkills(page, [...C8_PREREQS, 'C8.numerals-major']);
    await focusSession(page, 'C8.nashville');
    await expect(page.getByTestId('d11-cue')).toHaveText('4');
    await expect(page.locator('#drill-prompt')).toContainText('a plain number');
    for (let i = 0; i < 3; i++) await answerCorrectly(page);
    await expectNoHorizontalOverflow(page);
  });

  test('names a chord of the key on a phone @smoke @layout @phone', async ({ page }) => {
    await focusSession(page, 'C8.numerals-major');
    await answerCorrectly(page);
    await expect(drill(page)).toBeVisible();
    const sizes = await choices(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    for (const r of sizes) expect(r.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });
});
