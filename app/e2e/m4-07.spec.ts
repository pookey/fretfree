import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';
import { focusSession } from './helpers/focus';

// M4-07: I6 ear skills and D14 "Hear it → identify". A sound plays as the
// prompt opens (and again on Play), the learner names it, and feedback
// shows it on the neck or as a chart, with both sounds to compare.

// An independent answer key (deliberately not imported from app code).
const INTERVALS: Record<string, string> = {
  m2: 'minor 2nd',
  M2: 'major 2nd',
  m3: 'minor 3rd',
  M3: 'major 3rd',
  P4: 'perfect 4th',
  TT: 'tritone',
  P5: 'perfect 5th',
  m6: 'minor 6th',
  M6: 'major 6th',
  m7: 'minor 7th',
  M7: 'major 7th',
  P8: 'perfect octave',
};
const CHORDS: Record<string, string> = { major: 'major chord', minor: 'minor chord' };
const PROGRESSIONS: Record<string, string> = {
  'I-IV-V': 'I–IV–V',
  'I-V-vi-IV': 'I–V–vi–IV',
  'vi-IV-I-V': 'vi–IV–I–V',
  'I-vi-IV-V': 'I–vi–IV–V',
};

const drill = (page: Page) => page.getByTestId('d14-drill');
const choices = (page: Page) => drill(page).getByRole('group', { name: /Which|Listen/ });

/** The accessible name of the right button, from the item on screen. */
async function rightChoice(page: Page): Promise<string> {
  const id = (await drill(page).getAttribute('data-item')) as string;
  let m = /^ear-interval:([A-Za-z0-9]+):/.exec(id);
  if (m) return INTERVALS[m[1] as string] as string;
  m = /^ear-chord:(.+)$/.exec(id);
  if (m) return CHORDS[m[1] as string] as string;
  m = /^prog:(.+):ear$/.exec(id);
  if (m) return PROGRESSIONS[m[1] as string] as string;
  throw new Error(`Unexpected item ${id}`);
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
    const rows = await new Promise<
      { itemId: string; correct: boolean; rating: number; drillType: string }[]
    >((resolve) => {
      const req = db.transaction('reviewLogs').objectStore('reviewLogs').getAll();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return rows;
  });
}

async function expectComfortableTargets(page: Page): Promise<void> {
  const sizes = await drill(page)
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  for (const r of sizes) {
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
}

test.describe('M4-07 D14 hear it → identify', () => {
  test('names rising intervals by ear, from day one @smoke', async ({ page }) => {
    await freshStart(page);
    // The first ear set opens once the first neck skill is being practised.
    await masterSkills(page, ['F1.alphabet']);
    await focusSession(page, 'I6.intervals-fourths-fifths');
    await expect(drill(page)).toBeVisible();

    // A new card opens as a worked example (rule 8): the sound, named.
    await expect(page.locator('#drill-prompt')).toContainText(/rising: \d+ half steps apart/);
    await expect(page.locator('#drill-prompt')).toContainText('Listen, then tap');
    await expect(drill(page).getByRole('button', { name: 'Play again' })).toBeVisible();
    await expectComfortableTargets(page);
    await expectNoHorizontalOverflow(page);

    for (let i = 0; i < 4; i++) await answerCorrectly(page);
    const log = await reviewLog(page);
    expect(log).toHaveLength(4);
    expect(log.every((r) => r.correct && r.drillType === 'ear-identify')).toBe(true);
    expect(log.every((r) => /^ear-interval:(P4|P5|P8):up$/.test(r.itemId))).toBe(true);
  });

  test('plays the sound on Play, and compares a wrong answer with the right one', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await tapAudioOutput(page);
    await freshStart(page);
    await masterSkills(page, ['F1.alphabet']);
    await focusSession(page, 'I6.intervals-fourths-fifths');

    // Opened by URL, with no tap yet to unlock audio: the tap on Play does.
    await drill(page).getByRole('button', { name: 'Play again' }).click();
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
      .toBeGreaterThan(0.01);

    const right = await rightChoice(page);
    const wrong = Object.values(INTERVALS).find(
      (name) => name !== right && ['perfect 4th', 'perfect 5th', 'perfect octave'].includes(name),
    ) as string;
    await choices(page).getByRole('button', { name: wrong, exact: true }).click();

    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(choices(page).getByRole('button', { name: wrong })).toHaveAttribute(
      'data-state',
      'wrong',
    );
    await expect(choices(page).getByRole('button', { name: right })).toHaveAttribute(
      'data-state',
      'expected',
    );
    await expect(page.getByTestId('d14-feedback')).toContainText(/half steps? (wider|narrower)/);
    // Sight beside sound and name (rule 10): the interval on the neck.
    await expect(
      drill(page).getByRole('group', { name: new RegExp(`Fretboard showing a ${right}`) }),
    ).toBeVisible();
    const compare = drill(page).getByRole('group', { name: 'Compare the sounds' });
    await compare.getByRole('button', { name: `Hear yours: ${wrong}` }).click();
    await compare.getByRole('button', { name: `Hear the answer: ${right}` }).click();
    await expectNoHorizontalOverflow(page);

    expect(await reviewLog(page)).toEqual([
      expect.objectContaining({ correct: false, rating: 1, drillType: 'ear-identify' }),
    ]);
    expect(errors).toEqual([]);
  });

  test('names chord qualities, major or minor first', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['F1.alphabet']);
    await focusSession(page, 'I6.chords-major-minor');
    await expect(page.locator('#drill-prompt')).toContainText(/(Major|Minor) chord \(1/);
    await expect(choices(page).getByRole('button')).toHaveCount(2);
    for (let i = 0; i < 3; i++) await answerCorrectly(page);
    expect((await reviewLog(page)).every((r) => r.itemId.startsWith('ear-chord:'))).toBe(true);
  });

  test('names a progression, and lays out its chords in feedback', async ({ page }) => {
    await freshStart(page);
    // Progression ear opens with the C9 skill that names them (design §5).
    await masterSkills(page, ['C9.pop']);
    await focusSession(page, 'I6.progressions-pop');
    await expect(choices(page).getByRole('button')).toHaveCount(4);
    await expectComfortableTargets(page);

    const right = await rightChoice(page);
    const wrong = Object.values(PROGRESSIONS).find((n) => n !== right) as string;
    await choices(page).getByRole('button', { name: wrong, exact: true }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    const chart = drill(page).getByRole('list', { name: new RegExp(`^Chords of ${right} in `) });
    await expect(chart).toBeVisible();
    await expect(chart.getByRole('listitem')).toHaveCount(right === 'I–IV–V' ? 3 : 4);
    await expectNoHorizontalOverflow(page);
  });
});
