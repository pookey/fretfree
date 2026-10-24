import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M6-14: M6 drill polish (M6 QA findings 4, 5 and 9). The function drill
// states its worked example's fact once and the I5 panel its roles once; D18
// keeps the nut on iPad portrait and the portrait neck drills stack from the
// top; the relative-minor, I7 and D19 prompts fit the iPad screen without
// scrolling; I7 keeps markers off the nut's string names; the achievement
// toast stays clear of Progress's h1.

async function drillReady(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId)).toBeVisible();
  await expect(page.getByTestId('drill-loading')).toBeHidden();
}

const neck = (page: Page) => page.getByTestId('session').locator('svg[data-fret-from]');

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

/** The page scrolls by no more than a rounding pixel. */
async function expectNoScroll(page: Page): Promise<void> {
  const extra = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
  expect(extra).toBeLessThanOrEqual(1);
}

test.describe('M6-14 function drill', () => {
  test('@smoke a worked example answered states its fact once, with the task back', async ({
    page,
  }) => {
    await freshStart(page);
    await masterSkills(page, ['C9.minor', 'I4.minor-numerals']);
    await focusSession(page, 'I4.harmonic-minor');
    await drillReady(page, 'df-drill');
    const prompt = page.locator('#drill-prompt');
    const text = await prompt.innerText();
    const shown = /Tap (.+) to continue\./.exec(text)?.[1];
    expect(shown, text).toBeDefined();
    const fact = text.replace(/ Tap .+ to continue\.$/, '');

    // Answer with any other choice.
    const group = page.getByTestId('df-drill').getByRole('group');
    const labels = await group
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''));
    const wrong = labels.find((l) => l !== shown)!;
    await group.getByRole('button').filter({ hasText: wrong }).first().click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();

    await expect(prompt).not.toContainText('to continue');
    await expect(prompt).toHaveText(/\?$/);
    await expect(page.getByTestId('df-feedback')).toContainText(fact);
    await expect(page.getByTestId('df-drill').getByText(fact, { exact: false })).toHaveCount(1);
    await expect(page.getByTestId('df-explanation')).not.toContainText(/\bit to\b/);
    await expectNoHorizontalOverflow(page);
  });

  test('the I5 panel names the function roles once @layout', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['C9.pop']);
    await focusSession(page, 'I5.function-major');
    await drillReady(page, 'df-drill');
    const panel = page.getByTestId('context-panel');
    await expect(panel.getByRole('heading', { name: 'Chord function' })).toBeVisible();
    await expect(panel).toContainText('Chords in');
    await expect(panel.getByText(/pull home/)).toHaveCount(1);
    await expect(panel).not.toContainText('Function:');
  });
});

test.describe('M6-14 portrait neck drills', () => {
  test('D18 shows 12 frets with the nut and string names, stacked from the top @layout', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'ipad-portrait', 'iPad portrait only');
    // The first root and voicing on the list: C, whose triads fit frets 0–12.
    await page.addInitScript(() => {
      Math.random = () => 0.1;
    });
    await freshStart(page);
    await masterSkills(page, ['C6.triad-cores']);
    await focusSession(page, 'I1.major-top-sets');
    await drillReady(page, 'd18-drill');
    await expect(neck(page)).toHaveAttribute('data-fret-from', '0');
    await expect(neck(page)).toHaveAttribute('data-fret-to', '12');
    await expect(neck(page).getByTestId('string-name')).toHaveCount(6);
    await expectStacked(page, 'd18-drill');
  });

  test('C7, D18 and D19 stack prompt, neck and help from the top @layout', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'ipad-portrait', 'iPad portrait only');
    await freshStart(page);
    const steps = [
      { skill: 'C7.minor-boxes', drill: 'dpb-drill', adds: ['C6.minor-cores', 'C6.minor-shapes'] },
      { skill: 'I1.major-top-sets', drill: 'd18-drill', adds: ['C6.triad-cores'] },
      { skill: 'I1.voice-leading-top-sets', drill: 'd19-drill', adds: ['I1.major-top-sets'] },
    ];
    for (const { skill, drill, adds } of steps) {
      await masterSkills(page, adds);
      await focusSession(page, skill);
      await drillReady(page, drill);
      await expectStacked(page, drill);
    }
  });
});

