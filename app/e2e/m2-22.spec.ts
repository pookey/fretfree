import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { C3_SKILLS } from './helpers/intervals';
import { d5ButtonName } from './helpers/interval-names';
import { answerToWideD5, d5CorrectAnswer, reachWideD5, seedWideD5 } from './helpers/wide-intervals';

// M2-22: D5 at its widest scope (all 12 intervals) packs the legend into
// one-line rows (`M3 major 3rd · 4`) in a wider panel, drops the level-3
// count tip the rows make redundant, and sets the answers in rows of six, so
// the full neck still fits below on an iPad in landscape.

const panel = (page: Page) => page.getByTestId('context-panel');
const legend = (page: Page) => page.getByTestId('interval-legend');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const choices = (page: Page) =>
  page
    .getByTestId('d5-drill')
    .getByRole('group', { name: /interval/i })
    .getByRole('button');

/** Nothing in the panel is clipped, scrolled sideways or sticks out of it. */
async function expectFits(el: Locator, vertical = true): Promise<void> {
  const spill = await el.evaluate((e) => {
    const outer = e.getBoundingClientRect();
    let worst = Math.max(e.scrollWidth - e.clientWidth, 0);
    for (const child of Array.from(e.querySelectorAll('*'))) {
      const r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      worst = Math.max(worst, outer.left - r.left, r.right - outer.right);
    }
    return { x: worst, y: e.scrollHeight - e.clientHeight };
  });
  expect(spill.x, 'content spills sideways').toBeLessThanOrEqual(1);
  if (vertical) expect(spill.y, 'content scrolls inside the panel').toBeLessThanOrEqual(1);
}

/** Landscape iPad: the panel and the prompt column end above the neck, which clears the bar. */
async function expectAboveNeck(page: Page): Promise<void> {
  const neckBox = (await neck(page).boundingBox())!;
  const box = (await panel(page).boundingBox())!;
  const last = (await choices(page).last().boundingBox())!;
  const bar = (await page.getByTestId('feedback-bar').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(neckBox.y + 1);
  expect(last.y + last.height).toBeLessThanOrEqual(neckBox.y + 1);
  expect(neckBox.y + neckBox.height).toBeLessThanOrEqual(bar.y + 1);
}

/** The pseudo-element mark and left border a legend row carries in feedback. */
async function rowMark(row: Locator): Promise<{ mark: string; border: string }> {
  return row.evaluate((li) => ({
    mark: getComputedStyle(li.querySelector('strong')!, '::after').content,
    border: getComputedStyle(li).borderLeftStyle,
  }));
}

test.describe('M2-22 D5 at its widest scope', () => {
  test('one-line legend, rows of six, and the neck below @layout', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    test.setTimeout(240_000);
    const landscape = info.project.name !== 'ipad-portrait';
    await freshStart(page);
    await seedWideD5(page);
    await reachWideD5(page);

    // One line per interval, "half steps" kept for screen readers.
    await expect(legend(page)).toHaveAttribute('data-layout', 'lines');
    await expect(legend(page).getByRole('listitem')).toHaveCount(12);
    await expect(legend(page).locator('[data-interval="M3"]')).toHaveText(
      'M3major 3rd· 4 half steps',
    );
    await expect(legend(page).locator('[data-interval="M3"] .visually-hidden')).toBeAttached();
    // The rows carry the counts, so the level-3 count tip is gone.
    await expect(panel(page)).not.toContainText('Count half steps');

    // Answers in two rows of six, each still a full-size tap target.
    const boxes = await Promise.all((await choices(page).all()).map((b) => b.boundingBox()));
    expect(boxes).toHaveLength(12);
    const tops = boxes.map((b) => Math.round(b!.y));
    expect(new Set(tops.slice(0, 6)).size).toBe(1);
    expect(new Set(tops.slice(6)).size).toBe(1);
    expect(tops[6]!).toBeGreaterThan(tops[0]!);
    for (const b of boxes) expect(b!.height).toBeGreaterThanOrEqual(44);

    await expectFits(panel(page));
    await expectNoHorizontalOverflow(page);
    if (landscape) await expectAboveNeck(page);

    // A wrong answer marks both rows by mark and border style, not colour
    // alone, and the panel still fits.
    const answer = await d5CorrectAnswer(page);
    const wrong = answer === 'P8' ? 'm2' : 'P8';
    await choices(page)
      .and(page.getByRole('button', { name: d5ButtonName(wrong), exact: true }))
      .click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    const expected = legend(page).locator(`[data-interval="${answer}"]`);
    const given = legend(page).locator(`[data-interval="${wrong}"]`);
    await expect(expected).toHaveAttribute('data-state', 'expected');
    await expect(given).toHaveAttribute('data-state', 'wrong');
    expect(await rowMark(expected)).toEqual({ mark: '" ✓"', border: 'solid' });
    expect(await rowMark(given)).toEqual({ mark: '" ✗"', border: 'dashed' });
    await expectFits(panel(page));
    if (landscape) await expectAboveNeck(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('on a phone, the wide legend wraps inside the help sheet @smoke @phone', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'iphone-smoke', 'phone flow');
    test.setTimeout(240_000);
    await freshStart(page);
    await seedWideD5(page);
    await focusSession(page, C3_SKILLS);
    // Help is a sheet over the answers here, so answer with it closed: any
    // prompt with a guide (the hint) also has a legend.
    const hint = page.getByTestId('d5-hint');
    await answerToWideD5(page, async () => (await hint.innerText()).trim() !== '');

    await page.getByRole('button', { name: 'Show help' }).click();
    await expect(legend(page)).toHaveAttribute('data-layout', 'lines');
    await expect(legend(page).getByRole('listitem')).toHaveCount(12);
    await expectFits(panel(page), false);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Hide help' }).click();
    await expect(panel(page)).toHaveCount(0);
  });
});
