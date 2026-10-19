import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, F1_SKILLS, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { seedIntervals } from './helpers/intervals';

// M3-11: the session context panel's design §7 contents, declared by each
// drill's `contextPanel`: D7's key and its diatonic chords, D8's current
// chord diagram and D9's CAGED chain mini-map (D5's interval legend came
// with M2-21). Each follows guide fading, is hidden at level 0, never shows
// the answer before it is given (research/02 rule 4), and fits above the neck
// on an iPad in landscape.

/** The tallest a panel may be on iPad mini landscape (as M2-21 measured it). */
const MINI_PANEL_MAX = 195;

const SHAPES = ['C', 'A', 'G', 'E', 'D'] as const;
const D9_PREREQS = ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads'];
const D8_PREREQS = D9_PREREQS;
const TRIAD_TONES = ['1@major', '1@minor', '3@major', 'b3@minor', '5@major', '5@minor'];
const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];

type Level = 0 | 1 | 2 | 3;

const panel = (page: Page) => page.getByTestId('context-panel');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const map = (page: Page) => panel(page).getByTestId('caged-chain-map');
const wrong = (page: Page) => page.getByTestId('feedback-wrong');

/**
 * Every card of one skill known and due, in practice at `level`, with its
 * prerequisites mastered: the session serves recall prompts at that level,
 * with no worked examples.
 */
async function seedReviews(
  page: Page,
  o: {
    mastered: readonly string[];
    skillId: string;
    due: string[];
    later?: string[];
    level: Level;
  },
): Promise<void> {
  await freshStart(page);
  await seedIntervals(page, {
    mastered: o.mastered,
    cards: [
      ...o.due.map((itemId) => ({ itemId, skillId: o.skillId, dueInDays: -1 })),
      ...(o.later ?? []).map((itemId) => ({ itemId, skillId: o.skillId, dueInDays: 30 })),
    ],
    practising: [{ skillId: o.skillId, guideLevel: o.level }],
  });
  await focusSession(page, o.skillId);
}

const startD9 = (page: Page, level: Level) =>
  seedReviews(page, {
    mastered: D9_PREREQS,
    skillId: 'C6.triad-cores',
    due: SHAPES.map((s) => `caged-core:${s}-shape@major`),
    level,
  });

const startD8 = (page: Page, level: Level) =>
  seedReviews(page, {
    mastered: D8_PREREQS,
    skillId: 'C5.tones-triads',
    // Tap cards only, so a tap off the shape answers wrong and the feedback stays.
    due: TRIAD_TONES.map((t) => `chord-tone:${t}`),
    later: TRIAD_TONES.map((t) => `chord-tone-name:${t}`),
    level,
  });

const startD7 = (page: Page, level: Level) =>
  seedReviews(page, {
    mastered: F1_SKILLS,
    skillId: 'C4.sharp-keys',
    due: SHARP_KEYS.map((k) => `spell-key:${k}`),
    level,
  });

/** The shape D9 asks for, from its prompt. */
async function askedShape(page: Page): Promise<string> {
  const text = await page.getByTestId('d9-prompt').innerText();
  const shape = /(?:Build|This is) the ([CAGED])[- ]shape/.exec(text)?.[1];
  expect(shape, text).toBeDefined();
  return shape!;
}

/** Tap a cell on string 3 outside D8's shape: a wrong answer, so feedback stays up. */
async function tapOffShape(page: Page): Promise<void> {
  const shape = neck(page).locator('[data-testid^="marker-"][data-string="3"]');
  const frets = new Set(
    await shape.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-fret')))),
  );
  const from = Number(await neck(page).getAttribute('data-fret-from'));
  const to = Number(await neck(page).getAttribute('data-fret-to'));
  const fret = [...Array(to - from + 1).keys()]
    .map((i) => from + i)
    .find((f) => !frets.has(f) && f !== 0);
  await neck(page).locator(`[data-cell="s3f${fret}"]`).click();
  await expect(wrong(page)).toBeVisible();
}

/** Fill D7's blanks with the first note on offer (repeated, so wrong), then check. */
async function answerD7Wrong(page: Page): Promise<void> {
  const drill = page.getByTestId('d7-drill');
  const first = drill.getByRole('group').getByRole('button').first();
  const check = drill.getByRole('button', { name: 'Check' });
  while (await check.isDisabled()) await first.click();
  await check.click();
  await expect(wrong(page)).toBeVisible();
}

