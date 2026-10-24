import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';
import { seedDueItems } from './helpers/octaves';

// M8-11: D24 "Fretboard → staff" (design §12), on R2's `fret→staff` cards.
// A fret is lit in a reading position; the learner taps its note's line or
// space on the staff. A miss marks the tapped place beside the right one and
// shows where the position plays each. On iPad landscape the staff stands
// beside the neck, both in view; in portrait it sits above.

/** What the reading track opens with (engine/skills/r2.ts). */
const READING_GATES = ['F2.string6-naturals', 'F2.string5-naturals', 'T1.simple-meters'];

const OPEN_MIDI = [64, 59, 55, 50, 45, 40];
const LETTER_STEP: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };

/** The staff place (0 = bottom line) of a natural played on a cell: E4 is the top space. */
function placeOf(string: number, fret: number): number {
  const midi = OPEN_MIDI[string - 1]! + fret;
  const step = LETTER_STEP[midi % 12];
  if (step === undefined) throw new Error(`s${string}f${fret} is not a natural`);
  return (Math.floor(midi / 12) - 1) * 7 + step - 23;
}

const ordinal = (n: number) => ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;

/** The staff's VoiceOver name for a place, as `components/staff/position.ts` gives it. */
function positionName(p: number): string {
  if (p >= 0 && p <= 8) return p % 2 === 0 ? `line ${p / 2 + 1}` : `space ${(p + 1) / 2}`;
  if (p === -1) return 'space below the staff';
  if (p === 9) return 'space above the staff';
  if (p < 0) {
    return p % 2 === 0
      ? `${ordinal(-p / 2)} ledger line below`
      : `space below the ${ordinal((-p - 1) / 2)} ledger line`;
  }
  return p % 2 === 0
    ? `${ordinal((p - 8) / 2)} ledger line above`
    : `space above the ${ordinal((p - 9) / 2)} ledger line`;
}

const card = (page: Page) => page.getByTestId('d24-drill');
const staffBox = (page: Page) => page.getByTestId('d24-staff');
const staff = (page: Page) => staffBox(page).getByRole('group');
const neck = (page: Page) => page.getByTestId('d24-neck').locator('svg[data-fret-from]');
const marks = (page: Page) => staffBox(page).getByTestId('staff-mark');
const band = (page: Page, place: number) =>
  staff(page).getByRole('button', { name: positionName(place), exact: true });

/** The lit cell, and the staff place its note has. */
async function litCell(page: Page): Promise<{ string: number; fret: number; place: number }> {
  const lit = neck(page).getByTestId('marker-target');
  await expect(lit).toHaveCount(1);
  const string = Number(await lit.getAttribute('data-string'));
  const fret = Number(await lit.getAttribute('data-fret'));
  return { string, fret, place: placeOf(string, fret) };
}

/** A learner with only these reverse cards due, in a focused session on their position. */
async function startDue(
  page: Page,
  skillId: string,
  itemIds: string[],
  guideLevel: 0 | 1 | 2 | 3 = 1,
) {
  await freshStart(page);
  await seedDueItems(
    page,
    itemIds.map((itemId) => ({ itemId, skillId })),
    guideLevel,
  );
  await focusSession(page, skillId);
  await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', 'fret-to-staff');
  await expect(staff(page)).toHaveAttribute('data-ready', 'true');
}

