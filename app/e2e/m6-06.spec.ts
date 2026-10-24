import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M6-06: I4 minor-key harmony and I5 chord function on the function drill
// (choice). "E7 isn't in A minor" is the I4 misconception: the harmonic V
// meets the natural v, and a wrong pick is explained. I5 names a chord's
// function and spots the borrowed chord in a progression.

// An independent answer key (deliberately not imported from app code).
const A_MINOR_CHORDS: Record<string, string> = {
  V: 'E major',
  V7: 'E seven',
  'vii°': 'G sharp diminished',
};
const A_MINOR_SOURCES: Record<string, string> = {
  Em: 'natural',
  G: 'natural',
  Dm: 'natural',
  C: 'natural',
  F: 'natural',
  Bdim: 'natural',
  E: 'harmonic',
  E7: 'harmonic',
  'G♯dim': 'harmonic',
  A: 'borrowed',
  D: 'borrowed',
};
const SOURCE_LABEL: Record<string, string> = {
  natural: 'A natural minor',
  harmonic: 'A harmonic minor',
  borrowed: 'Borrowed from A major (in neither minor scale)',
};
const MAJOR_FUNCTION: Record<string, string> = {
  ii: 'Subdominant',
  IV: 'Subdominant',
  V: 'Dominant',
  'vii°': 'Dominant',
  iii: 'Tonic',
  vi: 'Tonic',
};

const drill = (page: Page) => page.getByTestId('df-drill');
const choices = (page: Page) => drill(page).getByRole('group');
const task = (page: Page) => page.locator('#drill-prompt');

/** The accessible name of the right choice for the card on screen. */
async function rightChoice(page: Page): Promise<string> {
  const text = await task(page).innerText();
  const guided = /Tap (.+) to continue\./.exec(text);
  if (guided) {
    // The worked example names the answer as shown on its button.
    const shown = guided[1] as string;
    const button = choices(page)
      .getByRole('button')
      .filter({ hasText: new RegExp(`^${shown.replace(/[()]/g, '\\$&')}$`) });
    return (await button.getAttribute('aria-label')) as string;
  }
  const chord = /^Which chord is (\S+) in A minor\?$/.exec(text);
  if (chord) return A_MINOR_CHORDS[chord[1] as string] as string;
  const source = /^(\S+) in A minor: where does it come from\?$/.exec(text);
  if (source) return SOURCE_LABEL[A_MINOR_SOURCES[source[1] as string] as string] as string;
  if (/^What function does/.test(text)) {
    const numeral = (await page.getByTestId('df-cue-note').innerText()).split(' ')[0] as string;
    return MAJOR_FUNCTION[numeral] as string;
  }
  throw new Error(`No answer key for: ${text}`);
}

async function answerCorrectly(page: Page): Promise<void> {
  await choices(page)
    .getByRole('button', { name: await rightChoice(page), exact: true })
    .click();
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

async function expectComfortableTargets(page: Page, minWidth: number): Promise<void> {
  const sizes = await choices(page)
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  expect(sizes.length).toBeGreaterThanOrEqual(3);
  for (const r of sizes) {
    expect(r.width).toBeGreaterThanOrEqual(minWidth);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
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

test.describe('M6-06 minor-key harmony and chord function', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
  });

  test('the harmonic-minor V: a worked example, then its cards', async ({ page }) => {
    await masterSkills(page, ['C9.minor', 'I4.minor-numerals']);
    await focusSession(page, 'I4.harmonic-minor');
    await expect(drill(page)).toBeVisible();

    // First rep of a new card: V in A minor, walked through (rule 8).
    await expect(page.getByTestId('df-key')).toHaveText('A minor');
    await expect(page.getByTestId('df-cue')).toHaveText('V');
    await expect(task(page)).toContainText('A harmonic minor raises G to G♯');
    // The natural v sits beside the harmonic V (rule 6).
    await expect(choices(page).getByRole('button', { name: 'E minor' })).toBeVisible();
    await expectComfortableTargets(page, 44);
    await expectNoHorizontalOverflow(page);

    for (let i = 0; i < 4; i++) await answerCorrectly(page);
    expect((await reviewLog(page)).every((r) => r.correct && r.drillType === 'function')).toBe(
      true,
    );
  });

  test('the natural v for V is wrong, and explained', async ({ page }) => {
    await masterSkills(page, ['C9.minor', 'I4.minor-numerals']);
    await focusSession(page, 'I4.harmonic-minor');
    await expect(page.getByTestId('df-cue')).toHaveText('V');
    await choices(page).getByRole('button', { name: 'E minor' }).click();

    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(choices(page).getByRole('button', { name: 'E minor' })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    await expect(choices(page).getByRole('button', { name: 'E major' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    await expect(page.getByTestId('df-explanation')).toContainText(
      'Em is v, from natural minor, with G. Raising G to G♯, the leading tone, makes E.',
    );
    await expect(page.getByTestId('df-feedback')).toContainText('V in A minor is E.');
    await expectNoHorizontalOverflow(page);
    expect(await reviewLog(page)).toEqual([
      expect.objectContaining({ correct: false, rating: 1, drillType: 'function' }),
    ]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('df-explanation')).toBeHidden();
  });

  test('names a chord’s function, from the keyboard too', async ({ page }) => {
    await masterSkills(page, ['C9.pop']);
    await focusSession(page, 'I5.function-major');
    await expect(page.getByTestId('df-cue-note')).toContainText('IV in');
    await expect(choices(page).getByRole('button')).toHaveText([
      'Tonic',
      'Subdominant',
      'Dominant',
    ]);
    await expectComfortableTargets(page, 120);
    await answerCorrectly(page);
    for (let i = 0; i < 2; i++) {
      const right = await rightChoice(page);
      await page.keyboard.press(String(['Tonic', 'Subdominant', 'Dominant'].indexOf(right) + 1));
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
    }
  });

  test('spots the borrowed chord in a progression', async ({ page }) => {
    await masterSkills(page, ['C9.pop', 'I5.function-major', 'C9.minor', 'I4.minor-numerals']);
    await focusSession(page, 'I5.borrowed');
    await expect(page.getByTestId('df-key')).toHaveText('C major');
    // No cue: the progression is the row, tonic first.
    await expect(page.getByTestId('df-cue')).toHaveCount(0);
    await expect(choices(page).getByRole('button').first()).toHaveText('C');
    await expect(task(page)).toContainText('Fm is iv, borrowed from C minor');
    await expectComfortableTargets(page, 44);
    await expectNoHorizontalOverflow(page);
    await choices(page).getByRole('button', { name: 'F minor' }).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('works the harmonic V on a phone @smoke @phone', async ({ page }) => {
    await masterSkills(page, ['C9.minor', 'I4.minor-numerals']);
    await focusSession(page, 'I4.harmonic-minor');
    await answerCorrectly(page);
    await expect(drill(page)).toBeVisible();
    await expectComfortableTargets(page, 44);
    await expectNoHorizontalOverflow(page);
    await answerCorrectly(page);
  });
});
