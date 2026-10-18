import { expect, test, type Locator, type Page } from '@playwright/test';
import { freshStart, noteName } from './helpers';
import { focusSession } from './helpers/focus';
import { seedDueItems } from './helpers/octaves';

// M1-28: after a wrong answer, "That was …" and its Continue sat below the
// fold under the neck, so the app looked frozen. The session shell pins the
// feedback bar to the bottom of the viewport for every drill: Continue is on
// screen without scrolling, takes the focus, and Enter continues.

const PHONE_PORTRAIT = { width: 393, height: 659 };

interface DrillCase {
  drill: string;
  /** One known card, due now, at guide level 0: a recall prompt with nothing given away. */
  itemId: string;
  skillId: string;
  /** The prompt is on screen. */
  ready: (page: Page) => Locator;
  /** The control that answers wrongly. */
  wrong: (page: Page) => Promise<Locator>;
}

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cell = (page: Page, string: number, fret: number) =>
  neck(page).locator(`[data-cell="s${string}f${fret}"]`);
const choice = (page: Page, name: string) =>
  page
    .locator('[role="group"][aria-labelledby="drill-prompt"]')
    .getByRole('button', { name, exact: true });

async function markerFret(page: Page, testId: string): Promise<number> {
  return Number(await neck(page).getByTestId(testId).first().getAttribute('data-fret'));
}

const CASES: DrillCase[] = [
  {
    drill: 'D1 name the note',
    itemId: 'note@s6f3',
    skillId: 'F2.string6-naturals',
    ready: (page) => page.getByText('Name the highlighted note'),
    // String 6, fret 3 is G.
    wrong: async (page) => choice(page, 'C'),
  },
  {
    drill: 'D2 find the note',
    itemId: 'find:C@s6',
    skillId: 'F2.string6-naturals',
    ready: (page) => page.getByTestId('d2-prompt').filter({ hasText: 'Find C on string 6' }),
    // The open low E string.
    wrong: async (page) => cell(page, 6, 0),
  },
  {
    drill: 'D3 note wheel',
    itemId: 'letter:+1@C',
    skillId: 'F1.alphabet',
    ready: (page) => page.getByText('The note after C in the musical alphabet?'),
    wrong: async (page) => choice(page, 'G'),
  },
  {
    drill: 'D4 octave finder',
    itemId: 'octave:s4f5→s2',
    skillId: 'C1.octaves-gb-shift',
    ready: (page) => page.getByTestId('d4-prompt').filter({ hasText: 'Tap the octave of G' }),
    // Fret 8 is right; fret 7 forgets the G–B shift.
    wrong: async (page) => cell(page, 2, 7),
  },
  {
    drill: 'D5 interval name',
    itemId: 'interval-name:M3@s6→s5',
    skillId: 'C3.thirds',
    ready: (page) => page.getByText('Name the interval'),
    wrong: async (page) => {
      const names = await page
        .locator('[role="group"][aria-labelledby="drill-prompt"] button')
        .allTextContents();
      return choice(page, names.find((n) => n.trim() !== 'M3')!.trim());
    },
  },
  {
    drill: 'D6 interval tap',
    itemId: 'interval:M3@s6→s5',
    skillId: 'C3.thirds',
    ready: (page) => page.getByTestId('d6-prompt').filter({ hasText: 'major 3rd' }),
    // The M3 is a fret toward the nut on string 5; the root's own fret is a 4th.
    wrong: async (page) => cell(page, 5, await markerFret(page, 'marker-root')),
  },
];

async function startRecall(page: Page, c: DrillCase): Promise<void> {
  await freshStart(page);
  await seedDueItems(page, [{ itemId: c.itemId, skillId: c.skillId }], 0);
  await focusSession(page, c.skillId);
  await expect(c.ready(page)).toBeVisible();
}

/** Continue is wholly inside the viewport, and the bar is settled. */
async function expectContinueOnScreen(page: Page): Promise<Locator> {
  const bar = page.getByTestId('feedback-bar');
  await expect(bar).toHaveAttribute('data-state', 'wrong');
  await bar.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const button = bar.getByRole('button', { name: 'Continue' });
  const box = (await button.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  await expect(button).toBeFocused();
  return button;
}

/**
 * Answer wrongly with the page wherever the learner left it, then check the
 * feedback is on screen without any scrolling and Enter moves on.
 */
async function wrongThenEnter(page: Page, c: DrillCase): Promise<void> {
  const control = await c.wrong(page);
  // Bring the answer into view first, so the click itself doesn't scroll.
  await control.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  await control.click();
  await expect(page.getByTestId('feedback-wrong')).toContainText(/^That was /);
  await expectContinueOnScreen(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('feedback-wrong')).toHaveCount(0);
  await expect(page.getByTestId('feedback-bar')).not.toHaveAttribute('data-state');
}

/**
 * While a prompt is open, the bar's room is clear of the neck and the answers.
 * It is pinned to the bottom, so check with the page scrolled to its end; a
 * phone on its side pins it over the header instead, so check from the top.
 */
async function expectBarClearOfDrill(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  const atTop = vp.width > vp.height && vp.height < 500;
  await page.evaluate(
    (top) => window.scrollTo(0, top ? 0 : document.documentElement.scrollHeight),
    atTop,
  );
  const bar = (await page.getByTestId('feedback-bar').boundingBox())!;
  expect(atTop ? bar.y : bar.y + bar.height).toBeCloseTo(atTop ? 0 : vp.height, 0);
  const rects = await page
    .getByTestId('session')
    .locator('svg[data-fret-from], button')
    .evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
  expect(rects.length).toBeGreaterThan(0);
  for (const r of rects) {
    if (atTop) expect(r.top).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
    else expect(r.bottom).toBeLessThanOrEqual(bar.y + 1);
  }
}

test.describe('M1-28 wrong-answer feedback stays on screen', () => {
  for (const c of CASES) {
    test(`${c.drill}: Continue is on screen, focused, and Enter continues`, async ({
      page,
    }, info) => {
      test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
      await startRecall(page, c);
      await expectBarClearOfDrill(page);
      // From the top of the page, as a learner who never scrolled.
      await page.evaluate(() => window.scrollTo(0, 0));
      await wrongThenEnter(page, c);
    });
  }

  test('a tap on Continue continues too, and a right answer still auto-advances', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    const d2 = CASES[1]!;
    await startRecall(page, d2);
    await (await d2.wrong(page)).click();
    const button = await expectContinueOnScreen(page);
    await button.click();
    await expect(page.getByTestId('feedback-wrong')).toHaveCount(0);

    // The miss comes back; the right fret gets the brief ✓ and moves on alone.
    await expect(d2.ready(page)).toBeVisible();
    const fret = Array.from({ length: 13 }, (_, f) => f).find((f) => noteName(6, f) === 'C')!;
    await cell(page, 6, fret).click();
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ C');
    await expect(page.getByTestId('feedback-bar')).toHaveAttribute('data-state', 'correct');
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  });

  test('on a phone in either orientation, every drill @smoke', async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone-smoke', 'phone flow');
    const landscape = page.viewportSize()!;
    for (const c of CASES) {
      for (const size of [landscape, PHONE_PORTRAIT]) {
        await page.setViewportSize(size);
        await startRecall(page, c);
        await expectBarClearOfDrill(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await wrongThenEnter(page, c);
      }
    }
  });
});
