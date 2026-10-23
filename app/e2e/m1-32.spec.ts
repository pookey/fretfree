import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

// M1-32: on iPad portrait the Progress mastery map clipped its 12th fret and
// the "12" label at the right edge. Every fret label must sit inside the map's
// container and the viewport, with no horizontal page scroll.

const DAY = 86_400_000;

/** A few reviewed cards, so the map has tiles to draw (and fret 12 among them). */
async function seed(page: Page): Promise<void> {
  await page.evaluate(async (DAY) => {
    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    let db = await open();
    while (!db.objectStoreNames.contains('cards')) {
      db.close();
      await new Promise((r) => setTimeout(r, 100));
      db = await open();
    }
    const now = Date.now();
    const tx = db.transaction('cards', 'readwrite');
    for (const [itemId, stability] of [
      ['note@s5f7', 30],
      ['note@s6f12', 3],
      ['note@s1f12', 10],
    ] as const) {
      tx.objectStore('cards').put({
        itemId,
        skillId: 'F2.string5-naturals',
        fsrs: {
          due: new Date(now + stability * DAY),
          stability,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: stability,
          learning_steps: 0,
          reps: 3,
          lapses: 0,
          state: 2, // State.Review
          last_review: new Date(now),
        },
        createdAt: new Date(now - DAY),
        lastReviewedAt: new Date(now),
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, DAY);
  await page.reload();
}

async function openMap(page: Page): Promise<Locator> {
  await freshStart(page);
  await seed(page);
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Progress' })
    .click();
  const map = page.getByRole('region', { name: 'Mastery map' });
  await expect(map.getByTestId('heatmap-panel')).toHaveAttribute('data-loaded', 'true');
  await expect(map.getByTestId('heat-tile')).toHaveCount(3);
  return map;
}

/** `inner` lies wholly inside `outer`, give or take a pixel of rounding. */
function expectInside(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

/**
 * Every fret column and label up to 12 lies inside the map's scroll box and
 * the viewport. A 12-fret neck fits outright; a longer one (15 frets on
 * regular-wide) may scroll for the rest, and then says so.
 */
async function expectFretsInside(page: Page, map: Locator): Promise<void> {
  const container = map.getByTestId('heatmap-scroll');
  const neck = map.getByRole('group', { name: 'Fretboard mastery map' });
  const to = Number(await neck.getAttribute('data-fret-to'));
  const viewport = { x: 0, y: 0, ...page.viewportSize()! };
  const box = (await container.boundingBox())!;
  expectInside({ ...box, y: 0, height: 0 }, { ...viewport, height: 0 });
  for (let fret = 0; fret <= Math.min(to, 12); fret++) {
    if (fret > 0) {
      const label = neck.getByTestId(`heat-fret-${fret}`);
      await expect(label).toHaveText(String(fret));
      expectInside((await label.boundingBox())!, box);
    }
    for (const string of [1, 6]) {
      const cell = neck.getByRole('button', {
        name: new RegExp(`^string ${string}, fret ${fret}\\b`),
      });
      const cellBox = (await cell.boundingBox())!;
      expectInside(cellBox, box);
      expect(cellBox.width).toBeGreaterThanOrEqual(44);
      expect(cellBox.height).toBeGreaterThanOrEqual(44);
    }
  }
  const overflow = await container.evaluate((el) => el.scrollWidth - el.clientWidth);
  const hint = map.getByTestId('heatmap-scroll-hint');
  if (to <= 12) expect(overflow).toBeLessThanOrEqual(1);
  if (overflow > 1) await expect(hint).toBeVisible();
  else await expect(hint).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
}

test.describe('M1-32 the mastery map fits its panel', () => {
  test('every fret up to 12 is inside the map and the viewport, with 44pt cells @smoke @layout', async ({
    page,
  }) => {
    const map = await openMap(page);
    await expectFretsInside(page, map);
    // Fret 12 is a tap away, not hidden past the edge.
    await map
      .getByRole('button', { name: /^string 1, fret 12, E: remembered for 10 days$/ })
      .click();
    await expect(map.getByTestId('heat-cell-detail')).toContainText('String 1, fret 12 · E');
  });

  test('a neck too long for its box scrolls inside it to the last fret @layout', async ({
    page,
  }) => {
    const map = await openMap(page);
    const container = map.getByTestId('heatmap-scroll');
    const edges = container.locator('..');
    const neck = map.getByRole('group', { name: 'Fretboard mastery map' });
    const overflow = await container.evaluate((el) => el.scrollWidth - el.clientWidth);
    test.skip(overflow <= 1, 'the whole neck fits here');

    await expect(edges).toHaveAttribute('data-more-right', 'true');
    await expect(edges).toHaveAttribute('data-more-left', 'false');
    // Frets up to 12 stay clear of the right-hand fade, not just inside the box.
    const fade = await edges.evaluate((el) => parseFloat(getComputedStyle(el, '::after').width));
    expect(fade).toBeGreaterThan(0);
    const box = (await container.boundingBox())!;
    for (const target of [
      map.locator('[data-testid="heat-tile"][data-cell="s1f12"]'),
      neck.getByRole('button', { name: /^string 1, fret 12\b/ }),
      neck.getByTestId('heat-fret-12'),
    ]) {
      const b = (await target.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width - fade);
    }
    await container.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(edges).toHaveAttribute('data-more-right', 'false');
    await expect(edges).toHaveAttribute('data-more-left', 'true');
    const last = await neck.getAttribute('data-fret-to');
    const label = (await neck.getByTestId(`heat-fret-${last}`).boundingBox())!;
    expect(label.x + label.width).toBeLessThanOrEqual(box.x + box.width + 1);
    await expectNoHorizontalOverflow(page);
  });
});
