import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, noteName, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M1-24: the M1 definition of done (design §11). A learner's first week, on
// a mocked clock: onboarding → three daily sessions → streak 3, a due-review
// session and a filled-in heatmap; a goal and weekend-amulet change from
// Settings mid-week holds the streak over a weekend. Then a screenshot pass of
// every screen, which also runs against production:
//   E2E_BASE_URL=https://fretfree.app ../scripts/e2e-slot.sh playwright test m1-24 --grep @screens

// A fixed zone, so local dates (and the weekend) don't depend on the machine.
test.use({ timezoneId: 'Europe/London' });

const SKILL = 'F2.string6-naturals';
/** Wednesday 21 October 2026, 08:00 local. */
const WEEK_START = new Date('2026-10-21T08:00:00+01:00');
const DAY = 86_400_000;

const hero = (page: Page) => page.getByRole('region', { name: 'Streak and daily goal' });
const choice = (page: Page) => page.getByTestId('onboarding-choice');

/** Onboarding from a first launch: pick the Casual 5-minute goal and skip the rest. */
async function onboard(page: Page): Promise<void> {
  await firstLaunch(page);
  await choice(page).getByRole('button', { name: 'Get started' }).click();
  const progress = page.getByTestId('onboarding-progress');
  const today = page.getByRole('heading', { name: 'Today', level: 1 });
  // Step by step rather than a fixed list, so a new onboarding step doesn't break the week.
  await expect(progress).toHaveText(/^Step 1 of (\d+)$/);
  const steps = Number(/of (\d+)/.exec((await progress.textContent())!)![1]);
  for (let n = 1; n <= steps; n++) {
    await expect(progress).toHaveText(`Step ${n} of ${steps}`);
    const heading = await page.getByRole('heading', { level: 1 }).textContent();
    if (heading === 'Your daily goal') {
      await choice(page)
        .getByRole('radio', { name: /Casual/ })
        .check();
      await choice(page).getByRole('button', { name: 'Continue' }).click();
    } else {
      await choice(page).getByRole('button', { name: 'Skip this step' }).click();
    }
  }
  await expect(today).toBeVisible();
}

/**
 * Answer whatever note prompt is on screen correctly: D1 names the
 * highlighted note, D2 taps the named note on its string. Returns the cell.
 */
async function answerCorrectly(page: Page): Promise<string> {
  const find = page.getByTestId('d2-prompt');
  const named = page.getByTestId('marker-target').first();
  // D2's worked example also marks its targets, so check for its prompt first.
  await expect(find.or(named).first()).toBeVisible();
  let cell: string;
  if (await find.isVisible()) {
    const [, pc, string] = /(?:Find|This is) ([A-G]) on string (\d)/.exec(
      (await find.textContent()) ?? '',
    )!;
    const fret = Array.from({ length: 13 }, (_, f) => f).find(
      (f) => noteName(Number(string), f) === pc,
    )!;
    cell = `s${string}f${fret}`;
    await page.locator(`[data-cell="${cell}"]`).click();
  } else {
    cell = `s${await named.getAttribute('data-string')}f${await named.getAttribute('data-fret')}`;
    const note = await targetNote(page);
    await page
      .getByRole('group', { name: /highlighted|this is/i })
      .getByRole('button', { name: note, exact: true })
      .click();
  }
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return cell;
}

/**
 * A focused session of `minutes` answers, a minute apart, then back to Today.
 * A session as long as its time budget ends by itself on the last answer.
 */
async function practise(page: Page, minutes: number): Promise<string[]> {
  await focusSession(page, SKILL);
  const cells: string[] = [];
  for (let i = 0; i < minutes; i++) {
    await page.clock.fastForward('01:00');
    cells.push(await answerCorrectly(page));
  }
  const end = page.getByRole('button', { name: 'End session' });
  const summary = page.getByTestId('session-summary');
  await expect(end.or(summary)).toBeVisible();
  if (await end.isVisible()) await end.click();
  await expect(page.getByTestId('summary-items')).toHaveText(String(minutes));
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  return cells;
}