/** The panel fits: no overflow, on screen, within the iPad mini budget, above the neck. */
async function expectFits(page: Page, project: string, hasNeck: boolean): Promise<void> {
  const box = (await panel(page).boundingBox())!;
  await expectNoOverflow(panel(page));
  await expectNoHorizontalOverflow(page);
  await expect(panel(page)).toBeInViewport({ ratio: 1 });
  if (project === 'ipad-mini-landscape') expect(box.height).toBeLessThanOrEqual(MINI_PANEL_MAX);
  if (hasNeck && project !== 'ipad-portrait') {
    const neckBox = (await neck(page).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(neckBox.y + 1);
    await expect(neck(page)).toBeInViewport({ ratio: 1 });
  }
}

/** Nothing clipped or scrolled inside the panel, and nothing sticking out of it. */
async function expectNoOverflow(el: Locator): Promise<void> {
  const { x, y, spill } = await el.evaluate((e) => {
    const outer = e.getBoundingClientRect();
    let worst = 0;
    for (const child of Array.from(e.querySelectorAll('*'))) {
      const r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      worst = Math.max(worst, outer.left - r.left, r.right - outer.right, r.bottom - outer.bottom);
    }
    return { x: e.scrollWidth - e.clientWidth, y: e.scrollHeight - e.clientHeight, spill: worst };
  });
  expect(x).toBeLessThanOrEqual(1);
  expect(y).toBeLessThanOrEqual(1);
  expect(spill).toBeLessThanOrEqual(1);
}

test.describe('M3-11 session context panels', () => {
  test.skip(() => test.info().project.name === 'iphone-smoke', 'iPad flow');

  test('D9: the CAGED order before an answer, the chain mini-map after it', async ({
    page,
  }, info) => {
    await startD9(page, 2);
    const shape = await askedShape(page);
    await expect(panel(page).getByRole('heading', { name: 'CAGED chain' })).toBeVisible();
    const order = panel(page).getByRole('list', { name: 'CAGED order' });
    await expect(order.getByRole('listitem')).toHaveText([...SHAPES]);
    await expect(order.locator('[aria-current="true"]')).toHaveText(shape);
    // Where the shape sits is the answer: no mini-map yet (rule 4).
    await expect(map(page)).toHaveCount(0);
    await expectFits(page, info.project.name, true);

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(wrong(page)).toBeVisible();
    await expect(map(page)).toBeVisible();
    await expect(map(page)).toHaveAccessibleName(
      new RegExp(
        `^CAGED chain of .+: (?:[CAGED] shape frets? [\\d–]+, ){4}[CAGED] shape frets? [\\d–]+\\. The ${shape} shape is marked\\.$`,
      ),
    );
    await expect(map(page).locator('[data-current="true"]')).toHaveAttribute('data-shape', shape);
    await expectFits(page, info.project.name, true);
  });

  test('D9 at guide level 1 keeps the mini-map back, even once answered', async ({ page }) => {
    await startD9(page, 1);
    await expect(panel(page).getByRole('list', { name: 'CAGED order' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(wrong(page)).toBeVisible();
    await expect(panel(page).getByRole('list', { name: 'CAGED order' })).toBeVisible();
    await expect(map(page)).toHaveCount(0);
  });

  test('D9 at guide level 0 has no panel', async ({ page }) => {
    await startD9(page, 0);
    await expect(page.getByTestId('d9-drill')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide help' })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(wrong(page)).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });

  test('D8: the current chord diagram, labelled by degree only once answered', async ({
    page,
  }, info) => {
    await startD8(page, 2);
    const diagram = panel(page).getByRole('img', { name: /^Chord diagram:/ });
    await expect(diagram).toBeVisible();
    const dots = diagram.getByTestId('chord-dot');
    expect(await dots.count()).toBeGreaterThan(0);
    // Before the answer: plain dots and roots, no degree labels or markers.
    await expect(diagram.locator('[data-testid="chord-dot"] text')).toHaveCount(0);
    await expect(
      diagram.locator('[data-style="third"], [data-style="fifth"], [data-style="seventh"]'),
    ).toHaveCount(0);
    await expectFits(page, info.project.name, true);

    await tapOffShape(page);
    await expect(diagram.locator('[data-testid="chord-dot"] text').first()).toBeVisible();
    await expect(diagram.locator('[data-style="third"]').first()).toBeAttached();
    await expectFits(page, info.project.name, true);
  });

  test('D7: the key’s diatonic chords, named only once the key is spelled', async ({
    page,
  }, info) => {
    await startD7(page, 2);
    await expect(page.getByTestId('d7-drill')).toBeVisible();
    const numerals = panel(page).getByRole('list', { name: 'Chords in a major key' });
    await expect(numerals.getByRole('listitem')).toHaveText([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii°',
    ]);
    await expectFits(page, info.project.name, false);

    await answerD7Wrong(page);
    const subject = (await page.getByTestId('d7-subject').innerText()).trim();
    const named = panel(page).getByRole('list', { name: `Chords in ${subject}` });
    await expect(named.getByRole('listitem').first()).toHaveText(
      new RegExp(`^I${subject.split(' ')[0]}$`),
    );
    await expectFits(page, info.project.name, false);
  });
});

test('on a phone, help opens the CAGED chain as a sheet @smoke', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone-smoke', 'phone flow');
  await freshStart(page);
  await masterSkills(page, D9_PREREQS);
  await focusSession(page, 'C6.triad-cores');
  // A new item's first rep is a worked example: full guides, the mini-map included.
  await expect(page.getByTestId('d9-prompt')).toHaveText(/^This is the/);
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Show help' }).click();
  await expect(panel(page).getByRole('heading', { name: 'CAGED chain' })).toBeVisible();
  await expect(map(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
