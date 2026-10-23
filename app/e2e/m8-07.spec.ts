import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';
import { focusSession } from './helpers/focus';

// M8-07: T4 and T7 skills and D30 "Hear the meter". A strummed or drummed
// clip plays as the prompt opens; the learner names its meter, and only
// then sees the time signature, a note per beat and the counting.

const drill = (page: Page) => page.getByTestId('d30-drill');
const choices = (page: Page) => drill(page).getByRole('group', { name: /Which meter|This is/ });

/** The meter on screen, from the item (deliberately not from app code). */
async function rightMeter(page: Page): Promise<string> {
  const id = (await drill(page).getAttribute('data-item')) as string;
  const m = /^meter-ear:(\d+\/\d+)$/.exec(id);
  if (!m) throw new Error(`Unexpected item ${id}`);
  return m[1] as string;
}

async function answerCorrectly(page: Page): Promise<void> {
  const meter = await rightMeter(page);
  await choices(page)
    .getByRole('button', { name: `${meter} time`, exact: true })
    .click();
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('d30-notation')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden({ timeout: 10_000 });
}

async function reviewLog(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ itemId: string; correct: boolean; drillType: string }[]>(
      (resolve) => {
        const req = db.transaction('reviewLogs').objectStore('reviewLogs').getAll();
        req.onsuccess = () => resolve(req.result);
      },
    );
    db.close();
    return rows;
  });
}

test.describe('M8-07 D30 hear the meter', () => {
  test('names 4/4 and 3/4 by ear, meter names first and notation after @smoke @layout', async ({
    page,
  }) => {
    await freshStart(page);
    // The Meter module opens after Rhythm: the pulse first.
    await masterSkills(page, ['F4.pulse']);
    await focusSession(page, 'T4.simple');
    await expect(drill(page)).toBeVisible();

    // A new card opens as a worked example (rule 8): the meter, named.
    await expect(page.locator('#drill-prompt')).toContainText(/This is (4\/4|3\/4)\./);
    await expect(page.locator('#drill-prompt')).toContainText('Listen, then tap');
    await expect(drill(page).getByRole('button', { name: 'Play again' })).toBeVisible();
    await expect(choices(page).getByRole('button')).toHaveText([/^3\/4/, /^4\/4/]);
    // Sound before symbol: no staff or counting while the clip is the prompt.
    await expect(page.getByTestId('d30-notation')).toHaveCount(0);

    const sizes = await drill(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);

    for (let i = 0; i < 3; i++) await answerCorrectly(page);
    const log = await reviewLog(page);
    expect(log).toHaveLength(3);
    expect(log.every((r) => r.correct && r.drillType === 'hear-the-meter')).toBe(true);
    expect(log.every((r) => /^meter-ear:(4\/4|3\/4)$/.test(r.itemId))).toBe(true);
  });

  test('shows the time signature and counting after a wrong answer, with both meters to compare', async ({
    page,
  }) => {
    await freshStart(page);
    await masterSkills(page, ['F4.pulse', 'T4.simple']);
    await focusSession(page, 'T4.compound');
    await expect(drill(page)).toBeVisible();

    const right = await rightMeter(page);
    const buttons = await choices(page).getByRole('button').allTextContents();
    const wrong = (buttons.map((t) => /^\d+\/\d+/.exec(t)![0]) as string[]).find(
      (m) => m !== right,
    ) as string;
    await choices(page)
      .getByRole('button', { name: `${wrong} time`, exact: true })
      .click();

    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(choices(page).getByRole('button', { name: `${wrong} time` })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    await expect(choices(page).getByRole('button', { name: `${right} time` })).toHaveAttribute(
      'data-state',
      'expected',
    );
    // 6/8 and 12/8: two or four beats, each split in three.
    await expect(page.getByTestId('d30-feedback')).toContainText(
      right === '6/8' ? 'is compound duple' : 'is compound quadruple',
    );
    // The symbol after the sound (rule 10): the engraved bar and its counting.
    const staff = drill(page).getByRole('group', { name: new RegExp(`One bar of ${right}`) });
    await expect(staff).toHaveAttribute('data-ready', 'true');
    await expect(staff.getByTestId('staff-note')).toHaveCount(right === '6/8' ? 2 : 4);
    await expect(
      drill(page).getByRole('list', {
        name:
          right === '6/8' ? 'Counted 1 la li 2 la li' : 'Counted 1 la li 2 la li 3 la li 4 la li',
      }),
    ).toBeVisible();
    const compare = drill(page).getByRole('group', { name: 'Compare the meters' });
    await expect(compare.getByRole('button', { name: `Hear yours: ${wrong}` })).toBeVisible();
    await expect(compare.getByRole('button', { name: `Hear the answer: ${right}` })).toBeVisible();

    const log = await reviewLog(page);
    expect(log).toEqual([
      expect.objectContaining({ itemId: `meter-ear:${right}`, correct: false }),
    ]);
  });

  test('plays the clip on Play, and answers from the keyboard', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await tapAudioOutput(page);
    await freshStart(page);
    await masterSkills(page, ['F4.pulse']);
    await focusSession(page, 'T4.simple');

    // Opened by URL, with no tap yet to unlock audio: the tap on Play does.
    await drill(page).getByRole('button', { name: 'Play again' }).click();
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
      .toBeGreaterThan(0.01);

    // The number row picks a button by position: 3/4 is 1, 4/4 is 2.
    const right = await rightMeter(page);
    await page.keyboard.press(right === '3/4' ? '1' : '2');
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('names 5/4 and 7/8 once the common meters are mastered, with the grouping heard', async ({
    page,
  }) => {
    await freshStart(page);
    await masterSkills(page, ['F4.pulse', 'T4.simple', 'T4.compound']);
    await focusSession(page, 'T7.odd');
    await expect(drill(page)).toBeVisible();
    await expect(choices(page).getByRole('button')).toHaveText([/^5\/4/, /^7\/8/]);

    const right = await rightMeter(page);
    await choices(page)
      .getByRole('button', { name: `${right} time`, exact: true })
      .click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    // The grouping played: 5/4 as 3+2 or 2+3, 7/8 as 2+2+3, 3+2+2 or 2+3+2.
    await expect(page.getByTestId('d30-feedback')).toContainText(
      new RegExp(`${right.replace('/', '\\/')} \\((\\d\\+)+\\d\\) is an odd meter`),
    );
  });
});
