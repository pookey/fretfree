import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, noteName } from './helpers';
import { skipInstallTip } from './helpers/install';
import { d5ButtonName } from './helpers/interval-names';

// M2-09: the placement test (design §3.4, §4 step 6). An adaptive probe of
// F1, F2, C2 and C3 (every topic a drill can serve) at the end of onboarding
// seeds what the learner already knows. Topics join as their drills land, so
// the expert answers every probe kind it knows and says "Not sure" to others.

// An independent answer key (deliberately not imported from app code).
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const INTERVAL_SEMITONES: Record<string, number> = {
  m2: 1,
  M2: 2,
  m3: 3,
  M3: 4,
  P4: 5,
  TT: 6,
  P5: 7,
  m6: 8,
  M6: 9,
  m7: 10,
  M7: 11,
};
/** The most probes any one skill is asked (the largest tier). */
const MAX_PROBES_PER_SKILL = 6;
const CHECK_UP_DAYS = 10;
// Calibration is step 7 of 9; the placement test is last.
const STEPS = 9;
/** Correct answers move on by themselves after this long. */
const AUTO_ADVANCE_MS = 700;

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Placement test' });
const probe = (page: Page) => page.getByTestId('placement-probe');

async function openPlacementStep(page: Page) {
  await firstLaunch(page);
  await page.getByRole('button', { name: 'Get started' }).click();
  for (let n = 1; n < STEPS; n++)
    await page.getByRole('button', { name: 'Skip this step' }).click();
  await expect(page.getByRole('heading', { name: 'Already play a bit?', level: 1 })).toBeVisible();
  await expect(page.getByTestId('onboarding-progress')).toHaveText(`Step ${STEPS} of ${STEPS}`);
}

type Answer = { kind: 'button'; label: string } | { kind: 'cell'; string: number; fret: number };

/** The right answer to a probe, from its item ID (and the neck, for D6); null if unknown. */
async function solve(page: Page, itemId: string): Promise<Answer | null> {
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
  // D5 names the interval the two dots make; its buttons are the interval names.
  const interval = /^interval-name:([mMPT][1-8T])@s\d→s\d$/.exec(itemId);
  if (interval) return { kind: 'button', label: d5ButtonName(interval[1]!) };
  // D6 taps the interval above the shown root, on the item's upper string.
  const tap = /^interval:([mMPT][1-8T])@s(\d)→s(\d)$/.exec(itemId);
  if (tap) {
    const root = dialog(page).getByTestId('marker-root').first();
    const rs = Number(await root.getAttribute('data-string'));
    const rf = Number(await root.getAttribute('data-fret'));
    expect(rs).toBe(Number(tap[2]));
    const string = Number(tap[3]);
    const fret = OPEN_MIDI[rs]! + rf + INTERVAL_SEMITONES[tap[1]!]! - OPEN_MIDI[string]!;
    return { kind: 'cell', string, fret };
  }
  const find = /^find:([A-G]#?)@s(\d)$/.exec(itemId);
  if (find) {
    const string = Number(find[2]);
    for (let fret = 0; fret <= 12; fret++) {
      if (noteName(string, fret) === find[1]) return { kind: 'cell', string, fret };
    }
  }
  return null;
}

/** Answer correctly, or say "Not sure" to a probe kind this key doesn't know. Returns if answered. */
async function answerRight(page: Page, itemId: string): Promise<boolean> {
  const a = await solve(page, itemId);
  if (!a) {
    await dialog(page).getByRole('button', { name: 'Not sure' }).click();
    return false;
  }
  if (a.kind === 'button') {
    await dialog(page)
      .locator('[role="group"][aria-labelledby="drill-prompt"]')
      // D1 and D3 buttons spell sharps with ♯ (M10-05).
      .getByRole('button', { name: a.label.replace('#', '♯'), exact: true })
      .click();
  } else {
    await dialog(page)
      .locator('svg[data-fret-from]')
      .locator(`[data-cell="s${a.string}f${a.fret}"]`)
      .click();
  }
  await expect(dialog(page).getByTestId('feedback-correct')).toBeVisible();
  return true;
}

async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all = <T>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
      });
    const cards = await all<{ skillId: string; fsrs: { stability: number } }>('cards');
    const states = await all<{ skillId: string; status: string }>('skillStates');
    const logs = await all<{ skillId: string }>('reviewLogs');
    const perSkill: Record<string, number> = {};
    for (const l of logs) perSkill[l.skillId] = (perSkill[l.skillId] ?? 0) + 1;
    db.close();
    return {
      cards: cards.length,
      stabilities: [...new Set(cards.map((c) => c.fsrs.stability))],
      skills: [...new Set(cards.map((c) => c.skillId))].sort(),
      mastered: states
        .filter((s) => s.status === 'mastered')
        .map((s) => s.skillId)
        .sort(),
      logs: logs.length,
      perSkill,
    };
  });
}

// The install step (M1-29) has its own spec.
test.beforeEach(({ page }) => skipInstallTip(page));

