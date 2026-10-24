import { expect, test, type Locator, type Page } from '@playwright/test';
import { freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M4-18: the layout findings of the M4-11 QA (4, 6, 8 and 10). Each test
// measures, so each is @layout and runs at every iPad size; the Progress and
// D15 ones are also @smoke, because the phone is where D15's fix matters most.

/** Wait until the drill's view (a lazy chunk) is up, not its loading state. */
async function drillReady(page: Page, drill: string): Promise<void> {
  await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', drill);
  await expect(page.locator('#drill-prompt')).toBeVisible();
  await expect(page.getByTestId('drill-loading')).toBeHidden();
}

/** How far the page, or the shell's scrolling main, can scroll down. */
async function pageScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector('main');
    return Math.max(
      doc.scrollHeight - doc.clientHeight,
      main ? main.scrollHeight - main.clientHeight : 0,
    );
  });
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

test.describe('M4-18 layout fixes', () => {
  test('Progress has no blank scroll, and a badge toast leaves the title clear @smoke @layout', async ({
    page,
  }) => {
    await freshStart(page, '/progress');
    // Mastering string 6 earns "String 6 master" as the page loads.
    await masterSkills(page, ['F2.string6-naturals']);
    const h1 = page.getByRole('heading', { name: 'Progress', level: 1 });
    await expect(h1).toBeVisible();
    const toast = page.getByTestId('achievement-toast');
    await expect(toast).toBeVisible();

    // The calendar's visually hidden labels stay inside it, so the document
    // isn't stretched by about 840pt of blank space below the shell.
    const calendar = page.getByTestId('calendar-panel').locator('table');
    await expect(calendar).toBeVisible();
    const strays = await calendar.evaluate((table) => {
      const t = table.getBoundingClientRect();
      return [...table.querySelectorAll('caption, td span')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.top < t.top - 1 || r.bottom > t.bottom + 1).length;
    });
    expect(strays).toBe(0);
    const doc = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(doc).toBeLessThanOrEqual(1);

    // The toast doesn't cover the title's words.
    const title = await h1.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    const t = await box(toast);
    const overlaps =
      t.x < title.x + title.width &&
      title.x < t.x + t.width &&
      t.y < title.y + title.height &&
      title.y < t.y + t.height;
    expect(overlaps).toBe(false);
  });

  test('D15 keeps its window from prompt to feedback and uses the screen at every size @smoke @layout', async ({
    page,
  }, info) => {
    const phone = info.project.name === 'iphone-smoke';
    await freshStart(page);
    await masterSkills(page, ['F2.string6-naturals']);
    // The worked example names A, fret 5 on string 6.
    await focusSession(page, 'I6.ear-find');
    await drillReady(page, 'hear-it-find-it');
    await expect(page.getByTestId('d15-prompt')).toContainText('A on string 6');
    const neck = page.locator('svg[data-fret-from]');
    const from = await neck.getAttribute('data-fret-from');
    const to = await neck.getAttribute('data-fret-to');

    const check = async () => {
      // No page scroll at any size (it was 7–9pt on iPad landscape and the mini).
      expect(await pageScroll(page)).toBeLessThanOrEqual(1);
      const cell = await box(neck.locator('[data-cell="s6f5"]'));
      const n = await box(neck);
      const viewport = page.viewportSize()!;
      if (phone) {
        // A phone on its side: the window starts at the nut (the open E is
        // marked there) and the neck takes the height beside the prompt,
        // not half the width at 32 × 28pt cells.
        expect(from).toBe('0');
        expect(cell.width).toBeGreaterThanOrEqual(40);
        expect(cell.height).toBeGreaterThanOrEqual(36);
        expect(n.height).toBeGreaterThanOrEqual(viewport.height - 80);
        expect(n.x + n.width).toBeGreaterThan(viewport.width * 0.75);
      } else {
        expect(cell.width).toBeGreaterThanOrEqual(44);
        expect(cell.height).toBeGreaterThanOrEqual(44);
        expect(n.y + n.height).toBeLessThanOrEqual(viewport.height);
      }
    };
    await check();

    // A tap two frets low: the window doesn't move from where it was tapped.
    await neck.locator('[data-cell="s6f3"]').click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(neck).toHaveAttribute('data-fret-from', from!);
    await expect(neck).toHaveAttribute('data-fret-to', to!);
    if (phone) await expect(page.getByTestId('d15-window')).toHaveText(`Frets ${from}–${to}`);
    await check();
  });

  test('Explore shows the open view’s whole tab, and a large circle in portrait @layout', async ({
    page,
  }, info) => {
    await freshStart(page);
    const nav = page.getByRole('navigation', { name: 'Explore views' });
    for (const [view, region] of [
      ['progression-player', 'Progression player'],
      ['circle-of-fifths', 'Circle of fifths'],
    ] as const) {
      await page.goto(`/explore?view=${view}`);
      await expect(page.getByRole('region', { name: region })).toBeVisible();
      const strip = await box(nav);
      const tab = await box(nav.getByRole('link', { name: region }));
      expect(tab.x).toBeGreaterThanOrEqual(strip.x - 1);
      expect(tab.x + tab.width).toBeLessThanOrEqual(strip.x + strip.width + 1);
    }

    // The circle: across the column in portrait, beside the key's details on
    // wider screens.
    const circle = await box(
      page.getByRole('region', { name: 'Circle of fifths' }).locator('svg').first(),
    );
    expect(circle.width).toBeGreaterThanOrEqual(info.project.name === 'ipad-portrait' ? 600 : 380);
  });

  test('D13’s neck sits under its answers, and the player’s neck fits an iPad landscape screen @layout', async ({
    page,
  }, info) => {
    await freshStart(page);
    await masterSkills(page, [
      'C4.sharp-key-degrees',
      'C4.flat-key-degrees',
      'C4.sharp-keys',
      'C5.triads',
    ]);
    await focusSession(page, 'C10.capo-g-c-d');
    await drillReady(page, 'capo');
    const answers = await box(page.getByTestId('d13-drill').getByRole('group'));
    const capoNeck = await box(page.getByTestId('d13-neck'));
    // It was pinned to the foot of the screen, about 450pt below the answers.
    expect(capoNeck.y).toBeGreaterThan(answers.y + answers.height);
    expect(capoNeck.y - (answers.y + answers.height)).toBeLessThanOrEqual(120);

    await page.goto('/explore?view=progression-player');
    const player = page.getByRole('region', { name: 'Progression player' });
    await expect(player.getByTestId('player-chord')).toHaveCount(4);
    const neck = await box(player.locator('svg[data-fret-from]'));
    if (info.project.name === 'ipad-landscape') {
      // The whole neck is on screen with the chart and Play, unscrolled.
      expect(neck.y + neck.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await expect(player.getByRole('button', { name: 'Play' })).toBeInViewport();
    }
    // Its strings stay apart: the neck keeps at least 19.5rem of height.
    expect(neck.height).toBeGreaterThanOrEqual(300);

    // At this size and on a 12.9" iPad either way up (regular-wide in
    // portrait too), the neck keeps its own shape right under its legend:
    // never letterboxed in a taller box, with a blank band above it.
    for (const size of [null, { width: 1024, height: 1366 }, { width: 1366, height: 1024 }]) {
      if (size) await page.setViewportSize(size);
      const svg = player.locator('svg[data-fret-from]');
      await expect(svg).toBeVisible();
      const shape = await svg.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const v = (el as SVGSVGElement).viewBox.baseVal;
        return { box: r.width / r.height, natural: v.width / v.height };
      });
      expect(Math.abs(shape.box / shape.natural - 1), JSON.stringify(size)).toBeLessThan(0.02);
      const legend = await box(player.getByRole('list', { name: 'Legend' }));
      const at = await box(svg);
      expect(at.y - (legend.y + legend.height), JSON.stringify(size)).toBeLessThanOrEqual(40);
    }
  });
});
