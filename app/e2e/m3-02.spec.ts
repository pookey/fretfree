import { expect, test, type Page } from '@playwright/test';
import { F1_SKILLS, expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { delayEffectsIfAsked, press } from './helpers/keyboard';

// M3-02: C4 skills and D7 "Spell it". Keys and degrees are spelled in order
// from a letter × accidental grid; an enharmonic spelling is wrong and says why.

// An independent answer key (deliberately not imported from app code).
const KEYS: Record<string, string[]> = {
  C: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  G: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  D: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  A: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  E: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  B: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
  'F#': ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'],
  'C#': ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'],
};

/** Each sharp key's 7th spelled on the wrong letter: same pitch, wrong letter. */
const WRONG_LETTER_7TH: Record<string, string> = {
  C: 'Cb',
  G: 'Gb',
  D: 'Db',
  A: 'Ab',
  E: 'Eb',
  B: 'Bb',
  'F#': 'F',
  'C#': 'C',
};

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

/** `F♯` → `F#`. */
const ascii = (s: string) => s.replace('♯', '#').replace('♭', 'b');
/** The button's accessible name: `F#` → `F sharp`. */
const spoken = (n: string) =>
  n.charAt(0) + ({ '': '', '#': ' sharp', b: ' flat' } as Record<string, string>)[n.slice(1)];

const drill = (page: Page) => page.getByTestId('d7-drill');
const grid = (page: Page) => drill(page).getByRole('group');
const slots = (page: Page) => page.getByTestId('d7-slot');

async function subjectKey(page: Page): Promise<string> {
  const text = (await page.getByTestId('d7-subject').innerText()).trim();
  const m = /^([A-G][♯♭]?) major$/.exec(text);
  expect(m, text).not.toBeNull();
  return ascii((m as RegExpExecArray)[1] as string);
}

async function enter(page: Page, notes: readonly string[]): Promise<void> {
  for (const n of notes)
    await grid(page)
      .getByRole('button', { name: spoken(n), exact: true })
      .click();
}

async function check(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Check' }).click();
}

/** Spell whatever key is on screen correctly and wait for the next prompt. */
async function spellCorrectly(page: Page): Promise<string> {
  const key = await subjectKey(page);
  await enter(page, (KEYS[key] as string[]).slice(1));
  await check(page);
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return key;
}

/**
 * Answer the degree prompt on screen correctly: a note for "the 6th of E♭
 * major?", a degree for "C is which degree of E♭ major?". A worked example
 * states the answer ("C is the 6th of E♭ major").
 */
async function answerDegree(page: Page): Promise<void> {
  const text = (await page.locator('#drill-prompt').innerText()).trim();
  const scale = KEYS[await subjectKey(page)] as string[];
  const stated = /(\d)\w\w of/.exec(text);
  const note = /^(\S+) is which degree/.exec(text);
  const degree = stated
    ? Number(stated[1])
    : scale.indexOf(ascii((note as RegExpExecArray)[1] as string)) + 1;
  if ((await page.getByRole('button', { name: 'Check' }).count()) > 0) {
    await enter(page, [scale[degree - 1] as string]);
    await check(page);
  } else {
    await grid(page)
      .getByRole('button', { name: ORDINALS[degree - 1] as string })
      .click();
  }
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

test.describe('M3-02 D7 spell it', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    // C4 opens once the F1 steps are under way (design §5 M-Keys).
    await masterSkills(page, F1_SKILLS);
  });

  test('a worked example, then the key spelled in order @layout', async ({ page }) => {
    await focusSession(page, 'C4.sharp-keys');
    await expect(drill(page)).toBeVisible();
    const key = await subjectKey(page);
    const scale = KEYS[key] as string[];

    // First rep of a new key: the answer sits in the slots to copy (rule 8).
    await expect(page.locator('#drill-prompt')).toContainText('uses each letter once');
    await expect(slots(page)).toHaveCount(7);
    await expect(slots(page).first()).toHaveAttribute('data-state', 'given');
    await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();

    // A slip is undone before checking.
    await enter(page, [scale[1] as string, scale[1] as string]);
    await page.getByRole('button', { name: 'Undo' }).click();
    await enter(page, scale.slice(2));
    await check(page);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(page.getByTestId('feedback-correct')).toBeHidden();

    // iPad: every button and slot is a comfortable target (design §7).
    const sizes = await drill(page)
      .locator('button, [data-testid="d7-slot"]')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    // The seven slots sit on one row.
    const tops = await slots(page).evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size).toBe(1);
    await expectNoHorizontalOverflow(page);
  });

  test('an enharmonic spelling is wrong, with the letter explained', async ({ page }) => {
    await focusSession(page, 'C4.sharp-keys');
    const key = await subjectKey(page);
    const scale = KEYS[key] as string[];
    const slip = WRONG_LETTER_7TH[key] as string;

    await enter(page, [...scale.slice(1, 6), slip]);
    await check(page);

    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    const last = slots(page).last();
    await expect(last).toHaveAttribute('data-verdict', 'enharmonic');
    await expect(last).toContainText('≈');
    await expect(page.getByTestId('d7-expected')).toHaveText(scale[6]!.replace('#', '♯'));
    const explanation = page.getByTestId('d7-explanation');
    await expect(explanation).toContainText('Right pitch, wrong letter');
    await expect(explanation).toContainText(`sits on ${scale[6]!.charAt(0)}`);
    await expect(explanation).toContainText('each letter A–G exactly once');
    await expectNoHorizontalOverflow(page);

    // The review log records it as wrong (FSRS "Again").
    const log = await page.evaluate(async () => {
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
    expect(log).toEqual([
      expect.objectContaining({ correct: false, rating: 1, drillType: 'spell-it' }),
    ]);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('d7-explanation')).toBeHidden();
  });

  test('spells from a hardware keyboard', async ({ page }) => {
    await delayEffectsIfAsked(page);
    await focusSession(page, 'C4.sharp-keys');
    const key = await subjectKey(page);
    for (const n of (KEYS[key] as string[]).slice(1)) {
      await press(page, n.charAt(0).toLowerCase());
      if (n.endsWith('#')) await press(page, '#');
    }
    await press(page, 'Enter');
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('names scale degrees both ways', async ({ page }) => {
    await masterSkills(page, [...F1_SKILLS, 'C4.sharp-keys']);
    await focusSession(page, 'C4.sharp-key-degrees');
    for (let i = 0; i < 4; i++) await answerDegree(page);
    await expectNoHorizontalOverflow(page);
  });

  test('spells a key on a phone @smoke @phone', async ({ page }) => {
    await focusSession(page, 'C4.sharp-keys');
    await spellCorrectly(page);
    await expect(drill(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