/** Jump to `day` days after the week starts (08:00 local), and reopen the app. */
async function openOnDay(page: Page, day: number): Promise<void> {
  await page.clock.setSystemTime(new Date(WEEK_START.getTime() + day * DAY));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

async function expectStreak(page: Page, info: TestInfo, streak: number): Promise<void> {
  await expect(hero(page).getByTestId('streak-count')).toHaveText(String(streak));
  if (info.project.name !== 'iphone-smoke') {
    await expect(page.getByTestId('sidebar-streak-count')).toHaveText(String(streak));
  }
}

async function dueCount(page: Page): Promise<number> {
  const due = page.getByTestId('due-count');
  await expect(due).toHaveText(/^\d+$/);
  return Number(await due.textContent());
}

async function openProgress(page: Page): Promise<void> {
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
}

const map = (page: Page) => page.getByRole('region', { name: 'Mastery map' });
const tile = (page: Page, cell: string) =>
  map(page).locator(`[data-testid="heat-tile"][data-cell="${cell}"]`);

test.describe('M1-24 the first week', () => {
  test('onboarding, three daily sessions, due reviews, the heatmap and a weekend @smoke', async ({
    page,
  }, info) => {
    // A week of sessions in one test.
    test.slow();
    await page.clock.install({ time: WEEK_START });
    await onboard(page);
    await expect(page.getByTestId('start-session')).toBeVisible();
    await expect(hero(page).getByRole('img', { name: 'Daily goal: 0 of 5 minutes' })).toBeVisible();
    await expectStreak(page, info, 0);
    expect(await dueCount(page)).toBe(0);

    // Wednesday: the first session meets the 5-minute goal.
    const wednesday = await practise(page, 5);
    await expect(
      hero(page).getByRole('img', { name: /^Daily goal met: 5 of 5 minutes$/ }),
    ).toHaveAttribute('data-met', 'true');
    await expectStreak(page, info, 1);

    // The heatmap has filled in every cell the session answered.
    await openProgress(page);
    await expect(map(page).getByTestId('heatmap-panel')).toHaveAttribute('data-loaded', 'true');
    for (const cell of new Set(wednesday)) await expect(tile(page, cell)).toHaveCount(1);
    const tilesAfterDay1 = await map(page).getByTestId('heat-tile').count();

    // Thursday: yesterday's facts are due, and the session reviews them.
    await openOnDay(page, 1);
    await expectStreak(page, info, 1);
    const dueThursday = await dueCount(page);
    expect(dueThursday).toBeGreaterThan(0);
    await practise(page, 5);
    expect(await dueCount(page)).toBeLessThan(dueThursday);
    await expectStreak(page, info, 2);

    // Friday: streak 3.
    await openOnDay(page, 2);
    await practise(page, 5);
    await expectStreak(page, info, 3);

    await openProgress(page);
    await expect(map(page).getByTestId('heatmap-panel')).toHaveAttribute('data-loaded', 'true');
    expect(await map(page).getByTestId('heat-tile').count()).toBeGreaterThan(tilesAfterDay1);

    // Mid-week, from Settings: a 10-minute goal and the weekend amulet.
    const practice = page.getByRole('region', { name: 'Settings' }).getByRole('group', {
      name: 'Practice',
    });
    await practice.getByRole('combobox', { name: 'Daily goal' }).selectOption('10');
    await practice.getByRole('checkbox', { name: 'Weekend amulet' }).click();
    await expect(practice.getByRole('checkbox', { name: 'Weekend amulet' })).toBeChecked();

    // No practice on Saturday or Sunday, and no freeze held: the amulet holds the streak.
    await openOnDay(page, 5);
    await expect(hero(page).getByTestId('freezes')).toHaveText('No streak freezes held');
    await expectStreak(page, info, 3);
    await expect(
      hero(page).getByRole('img', { name: 'Daily goal: 0 of 10 minutes' }),
    ).toBeVisible();

    // Monday: the new goal takes ten minutes, and the streak reaches 4.
    await practise(page, 10);
    await expect(
      hero(page).getByRole('img', { name: /^Daily goal met: \d+ of 10 minutes$/ }),
    ).toBeVisible();
    await expectStreak(page, info, 4);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('M1-24 streak repair', () => {
  test('a missed day breaks the streak, and a double session the next day repairs it', async ({
    page,
  }, info) => {
    test.slow();
    // Monday to Thursday of the second week, so no weekend falls inside.
    await page.clock.install({ time: new Date(WEEK_START.getTime() + 5 * DAY) });
    await onboard(page);
    await practise(page, 5);
    await openOnDay(page, 6);
    await practise(page, 5);
    await expectStreak(page, info, 2);

    // Wednesday is missed with no freeze held: Thursday opens on a broken streak.
    await openOnDay(page, 8);
    await expectStreak(page, info, 0);

    // A double session (twice the 5-minute goal) inside 48 hours restores it: 2 + 1.
    await practise(page, 10);
    await expectStreak(page, info, 3);
  });
});

/** Screenshot the page in both themes, into the test's output folder. */
async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  await expectNoHorizontalOverflow(page);
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({
      path: info.outputPath(`${name}-${colorScheme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
}

test.describe('M1-24 screenshot pass', () => {
  test('every M1 screen renders without overflow, dark and light @smoke @screens', async ({
    page,
  }, info) => {
    test.slow();
    await firstLaunch(page);
    await shoot(page, info, '01-onboarding');
    await choice(page).getByRole('button', { name: 'Get started' }).click();
    await shoot(page, info, '02-onboarding-step');
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await shoot(page, info, '03-today-new');

    await focusSession(page, SKILL);
    await expect(page.getByTestId('marker-target').first()).toBeVisible();
    await shoot(page, info, '04-session-prompt');
    await answerCorrectly(page);
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('session-summary')).toBeVisible();
    await shoot(page, info, '05-session-summary');
    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await shoot(page, info, '06-today-practised');

    for (const [n, path, heading] of [
      ['07', '/learn', 'Learn'],
      ['08', '/explore', 'Explore'],
      ['09', '/progress', 'Progress'],
      ['10', '/about', 'About FretFree'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      await shoot(page, info, `${n}-${path.slice(1)}`);
    }
  });
});
