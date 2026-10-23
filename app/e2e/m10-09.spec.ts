import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName, targetNote } from './helpers';
import { focusSession } from './helpers/focus';

// M10-09: one vocabulary on the screens. The learner's unit is a "card"
// everywhere; learning, stable and mastered are defined where their numbers
// first appear (the Learn map, the session summary, Progress); and Progress
// names its rows by Learn's modules.

const SKILL = 'F2.string6-naturals';

/** Words for the unit that the screens no longer use. */
const OLD_UNITS = /\b(items?|facts?|in rotation)\b/i;

async function expectLegend(scope: Locator): Promise<void> {
  const legend = scope.getByRole('note', { name: 'What the numbers mean' });
  await expect(legend).toBeVisible();
  await expect(legend.getByRole('term')).toHaveText(['Learning', 'Stable', 'Mastered']);
  await expect(legend.getByRole('definition')).toHaveText([
    'you got the card right last time.',
    /^you’d still recall the card \d+ days from now\.$/,
    /^\d+% of a skill’s cards are stable, and you answer them at your speed target\.$/,
  ]);
}

/** Name the highlighted note (D1) or tap the named one (D2), correctly. */
async function answerCorrectly(page: Page): Promise<void> {
  const find = page.getByTestId('d2-prompt');
  const named = page.getByTestId('marker-target').first();
  // D2's worked example also marks its targets, so check for its prompt first.
  await expect(find.or(named).first()).toBeVisible();
  if (await find.isVisible()) {
    const [, pc, string] = /(?:Find|This is) ([A-G]) on string (\d)/.exec(
      (await find.textContent()) ?? '',
    )!;
    const fret = Array.from({ length: 13 }, (_, f) => f).find(
      (f) => noteName(Number(string), f) === pc,
    )!;
    await page.locator(`[data-cell="s${string}f${fret}"]`).click();
  } else {
    const note = await targetNote(page);
    await page
      .getByRole('group', { name: /highlighted|this is/i })
      .getByRole('button', { name: note, exact: true })
      .click();
  }
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

test.describe('M10-09 one vocabulary', () => {
  test('Learn defines learning, stable and mastered above the module cards @smoke', async ({
    page,
  }) => {
    await freshStart(page, '/learn');
    const map = page.getByRole('region', { name: 'Modules' });
    await expectLegend(map);
    await expect(page.getByTestId('module-notes-1')).toContainText(/\d+\/\d+ skills mastered/);
    await expect(map).not.toContainText(OLD_UNITS);
    await expectNoHorizontalOverflow(page);
  });

  test('a module detail keeps the legend, and a locked one says what it waits for', async ({
    page,
  }) => {
    await freshStart(page, '/learn?module=chords');
    const detail = page.getByTestId('module-detail');
    await expect(detail.getByRole('heading', { name: 'Chords', level: 2 })).toBeVisible();
    await expectLegend(detail);
    await expect(detail.getByTestId('preview-note')).toHaveText(
      /^You can look around this module now and try its examples\. Its skills join your daily sessions on their own/,
    );
    await expect(detail).not.toContainText(/feeding your sessions/);
    // The test-out offer names what to master and what to be practising (M10-01).
    await expect(page.getByRole('region', { name: 'Already know this?' })).toContainText(
      /Chords opens once you’ve mastered .+ and are practising .+\. Already there\?/,
    );
    await expect(detail).not.toContainText(OLD_UNITS);
  });

  test('the session summary counts cards and explains its tiles @smoke', async ({ page }) => {
    await freshStart(page);
    await focusSession(page, SKILL);
    for (let n = 0; n < 3; n++) await answerCorrectly(page);
    await page.getByRole('button', { name: 'End session' }).click();
    const summary = page.getByTestId('session-summary');
    await expect(summary).toBeVisible();

    await expect(page.getByTestId('summary-learning')).toHaveText('3');
    await expectLegend(summary);
    await expect(page.getByTestId('summary-progress')).toHaveText(
      /^3 cards learning\. They become stable as you recall them .*today's cards come back /,
    );
    await expect(summary).not.toContainText(OLD_UNITS);
    await expectNoHorizontalOverflow(page);

    // Back on Today, what's queued is cards too.
    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByTestId('new-count')).toHaveText(/^\d+$/);
    await expect(page.getByText('New cards waiting')).toBeVisible();
    await expect(page.getByText(/New notes waiting/)).toHaveCount(0);
  });

  test('Progress names its rows as Learn names its modules @smoke', async ({ page }) => {
    await freshStart(page);
    await focusSession(page, SKILL);
    for (let n = 0; n < 2; n++) await answerCorrectly(page);
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('session-summary')).toBeVisible();

    await page.goto('/progress');
    const panel = page.locator('[data-progress-panel="topics"]');
    await expect(page.getByTestId('topics-panel')).toHaveAttribute('data-loaded', 'true');
    await expect(panel.getByRole('heading', { name: 'Modules', level: 2 })).toBeVisible();
    await expectLegend(panel);

    // String 6's natural notes are part of Learn's Neck basics module, listed
    // by topic underneath because the module holds three.
    const neck = panel.getByTestId('progress-module-notes-1');
    await expect(neck.getByRole('heading', { name: 'Neck basics', level: 3 })).toBeVisible();
    await expect(neck.getByTestId('topic-counts')).toHaveText(/^2 learning · 0 stable of \d+$/);
    await expect(neck.getByTestId('topic-F2')).toHaveText(
      /^Natural notes: 2 learning · 0 stable of \d+$/,
    );
    await expect(page.getByText('Cards practised', { exact: true })).toBeVisible();
    await expect(page.getByTestId('topics-panel')).not.toContainText(OLD_UNITS);

    // The same title on Learn.
    await page.goto('/learn');
    await expect(
      page.getByTestId('module-notes-1').getByText('Neck basics', { exact: true }),
    ).toBeVisible();
  });
});