test.describe('D24 "Fretboard → staff"', () => {
  test('places a lit fret on the staff @smoke', async ({ page }) => {
    await startDue(page, 'R2.pos5', ['fret→staff:G3@pos5']);
    await expect(page.getByTestId('d24-position')).toHaveText('5th position, frets 5–8');
    await expect(page.locator('#drill-prompt')).toHaveText('Place string 4, fret 5 on the staff');
    const lit = await litCell(page);
    expect(lit).toEqual({ string: 4, fret: 5, place: 2 });
    // Only the position's frets are drawn.
    await expect(neck(page)).toHaveAttribute('data-fret-from', '4');
    await expect(marks(page)).toHaveCount(0);

    await band(page, lit.place).click();
    await expect(marks(page)).toHaveCount(1);
    await expect(marks(page)).toHaveAttribute('data-style', 'correct');
    await expect(marks(page)).toHaveAttribute('data-position', '2');
    await expect(page.getByTestId('d24-explain')).toHaveText(
      'String 4, fret 5 is G3, on the 2nd line.',
    );
    await expect(neck(page).getByTestId('marker-correct')).toHaveText('G');
    await expectNoHorizontalOverflow(page);
  });

  test('a miss marks both places and both frets @layout', async ({ page }) => {
    await startDue(page, 'R2.pos5', ['fret→staff:G3@pos5']);
    // The space above the line: A3, which 5th position plays on string 4, fret 7.
    await band(page, 3).click();
    await expect(marks(page)).toHaveCount(2);
    await expect(
      staffBox(page).locator('[data-testid="staff-mark"][data-style="correct"]'),
    ).toHaveAttribute('data-position', '2');
    await expect(
      staffBox(page).locator('[data-testid="staff-mark"][data-style="wrong"]'),
    ).toHaveAttribute('data-position', '3');
    await expect(staff(page)).toHaveAccessibleName(
      'Staff: G3, on the 2nd line, and your tap, A3, in the 2nd space',
    );
    // Each mark is drawn on its own line or space, one above the other.
    const centre = (r: { x: number; y: number; width: number; height: number }) => ({
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
    });
    const at: Record<string, { x: number; y: number }> = {};
    for (const style of ['correct', 'wrong']) {
      const mark = staffBox(page).locator(
        `[data-testid="staff-mark"][data-style="${style}"] ellipse`,
      );
      at[style] = centre((await mark.boundingBox())!);
    }
    for (const [style, place] of [
      ['correct', 2],
      ['wrong', 3],
    ] as const) {
      const row = centre((await band(page, place).boundingBox())!);
      expect(Math.abs(at[style]!.y - row.y), style).toBeLessThan(6);
    }
    expect(Math.abs(at.correct!.x - at.wrong!.x)).toBeLessThan(6);
    const wrong = neck(page).getByTestId('marker-wrong');
    await expect(wrong).toHaveAttribute('data-string', '4');
    await expect(wrong).toHaveAttribute('data-fret', '7');
    await expect(neck(page).getByTestId('marker-correct')).toHaveAttribute('data-fret', '5');
    await expect(page.getByTestId('d24-explain')).toHaveText(
      "You tapped the 2nd space: that's A3, one step above, played on string 4, fret 7. String 4, fret 5 is G3, on the 2nd line.",
    );
  });

  test('answers from a hardware keyboard: arrows, then Enter', async ({ page }) => {
    await startDue(page, 'R2.open', ['fret→staff:E2@open']);
    const lit = await litCell(page);
    expect(lit).toEqual({ string: 6, fret: 0, place: -7 });
    // The first arrow moves into the staff; then each arrow is a step.
    await page.keyboard.press('ArrowDown');
    await expect(staff(page).locator('[role="button"]:focus')).toHaveCount(1);
    const from = Number(
      await staff(page).locator('[role="button"]:focus').getAttribute('data-position'),
    );
    for (let p = from; p > lit.place; p--) await page.keyboard.press('ArrowDown');
    await expect(band(page, lit.place)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(marks(page)).toHaveAttribute('data-style', 'correct');
    await expect(marks(page)).toHaveAttribute('data-position', '-7');
  });

  test('9th position: either cell of a doubled pitch lights, and its place is the answer', async ({
    page,
  }) => {
    await startDue(page, 'R2.pos9', ['fret→staff:F3@pos9']);
    const lit = await litCell(page);
    // F3 is string 5, fret 8 or string 6, fret 13 here: the 1st space either way.
    expect([`s${lit.string}f${lit.fret}`]).toEqual([expect.stringMatching(/^(s5f8|s6f13)$/)]);
    expect(lit.place).toBe(1);
    await band(page, 1).click();
    await expect(marks(page)).toHaveAttribute('data-style', 'correct');
    // Both of the position's cells for F3 are shown.
    await expect(neck(page).getByTestId('marker-correct')).toHaveCount(2);
  });

  test('a new reverse card opens with its worked example', async ({ page }) => {
    await freshStart(page);
    // Strings 6 and 5 and T1 under way, and 5th position's first block read
    // (staff → fret) but not yet placed: its first reverse card is next.
    await page.evaluate(
      async ({ gates, known }) => {
        const DAY = 86_400_000;
        const now = Date.now();
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('fretwork');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
        for (const skillId of [...gates, 'R2.open']) {
          tx.objectStore('skillStates').put({
            skillId,
            status: 'mastered',
            guideLevel: 0,
            rollingAccuracy: 1,
          });
        }
        tx.objectStore('skillStates').put({
          skillId: 'R2.pos5',
          status: 'practising',
          guideLevel: 3,
          rollingAccuracy: 1,
        });
        for (const itemId of known) {
          tx.objectStore('cards').put({
            itemId,
            skillId: 'R2.pos5',
            fsrs: {
              due: new Date(now + 5 * DAY),
              stability: 6,
              difficulty: 5,
              elapsed_days: 0,
              scheduled_days: 6,
              learning_steps: 0,
              reps: 4,
              lapses: 0,
              state: 2,
              last_review: new Date(now - DAY),
            },
            createdAt: new Date(now - 3 * DAY),
            lastReviewedAt: new Date(now - DAY),
          });
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      },
      {
        gates: READING_GATES,
        known: ['D3', 'E3', 'F3', 'G3'].map((n) => `staff→fret:${n}@pos5`),
      },
    );
    await page.reload();
    await focusSession(page, 'R2.pos5');
    await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', 'fret-to-staff');
    await expect(page.locator('#drill-prompt')).toHaveText(
      'String 5, fret 5 is D3, in the space below the staff, marked. Tap it to continue.',
    );
    await expect(marks(page)).toHaveAttribute('data-style', 'selected');
    await expect(marks(page)).toHaveAttribute('data-position', '-1');
    await expect(neck(page).getByTestId('marker-target')).toHaveText('D');
    await expect(staff(page)).toHaveAttribute('data-ready', 'true');
    await band(page, -1).click();
    await expect(marks(page)).toHaveAttribute('data-style', 'correct');
  });

  test('the staff and the lit fret are both in view, lines 44pt apart @layout', async ({
    page,
  }, info) => {
    await startDue(page, 'R2.pos12', ['fret→staff:E3@pos12'], 2);
    const viewport = page.viewportSize()!;
    const staffRect = (await staff(page).boundingBox())!;
    const neckRect = (await neck(page).boundingBox())!;
    for (const r of [staffRect, neckRect]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(r.y + r.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    if (info.project.name === 'ipad-portrait') {
      // Portrait has the height: the staff above the neck.
      expect(staffRect.y + staffRect.height).toBeLessThanOrEqual(neckRect.y + 1);
    } else {
      // Landscape: beside it.
      expect(neckRect.x + neckRect.width).toBeLessThanOrEqual(staffRect.x + 1);
    }
    // Lines at least 44pt apart: each line or space band is 22pt or more.
    const one = (await band(page, 2).boundingBox())!;
    const next = (await band(page, 4).boundingBox())!;
    expect(next.y - one.y).toBeLessThanOrEqual(-44);
    // Neck cells clear 44pt too, though the neck takes no taps here.
    const cell = (await neck(page).locator('[data-cell="s3f12"]').boundingBox())!;
    expect(cell.width).toBeGreaterThanOrEqual(44);
    expect(cell.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    // E3 is the bottom line. A miss keeps the staff's size: nothing jumps
    // under the finger.
    await band(page, 1).click();
    await expect(marks(page)).toHaveCount(2);
    const after = (await staff(page).boundingBox())!;
    expect(Math.abs(after.height - staffRect.height)).toBeLessThan(1);
    expect(Math.abs(after.x - staffRect.x)).toBeLessThan(1);
    await expect(card(page)).toBeVisible();
  });
});
