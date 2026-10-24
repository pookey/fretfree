import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M1-49: the nut's string names have their own column beyond the open
// strings, so a marker at fret 0 never covers one. The M6-14 review saw C7's
// E minor box 1 cover all six names (iPad mini landscape) and D19's open E
// triangle and B ghost cover two (iPad portrait).

/**
 * Every pick is the same fraction of its list, which serves the cases the
 * review saw: C7's first box is Em box 1 at the nut, and D19's first move is
 * E to A on strings 3–1, from an open B and E.
 */
const SEED = 0.4;

const neck = (page: Page) => page.getByTestId('session').locator('svg[data-fret-from]');

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  what: string;
}

/**
 * Screen boxes of the string names and the fret-0 markers, each grown by the
 * stroke it paints past its fill (a name's 4-unit halo; a marker's edge, or a
 * worked example's 13-unit ring), since getBoundingClientRect leaves strokes out.
 */
async function nutBoxes(page: Page): Promise<{ names: Rect[]; markers: Rect[] }> {
  return neck(page).evaluate((svg) => {
    const scale =
      svg.getBoundingClientRect().width / Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const grown = (el: Element, by: number, what: string) => {
      const r = el.getBoundingClientRect();
      const d = by * scale;
      return { x: r.x - d, y: r.y - d, w: r.width + 2 * d, h: r.height + 2 * d, what };
    };
    return {
      names: [...svg.querySelectorAll('[data-testid="string-name"]')].map((el) =>
        grown(el, 2, `${el.textContent} name`),
      ),
      markers: [...svg.querySelectorAll('[data-testid^="marker-"][data-fret="0"]')].map((el) =>
        grown(
          el,
          el.hasAttribute('data-emphasis') ? 6.5 : 2.5,
          `${el.getAttribute('data-testid')} on string ${el.getAttribute('data-string')}`,
        ),
      ),
    };
  });
}

const meets = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function expectNamesClear(page: Page, openMarkers: number): Promise<void> {
  await expect(neck(page)).toHaveAttribute('data-fret-from', '0');
  await expect(neck(page).getByTestId('string-name')).toHaveCount(6);
  for (const name of await neck(page).getByTestId('string-name').all()) {
    await expect(name).toBeVisible();
  }
  const { names, markers } = await nutBoxes(page);
  expect(markers).toHaveLength(openMarkers);
  for (const name of names) {
    for (const marker of markers) {
      expect(meets(name, marker), `${name.what} vs ${marker.what}`).toBe(false);
    }
  }
  // Still comfortable targets, and the neck still fits the width.
  for (const fret of ['0', await neck(page).getAttribute('data-fret-to')]) {
    const cell = (await neck(page).locator(`[data-cell="s1f${fret}"]`).boundingBox())!;
    expect(cell.width).toBeGreaterThanOrEqual(44);
    expect(cell.height).toBeGreaterThanOrEqual(44);
  }
  await expectNoHorizontalOverflow(page);
}

/** The neck, as the report shows it (M1-49 acceptance). */
async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`);
  await neck(page).screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}

async function drillReady(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId)).toBeVisible();
  await expect(page.getByTestId('drill-loading')).toBeHidden();
}

test.describe('M1-49 string names at the nut', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((seed) => {
      Math.random = () => seed;
    }, SEED);
    await freshStart(page);
  });

  test('C7 Em box 1 at the nut shows all six names, clear of its open markers @layout', async ({
    page,
  }, info) => {
    await masterSkills(page, ['C6.minor-cores', 'C6.minor-shapes']);
    await focusSession(page, 'C7.minor-boxes');
    await drillReady(page, 'dpb-drill');
    await expect(page.locator('#drill-prompt')).toContainText('Em pentatonic box 1');
    await expectNamesClear(page, 6);
    await shoot(page, info, 'c7-em-box-1');
  });

  test('D19 from an open shape shows all six names, clear of its open markers @layout', async ({
    page,
  }, info) => {
    await masterSkills(page, ['C6.triad-cores', 'I1.major-top-sets']);
    await focusSession(page, 'I1.voice-leading-top-sets');
    await drillReady(page, 'd19-drill');
    await expect(page.locator('#drill-prompt')).toContainText('E to A');
    await expectNamesClear(page, 2);
    await shoot(page, info, 'd19-e-to-a');
  });
});