test.describe('M2-09 placement test', () => {
  test('an expert answers fluently and their skills are seeded as known', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'The full flow runs on the iPad projects.');
    // Dozens of probes; leave room for a loaded machine.
    test.setTimeout(120_000);
    await page.clock.install();
    await openPlacementStep(page);
    await expect(page.getByText(/About 3 minutes/)).toBeVisible();
    // The page clock is paused while probing, so answers are timed as instant.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await page.getByRole('button', { name: 'Start the test' }).click();
    await expect(dialog(page)).toBeVisible();

    const result = page.getByTestId('placement-result');
    const seen: string[] = [];
    let answered = 0;
    for (let n = 0; n < 200 && !(await result.isVisible()); n++) {
      const id = (await probe(page).getAttribute('data-item'))!;
      seen.push(id);
      if (n === 0) {
        await expectNoHorizontalOverflow(page);
        // Each probe is the drill's own full-screen layout: iPad neck cells stay ≥ 44pt.
        const cell = await dialog(page).locator('[data-cell="s1f5"]').boundingBox();
        expect(cell!.width).toBeGreaterThanOrEqual(44);
        expect(cell!.height).toBeGreaterThanOrEqual(44);
      }
      if (await answerRight(page, id)) answered++;
      await page.clock.runFor(AUTO_ADVANCE_MS);
      await expect(probe(page).or(result)).toBeVisible();
      if (await probe(page).isVisible()) {
        await expect(probe(page)).not.toHaveAttribute('data-item', id);
      }
    }
    await page.clock.resume();

    // It probed every topic, a few items per skill, not every item. Which drill
    // asks a sampled item is chance (a note is named in D1 or found in D2, an
    // interval named in D5 or tapped in D6), so check each topic, not each drill.
    for (const [topic, kind] of [
      ['F1 letters', /^letter:/],
      ['F1 steps', /^step:/],
      ['F2 and C2 notes', /^(note@|find:)/],
      ['C3 intervals', /^interval(-name)?:/],
      ['C4 keys', /^spell-key:/],
    ] as const) {
      expect(
        seen.some((id) => kind.test(id)),
        topic,
      ).toBe(true);
    }

    await expect(result).toHaveText(/You already know these/);
    await expect(result).toHaveText(new RegExp(`in about ${CHECK_UP_DAYS} days`));
    const known = page.getByRole('list', { name: 'Already known' });
    await expect(known).toContainText('The musical alphabet');
    await expect(known).toContainText('Natural notes on string 6');
    await expect(known).toContainText('Every note on every string');
    await expect(known).toContainText('Interval shapes: 3rds');

    const db = await stored(page);
    expect(db.stabilities).toEqual([CHECK_UP_DAYS]);
    expect(db.skills).toEqual(
      expect.arrayContaining(['F1.alphabet', 'F2.string6-naturals', 'C2.all-notes']),
    );
    expect(db.mastered).toEqual(
      expect.arrayContaining(['F2.string5-naturals', 'F2.string6-naturals', 'C2.all-notes']),
    );
    // Every answer is logged ("Not sure" isn't), and no skill took more than its tier's probes.
    expect(db.logs).toBe(answered);
    for (const n of Object.values(db.perSkill)) expect(n).toBeLessThanOrEqual(MAX_PROBES_PER_SKILL);

    await page.getByTestId('onboarding-choice').getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    // The seeded cards come back as check-ups, not today.
    await expect(page.getByTestId('due-count')).toHaveText('0');
  });

  test('a beginner says "Not sure" and starts from the beginning @smoke', async ({ page }) => {
    await openPlacementStep(page);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Start the test' }).click();
    const result = page.getByTestId('placement-result');
    // A miss settles F1 and both F2 strings quickly; everything after them is skipped.
    let probes = 0;
    while (!(await result.isVisible())) {
      await expect(probe(page).or(result)).toBeVisible();
      if (!(await probe(page).isVisible())) break;
      await expectNoHorizontalOverflow(page);
      const id = await probe(page).getAttribute('data-item');
      await dialog(page).getByRole('button', { name: 'Not sure' }).click();
      await expect(probe(page).or(result)).toBeVisible();
      if (await probe(page).isVisible()) {
        await expect(probe(page)).not.toHaveAttribute('data-item', id!);
      }
      probes++;
    }
    expect(probes).toBeLessThanOrEqual(8);
    await expect(result).toHaveText(/Nothing to skip yet/);
    expect((await stored(page)).cards).toBe(0);
    await page.getByTestId('onboarding-choice').getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  });

  test('the test is skippable, and can finish early', async ({ page }) => {
    await openPlacementStep(page);
    await page.getByRole('button', { name: 'Skip this step' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    expect((await stored(page)).cards).toBe(0);

    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Get started' }).click();
    for (let n = 1; n < STEPS; n++)
      await page.getByRole('button', { name: 'Skip this step' }).click();
    await page.getByRole('button', { name: 'Start the test' }).click();
    await expect(probe(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Finish now' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('placement-result')).toHaveText(/Nothing to skip yet/);
  });
});
