import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M4-03: C9 skills and D12 "Progression builder". Chords are dragged into a
// progression's slots by pointer or keyboard (or tapped into the selected
// slot), charts are transposed, and building a rotation (vi–IV–I–V for
// I–V–vi–IV) is explained as the same chords from another start.

// An independent answer key (deliberately not imported from app code): the
// triads of the open-chord major keys, degrees I to vii.
const TRIADS: Record<string, string[]> = {
  C: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'],
  G: ['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim'],
  D: ['D', 'Em', 'F#m', 'G', 'A', 'Bm', 'C#dim'],
  A: ['A', 'Bm', 'C#m', 'D', 'E', 'F#m', 'G#dim'],
  E: ['E', 'F#m', 'G#m', 'A', 'B', 'C#m', 'D#dim'],
};
const DEGREE: Record<string, number> = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5 };

/** C9.pop opens on chord construction (rule 7). */
const C9_PREREQUISITES = ['C4.flat-key-degrees', 'C5.triads'];

/** A chord in `key`, by numeral. */
const chordOf = (key: string, numeral: string) => TRIADS[key]![DEGREE[numeral]!]!;

/** How a chord is shown: `F#m` → `F♯m`. */
const shown = (symbol: string) => symbol.replace('#', '♯');

/** A tile's accessible name: `F#m` → `F sharp minor`. */
function spoken(symbol: string): string {
  const m = /^([A-G])(#?)(m|dim)?$/.exec(symbol)!;
  const quality = { m: ' minor', dim: ' diminished' }[m[3] ?? ''] ?? '';
  return `${m[1]}${m[2] ? ' sharp' : ''}${quality}`;
}

const drill = (page: Page) => page.getByTestId('d12-drill');
const tile = (page: Page, chord: string) =>
  page
    .getByRole('group', { name: 'Chords' })
    .getByRole('button', { name: spoken(chord), exact: true });
const slots = (page: Page) => page.getByTestId('d12-slot');

/** The key the slots are filled in, from the task or the worked example. */
async function targetKey(page: Page): Promise<string> {
  const text = await page.locator('#drill-prompt').innerText();
  // A worked transposition names the source key first ("In C major this is …,
  // so in G major it is …"), so the destination patterns come first.
  const m = [/so in ([A-G]) major/, /(?:Build it in|to) ([A-G]) major/, /^In ([A-G]) major/]
    .map((re) => re.exec(text))
    .find(Boolean);
  expect(m, text).toBeTruthy();
  return m![1]!;
}

/** Start a session on one item, as "Quiz me on this" does. */
async function focusItem(page: Page, itemId: string): Promise<void> {
  await page.goto(`/session?item=${encodeURIComponent(itemId)}`);
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
}

/**
 * A finger drag: pointer events of type touch, from the middle of one
 * element to the middle of another (or well off the chart).
 */
async function touchDrag(page: Page, from: Locator, to: Locator | null): Promise<void> {
  const a = (await from.boundingBox())!;
  const b = to ? (await to.boundingBox())! : { x: a.x, y: 4, width: 0, height: 0 };
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await from.dispatchEvent('pointerdown', {
    pointerId: 11,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  });
  await page.evaluate(
    ({ start, end }) => {
      const fire = (type: string, x: number, y: number) =>
        window.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 11,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
          }),
        );
      for (let i = 1; i <= 4; i++) {
        fire(
          'pointermove',
          start.x + ((end.x - start.x) * i) / 4,
          start.y + ((end.y - start.y) * i) / 4,
        );
      }
      fire('pointerup', end.x, end.y);
    },
    { start, end },
  );
}

async function check(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Check' }).click();
}