/** Prompt, neck and panel follow one another, with no tall band between them. */
async function expectStacked(page: Page, drill: string): Promise<void> {
  const d = page.getByTestId(drill);
  const top = await box(d.locator('#drill-prompt'));
  const svg = await box(neck(page));
  const panel = await box(page.getByTestId('context-panel'));
  // The prompt row (prompt, hint, count) is about 160pt; then the neck, then help.
  expect(svg.y - (top.y + top.height)).toBeLessThan(180);
  expect(panel.y - (svg.y + svg.height)).toBeLessThan(60);
  expect(panel.y).toBeGreaterThan(svg.y + svg.height);
}

test.describe('M6-14 landscape fit', () => {
  test('the relative-minor, I7 and D19 prompts fit the screen, cells ≥ 44pt @layout', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'ipad-portrait', 'iPad landscape and the mini');
    await freshStart(page);
    const steps = [
      {
        skill: 'C7.relative',
        drill: 'dpb-drill',
        adds: ['C6.minor-cores', 'C6.minor-shapes', 'C7.minor-boxes', 'C7.major-boxes'],
      },
      { skill: 'I7.positions', drill: 'dpb-drill', adds: [] },
      {
        skill: 'I1.voice-leading-top-sets',
        drill: 'd19-drill',
        adds: ['C6.triad-cores', 'I1.major-top-sets'],
      },
    ];
    for (const { skill, drill, adds } of steps) {
      if (adds.length > 0) await masterSkills(page, adds);
      await focusSession(page, skill);
      await drillReady(page, drill);
      await expectNoScroll(page);
      // The narrowest cell, the highest fret, is still a comfortable target.
      const to = await neck(page).getAttribute('data-fret-to');
      const cell = await box(neck(page).locator(`[data-cell="s1f${to}"]`));
      expect(cell.width).toBeGreaterThanOrEqual(44);
      expect(cell.height).toBeGreaterThanOrEqual(44);
      if (skill === 'I7.positions') {
        // No marker in the open-string column, over the string names.
        await expect(neck(page).getByTestId('string-name')).toHaveCount(6);
        await expect(neck(page).locator('[data-testid^="marker-"][data-fret="0"]')).toHaveCount(0);
      }
    }
  });
});

test.describe('M6-14 Progress', () => {
  test('@smoke the achievement toast clears the h1, and fret ranges keep together @layout', async ({
    page,
  }) => {
    await freshStart(page, '/progress');
    const h1 = page.getByRole('heading', { name: 'Progress', level: 1 });
    await expect(h1).toBeVisible();
    await masterSkills(page, ['F2.string6-naturals']);
    const toast = page.getByTestId('achievement-toast');
    await expect(toast).toContainText('String 6 master');
    await expect(toast).toContainText('frets 0⁠–⁠12.');
    const t = await box(toast);
    const h = await box(h1);
    // Measure the heading's text, not its full-width block.
    const text = await h1.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = r.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    });
    const overlaps =
      t.x < text.right &&
      t.x + t.width > text.left &&
      t.y < text.bottom &&
      t.y + t.height > text.top;
    expect(overlaps, JSON.stringify({ toast: t, h1: text, block: h })).toBe(false);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('M6-14 toast in a session', () => {
  test('a badge earned mid-session waits for the shell, clear of the session header', async ({
    page,
  }) => {
    // Sessions are a fullscreen route, outside the shell that mounts the
    // toast, so the top-right corner (help, time left) is never covered.
    await freshStart(page);
    await focusSession(page, 'F1.alphabet');
    await masterSkills(page, ['F2.string6-naturals']);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('achievement-toast')).toHaveCount(0);
    await page.goto('/progress');
    await expect(page.getByTestId('achievement-toast')).toContainText('String 6 master');
  });
});
