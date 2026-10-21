import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, noteName } from './helpers';
import { skipInstallTip } from './helpers/install';

// M2-15: the placement test, retaken from Settings (design §3.4, §4 step 6).
// A learner who skipped it in onboarding opens it again from Settings, and
// what they answer fluently unlocks or masters skills in Learn. A retake can't
// set them back. The expert answers every probe kind this key knows and says
// "Not sure" to the rest (e.g. C4's key spelling).

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
// Calibration is step 6 of 8; the placement test is last.
const STEPS = 8;
/** Correct answers move on by themselves after this long. */
const AUTO_ADVANCE_MS = 700;

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Placement test' });
const probe = (page: Page) => page.getByTestId('placement-probe');
const result = (page: Page) => page.getByTestId('placement-result');

/** Onboarding, every step skipped, the placement test included. */
async function skipOnboardingPlacement(page: Page) {
  await firstLaunch(page);
  await page.getByRole('button', { name: 'Get started' }).click();
  for (let n = 1; n < STEPS; n++)
    await page.getByRole('button', { name: 'Skip this step' }).click();
  await expect(page.getByRole('heading', { name: 'Already play a bit?', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Skip this step' }).click();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

/** Settings → "Retake the placement test". */
async function openRetake(page: Page) {
  await page.goto('/settings');
  const card = page.getByRole('group', { name: 'Placement test' });
  await expect(card).toContainText('skips material you already know');
  await expect(card).toContainText('can’t make you lose progress');
  await card.getByRole('link', { name: 'Retake the placement test' }).click();
  await expect(page).toHaveURL(/\/placement$/);
  await expect(
    page.getByRole('heading', { name: 'Retake the placement test', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/can’t make you lose progress/)).toBeVisible();
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
  const interval = /^interval-name:([mMPT][1-8T])@s\d→s\d$/.exec(itemId);
  if (interval) return { kind: 'button', label: interval[1]! };
  const tap = /^interval:([mMPT][1-8T])@s(\d)→s(\d)$/.exec(itemId);
  if (tap) {
    const root = dialog(page).getByTestId('marker-root').first();
    const rs = Number(await root.getAttribute('data-string'));
    const rf = Number(await root.getAttribute('data-fret'));
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

async function give(page: Page, a: Answer) {
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
}

/** A wrong answer for a button probe; null for the others. */
function wrongFor(a: Answer): Answer | null {
  if (a.kind !== 'button') return null;
  // Interval names (D5) or note names (D1, the note wheels).
  if (a.label in INTERVAL_SEMITONES)
    return { kind: 'button', label: a.label === 'P5' ? 'P4' : 'P5' };
  return { kind: 'button', label: a.label === 'C' ? 'D' : 'C' };
}

/**
 * Run the test to its result. `fluent` answers right at once (the page clock
 * is paused, so answers time as instant); otherwise every button probe is
 * answered wrong and the rest get "Not sure". Returns the probes seen.
 */
async function runTest(page: Page, fluent: boolean): Promise<string[]> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await page.getByRole('button', { name: 'Start the test' }).click();
  await expect(dialog(page)).toBeVisible();
  const seen: string[] = [];
  for (let n = 0; n < 200 && !(await result(page).isVisible()); n++) {
    const id = (await probe(page).getAttribute('data-item'))!;
    seen.push(id);
    if (n === 0) {
      await expectNoHorizontalOverflow(page);
      const cell = await dialog(page).locator('[data-cell="s1f5"]').boundingBox();
      expect(cell!.width).toBeGreaterThanOrEqual(44);
      expect(cell!.height).toBeGreaterThanOrEqual(44);
    }
    const right = await solve(page, id);
    const a = right && (fluent ? right : wrongFor(right));
    if (!a) {
      await dialog(page).getByRole('button', { name: 'Not sure' }).click();
    } else {
      await give(page, a);
      if (fluent) {
        await expect(dialog(page).getByTestId('feedback-correct')).toBeVisible();
        await page.clock.runFor(AUTO_ADVANCE_MS);
      } else {
        await expect(dialog(page).getByTestId('feedback-wrong')).toBeVisible();
        await dialog(page).getByRole('button', { name: 'Continue' }).click();
      }
    }
    await expect(probe(page).or(result(page))).toBeVisible();
    if (await probe(page).isVisible()) {
      await expect(probe(page)).not.toHaveAttribute('data-item', id);
    }
  }
  await page.clock.resume();
  await expect(result(page)).toBeVisible();
  return seen;
}

/** A skill's status in Learn. */
async function learnStatus(page: Page, module: string, skillId: string): Promise<string | null> {
  await page.goto(`/learn?module=${module}`);
  await expect(page.locator('[data-loaded="true"]')).toBeVisible();
  const skill = page.getByTestId(`skill-${skillId}`);
  await expect(skill).toBeVisible();
  return skill.getAttribute('data-status');
}

/** Every stored card's stability and due time, and every skill's status and guide level. */
async function snapshot(page: Page) {
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
    type Card = { itemId: string; fsrs: { stability: number; due: Date; lapses: number } };
    type State = { skillId: string; status: string; guideLevel: number };
    const cards = Object.fromEntries(
      (await all<Card>('cards')).map((c) => [
        c.itemId,
        [c.fsrs.stability, new Date(c.fsrs.due).getTime(), c.fsrs.lapses],
      ]),
    );
    const states = Object.fromEntries(
      (await all<State>('skillStates')).map((s) => [s.skillId, [s.status, s.guideLevel]]),
    );
    db.close();
    return { cards, states };
  });
}

// The install step (M1-29) has its own spec.
test.beforeEach(({ page }) => skipInstallTip(page));

test.describe('M2-15 retake the placement test', () => {
  test('a learner who skipped placement retakes it and skips ahead in Learn', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'The full flow runs on the iPad projects.');
    // Dozens of probes, twice; leave room for a loaded machine.
    test.setTimeout(180_000);
    await page.clock.install();
    await skipOnboardingPlacement(page);
    expect(await learnStatus(page, 'notes-2', 'C2.all-notes')).not.toBe('mastered');

    await openRetake(page);
    await expect(page.getByText(/^It checks .*Neck basics.*Intervals.*Chords/)).toBeVisible();
    const seen = await runTest(page, true);
    // Every topic with skills and a drill is probed, C4's key spelling included. This
    // key says "Not sure" to it, so C5's chords (behind C4, M2-16) are skipped. Which
    // drill asks a sampled item is chance (D1 or D2, D5 or D6), so check each topic.
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
    await expect(result(page)).toHaveText(/You already know these/);
    await page.getByRole('link', { name: 'See your skills in Learn' }).click();
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();

    for (const [module, skillId] of [
      ['notes-1', 'F2.string6-naturals'],
      ['notes-1', 'F2.string5-naturals'],
      ['notes-2', 'C2.all-notes'],
    ] as const) {
      expect(await learnStatus(page, module, skillId)).toBe('mastered');
    }
    expect(await learnStatus(page, 'notes-1', 'F1.alphabet')).toMatch(/^(practising|mastered)$/);
    expect(await learnStatus(page, 'intervals', 'C3.thirds')).toMatch(/^(practising|mastered)$/);

    // A second retake answered badly loses nothing.
    const before = await snapshot(page);
    await openRetake(page);
    await runTest(page, false);
    const after = await snapshot(page);
    expect(Object.keys(after.cards).sort()).toEqual(Object.keys(before.cards).sort());
    for (const [id, [stability, due, lapses]] of Object.entries(before.cards)) {
      const [s, d, l] = after.cards[id]!;
      expect(s).toBeGreaterThanOrEqual(stability!);
      expect(d).toBeGreaterThanOrEqual(due!);
      expect(l).toBe(lapses);
    }
    expect(after.states).toEqual(before.states);
    expect(await learnStatus(page, 'notes-2', 'C2.all-notes')).toBe('mastered');
  });

  test('Settings opens the retake full screen, and it can finish early @smoke', async ({
    page,
  }) => {
    await skipOnboardingPlacement(page);
    await openRetake(page);
    await expectNoHorizontalOverflow(page);
    // Full screen: no sidebar or tab bar.
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start the test' }).click();
    await expect(probe(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await dialog(page).getByRole('button', { name: 'Finish now' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(result(page)).toHaveText(/Nothing to skip yet/);
    await page.getByRole('link', { name: 'See your skills in Learn' }).click();
    await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();

    await page.goto('/placement');
    await page.getByRole('link', { name: 'Back to Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });
});