test.describe('M4-03 D12 progression builder', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, C9_PREREQUISITES);
  });

  test('a worked example, built by pointer drag, keyboard drag and a tap', async ({ page }) => {
    await focusSession(page, 'C9.pop');
    await expect(drill(page)).toBeVisible();
    await expect(page.getByTestId('d12-subject')).toHaveText('I–IV–V');
    // First rep of a new progression: the answer is worked through (rule 8).
    await expect(page.locator('#drill-prompt')).toContainText('I–IV–V is');
    await expect(page.getByTestId('context-panel')).toContainText('three-chord backbone');
    const key = await targetKey(page);
    const [one, four, five] = ['I', 'IV', 'V'].map((n) => chordOf(key, n));
    await expect(slots(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();

    // A pointer (trackpad or mouse) drags the I into the first slot.
    await tile(page, one!).dragTo(slots(page).nth(0));
    await expect(slots(page).nth(0)).toHaveText(shown(one!));

    // The keyboard: Space picks the IV up over the next empty slot, Space drops it.
    await tile(page, four!).focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('d12-status')).toContainText('Picked up');
    await expect(slots(page).nth(1)).toHaveAttribute('data-state', 'target');
    await page.keyboard.press('Space');
    await expect(slots(page).nth(1)).toHaveText(shown(four!));

    // A tap fills the selected slot.
    await tile(page, five!).click();
    await expect(slots(page).nth(2)).toHaveText(shown(five!));
    await check(page);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('a finger drags chords in, swaps them and drags one off', async ({ page }) => {
    await focusSession(page, 'C9.pop');
    await expect(drill(page)).toBeVisible();
    const key = await targetKey(page);
    const [one, four, five] = ['I', 'IV', 'V'].map((n) => chordOf(key, n));

    await touchDrag(page, tile(page, four!), slots(page).nth(0));
    await touchDrag(page, tile(page, one!), slots(page).nth(1));
    await expect(slots(page).nth(0)).toHaveText(shown(four!));
    await expect(slots(page).nth(1)).toHaveText(shown(one!));
    // Swap the two placed chords.
    await touchDrag(page, slots(page).nth(1), slots(page).nth(0));
    await expect(slots(page).nth(0)).toHaveText(shown(one!));
    await expect(slots(page).nth(1)).toHaveText(shown(four!));
    // Drag a wrong chord in, then off the chart to remove it.
    const wrong = chordOf(key, 'vi');
    await touchDrag(page, tile(page, wrong), slots(page).nth(2));
    await expect(slots(page).nth(2)).toHaveText(shown(wrong));
    await touchDrag(page, slots(page).nth(2), null);
    // The worked example's faint answer shows through an empty slot.
    await expect(slots(page).nth(2)).toHaveAccessibleName(/: empty$/);
    // Clearing the I selects its slot, but after a drag a tap still selects
    // another empty slot for the next tapped tile.
    await touchDrag(page, slots(page).nth(0), null);
    await expect(slots(page).nth(0)).toHaveAttribute('data-state', 'current');
    await slots(page).nth(2).tap();
    await expect(slots(page).nth(2)).toHaveAttribute('data-state', 'current');
    await tile(page, five!).tap();
    await tile(page, one!).tap();
    await expect(slots(page)).toHaveText([one!, four!, five!].map(shown));
    await check(page);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('building vi–IV–I–V for I–V–vi–IV is explained as a rotation', async ({ page }) => {
    await focusItem(page, 'prog:I-V-vi-IV:build');
    await expect(page.getByTestId('d12-subject')).toHaveText('I–V–vi–IV');
    // The panel teaches the pair (research/03 C9 misconception).
    await expect(page.getByTestId('d12-rotation-note')).toContainText(
      'I–V–vi–IV and vi–IV–I–V are rotations',
    );
    const key = await targetKey(page);
    for (const n of ['vi', 'IV', 'I', 'V']) await tile(page, chordOf(key, n)).click();
    await check(page);
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(page.getByTestId('d12-explanation')).toContainText(
      'You built vi–IV–I–V: the same chords as I–V–vi–IV, started from the vi.',
    );
    await expect(page.getByTestId('d12-expected')).toHaveText(
      ['I', 'V', 'vi', 'IV'].map((n) => shown(chordOf(key, n))),
    );
  });

  test('a chart is transposed to another key', async ({ page }) => {
    await focusItem(page, 'prog:I-V-vi-IV:transpose');
    const source = page.getByTestId('d12-source');
    await expect(source).toBeVisible();
    const from = /In ([A-G]) major/.exec(await source.innerText())![1]!;
    const to = await targetKey(page);
    expect(to).not.toBe(from);
    const numerals = ['I', 'V', 'vi', 'IV'];
    await expect(source.locator('ol > li > span:first-child')).toHaveText(
      numerals.map((n) => shown(chordOf(from, n))),
    );
    // Number keys pick tiles: find each chord's place in the palette.
    const names = await page
      .getByRole('group', { name: 'Chords' })
      .getByRole('button')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    for (const n of numerals) {
      await page.keyboard.press(String(names.indexOf(spoken(chordOf(to, n))) + 1));
    }
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('a 12-bar chart to transpose fits the screen @smoke', async ({ page }) => {
    // The blues opens once pop is under way and sevenths are known.
    await masterSkills(page, [...C9_PREREQUISITES, 'C9.pop', 'C5.sevenths']);
    await focusItem(page, 'prog:12-bar-blues:transpose');
    const source = page.getByTestId('d12-source');
    await expect(source).toBeVisible();
    await expect(source.locator('ol > li')).toHaveCount(12);
    await expect(slots(page)).toHaveCount(12);
    // This device, a phone in portrait, then the narrowest phone (an SE, or
    // Display Zoom). At 320pt the session's own header is too wide, so there
    // only the chords are checked.
    const sizes = [page.viewportSize()!, { width: 375, height: 812 }, { width: 320, height: 568 }];
    for (const size of sizes) {
      await page.setViewportSize(size);
      // Grid tracks can spill out of a centred chart (off the left edge too)
      // without scrolling the page, so check every chord's own box. The size
      // class follows a resize asynchronously, so wait for the layout to settle.
      await expect(async () => {
        const boxes = await page
          .locator('[data-testid="d12-source"] li, [data-testid="d12-slot"]')
          .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
        expect(boxes).toHaveLength(24);
        for (const box of boxes) {
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(size.width);
        }
      }).toPass({ timeout: 5_000 });
      if (size.width > 320) await expectNoHorizontalOverflow(page);
    }
  });

  test('a phone builds the progression by tapping @smoke', async ({ page }) => {
    await focusSession(page, 'C9.pop');
    await expect(drill(page)).toBeVisible();
    const key = await targetKey(page);
    for (const n of ['I', 'IV', 'V']) await tile(page, chordOf(key, n)).click();
    await expectNoHorizontalOverflow(page);
    await check(page);
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });
});
