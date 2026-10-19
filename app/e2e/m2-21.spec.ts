import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, F1_SKILLS, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { KNOWN_THIRDS_NAMES, SKILLS_BEFORE_C3, seedIntervals } from './helpers/intervals';

// M2-21: D3, D5, D6, D7 and D39 bring their help through the plugin's
// `contextPanel`, so the session draws the one panel wrapper for every drill.
// Each panel sits inside the session's context region, fits above the neck
// on an iPad in landscape (iPad mini included) and never overflows.

/**
 * The tallest a panel may be on iPad mini landscape: the header, the gap and
 * a 15-fret neck leave about this much above the feedback bar.
 */
const MINI_PANEL_MAX = 195;

const THIRDS = ['s6→s5', 's5→s4', 's4→s3', 's3→s2', 's2→s1'].flatMap((pair) =>
  ['m3', 'M3'].map((iv) => `${iv}@${pair}`),
);

interface Case {
  drill: string;
  /** Seeds the learner and starts a session on the drill. */
  start(page: Page): Promise<void>;
  /** The panel's heading. */
  heading: RegExp;
  /** The drill has a neck the panel must sit above in landscape. */
  neck: boolean;
}

const CASES: Case[] = [
  {
    drill: 'D3 note wheel',
    async start(page) {
      await focusSession(page, 'F1.alphabet');
      await expect(page.getByTestId('d3-hint')).toBeAttached();
    },
    heading: /^Note wheel$/,
    neck: true,
  },
  {
    drill: 'D5 interval name',
    async start(page) {
      // The thirds' tap direction is known, so the due name-it cards lead.
      await seedIntervals(page, {
        mastered: SKILLS_BEFORE_C3,
        cards: THIRDS.flatMap((shape) => [
          { itemId: `interval-name:${shape}`, skillId: 'C3.thirds', dueInDays: -1 },
          { itemId: `interval:${shape}`, skillId: 'C3.thirds', dueInDays: 30, stability: 60 },
        ]),
      });
      await focusSession(page, 'C3.thirds');
      await expect(page.getByTestId('d5-drill')).toBeVisible();
    },
    heading: /^Intervals$/,
    neck: true,
  },
  {
    drill: 'D6 interval tap',
    async start(page) {
      await seedIntervals(page, { mastered: SKILLS_BEFORE_C3, cards: KNOWN_THIRDS_NAMES });
      await focusSession(page, 'C3.thirds');
      await expect(page.getByTestId('d6-prompt')).toBeVisible();
    },
    heading: /^(Minor|Major) 3rd$/,
    neck: true,
  },
  {
    drill: 'D7 spell it',
    async start(page) {
      await masterSkills(page, F1_SKILLS);
      await focusSession(page, 'C4.sharp-keys');
      await expect(page.getByTestId('d7-drill')).toBeVisible();
    },
    heading: /^Major scale$/,
    neck: false,
  },
  {
    drill: 'D39 fret landmarks',
    async start(page) {
      await focusSession(page, 'F3.markers');
      await expect(page.getByTestId('d39-neck')).toBeVisible();
    },
    heading: /^Fret markers$/,
    neck: true,
  },
];

const panel = (page: Page) => page.getByTestId('context-panel');
const neck = (page: Page) => page.locator('svg[data-fret-from]');

/** The panel shows all of its content: nothing clipped or scrolled inside it. */
async function expectNoOverflow(el: Locator): Promise<void> {
  const { x, y } = await el.evaluate((e) => ({
    x: e.scrollWidth - e.clientWidth,
    y: e.scrollHeight - e.clientHeight,
  }));
  expect(x).toBeLessThanOrEqual(1);
  expect(y).toBeLessThanOrEqual(1);
  // Nor does any of its content stick out past its edges.
  const box = (await el.boundingBox())!;
  const spill = await el.evaluate((e) => {
    const outer = e.getBoundingClientRect();
    let worst = 0;
    for (const child of Array.from(e.querySelectorAll('*'))) {
      const r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      worst = Math.max(worst, outer.left - r.left, r.right - outer.right, r.bottom - outer.bottom);
    }
    return worst;
  });
  expect(spill, `content spills ${spill}px out of a ${box.width}px panel`).toBeLessThanOrEqual(1);
}

test.describe('M2-21 drill help on the session context panel', () => {
  for (const c of CASES) {
    test(`${c.drill}: its help is the session's one context panel`, async ({ page }, info) => {
      test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
      await freshStart(page);
      await c.start(page);

      // One panel, drawn by the session, holding the drill's own help.
      await expect(panel(page)).toHaveCount(1);
      await expect(panel(page)).toHaveAccessibleName('Context');
      await expect(panel(page).locator('aside')).toHaveCount(0);
      await expect(panel(page).getByRole('heading', { name: c.heading })).toBeVisible();
      await expect(panel(page).getByRole('heading', { name: 'Musical alphabet' })).toHaveCount(0);
      await expect(page.locator('main aside')).toHaveCount(1);

      await expectNoOverflow(panel(page));
      await expectNoHorizontalOverflow(page);
      await expect(panel(page)).toBeInViewport({ ratio: 1 });

      // iPad mini landscape leaves about 190px above a full neck: no taller.
      if (info.project.name === 'ipad-mini-landscape') {
        expect((await panel(page).boundingBox())!.height).toBeLessThanOrEqual(MINI_PANEL_MAX);
      }

      // Landscape: beside the prompt, above the neck, which stays fully on screen.
      if (c.neck && info.project.name !== 'ipad-portrait') {
        const box = (await panel(page).boundingBox())!;
        const neckBox = (await neck(page).boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(neckBox.y + 1);
        await expect(neck(page)).toBeInViewport({ ratio: 1 });
      }

      // Hiding help removes it; showing it brings the drill's panel back.
      await page.getByRole('button', { name: 'Hide help' }).click();
      await expect(panel(page)).toHaveCount(0);
      await page.getByRole('button', { name: 'Show help' }).click();
      await expect(panel(page).getByRole('heading', { name: c.heading })).toBeVisible();
    });
  }

  test('on a phone, help opens the note wheel as a sheet @smoke', async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone-smoke', 'phone flow');
    await freshStart(page);
    await CASES[0]!.start(page);
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Show help' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Note wheel' })).toBeVisible();
    await expect(panel(page).locator('aside')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Hide help' }).click();
    await expect(panel(page)).toHaveCount(0);
  });
});
