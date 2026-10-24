import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { press } from './helpers/keyboard';

// M8-09: R1 and D22 "Name the note on the staff". A reading card shows one
// note on the guitar's treble 8vb staff and takes A–G (buttons or keys); a
// placing card names a letter and its part of the staff and takes a tap on a
// line or space. The staff sits above the neck, which shows where the note
// is played once answered. R1 opens once strings 6 and 5 and T1 are under way.

const PREREQS = ['F4.pulse', 'T1.simple-meters', 'F2.string6-naturals', 'F2.string5-naturals'];

const card = (page: Page) => page.getByTestId('d22-drill');
const staff = (page: Page) => page.getByTestId('d22-staff').getByRole('group');

/** The letter written at a staff position: 0 is the bottom line (E), odd numbers spaces. */
const letterAt = (p: number) => 'CDEFGAB'[(((p + 2) % 7) + 7) % 7]!;

const ordinal = (n: number) => ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;

/** The staff's VoiceOver name for a position, as `components/staff/position.ts` gives it. */
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

const POSITIONS = Array.from({ length: 23 }, (_, i) => i - 7);

/** The card on screen: which way it asks, and the place that answers it. */
async function readCard(page: Page): Promise<{ direction: string; position: number }> {
  await expect(card(page)).toBeVisible();
  const direction = (await card(page).getAttribute('data-direction')) ?? '';
  const task = (await page.locator('#drill-prompt').textContent()) ?? '';
  if (direction === 'read') {
    await expect(staff(page)).toHaveAttribute('data-ready', 'true');
    const label = (await staff(page).getByRole('img').getAttribute('aria-label')) ?? '';
    const position = POSITIONS.find((p) => label === `whole note on ${positionName(p)}`);
    if (position === undefined && task.startsWith('This is')) {
      // The worked example names the note: it is the guided card's own label.
      return { direction, position: POSITIONS.find((p) => letterAt(p) === task.charAt(8))! };
    }
    expect(position, label).toBeDefined();
    return { direction, position: position! };
  }
  // "Tap G below the staff", "Tap the higher E on the staff", or the worked example.
  const marked = staff(page).getByTestId('staff-mark');
  if ((await marked.count()) > 0) {
    return { direction, position: Number(await marked.getAttribute('data-position')) };
  }
  const m = /^Tap (?:the (lower|higher) )?([A-G]) (below|on|above) the staff$/.exec(task);
  expect(m, task).not.toBeNull();
  const [, which, letter, region] = m!;
  const inRegion = POSITIONS.filter((p) =>
    region === 'below' ? p < 0 : region === 'above' ? p > 8 : p >= 0 && p <= 8,
  ).filter((p) => letterAt(p) === letter);
  return { direction, position: which === 'higher' ? inRegion.at(-1)! : inRegion[0]! };
}

/** The control that answers the card on screen, right or (a neighbour) wrong. */
async function answerControl(page: Page, right: boolean): Promise<Locator> {
  const { direction, position } = await readCard(page);
  const target = right ? position : position === 15 ? 14 : position + 1;
  if (direction === 'read') {
    return card(page)
      .getByRole('group', { name: /Name this note|This is/ })
      .getByRole('button', { name: letterAt(target), exact: true });
  }
  return staff(page).getByRole('button', { name: positionName(target), exact: true });
}

async function open(page: Page, skillId = 'R1.staff') {
  await freshStart(page);
  await masterSkills(page, PREREQS);
  await focusSession(page, skillId);
  await expect(card(page)).toBeVisible();
}

/** Answers cards right until one asks `direction` and isn't a worked example. */
async function reach(page: Page, direction: 'read' | 'place') {
  for (let i = 0; i < 40; i++) {
    const task = (await page.locator('#drill-prompt').textContent()) ?? '';
    const dir = await card(page).getAttribute('data-direction');
    if (dir === direction && !task.includes('to continue')) return;
    await (await answerControl(page, true)).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    // The session moves on by itself after a right answer.
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
  }
  throw new Error(`No unguided ${direction} card`);
}

test.describe('M8-09 name the note on the staff', () => {
  test('a reading card: the staff above the neck, A–G answers @layout', async ({ page }) => {
    await open(page);
    // The first card works the G line through: the clef's own line.
    await expect(page.locator('#drill-prompt')).toHaveText(
      'This is G, on the 2nd line. Tap G to continue.',
    );
    await expect(staff(page)).toHaveAttribute('data-ready', 'true');
    const neck = page.getByTestId('d22-neck');
    await expect(neck).toBeVisible();
    // iPad: the staff sits above the neck, both on screen at once (design §12).
    const staffBox = (await staff(page).boundingBox())!;
    const neckBox = (await neck.boundingBox())!;
    expect(staffBox.y + staffBox.height).toBeLessThanOrEqual(neckBox.y);
    expect(neckBox.y + neckBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    const letters = card(page)
      .getByRole('group', { name: /This is/ })
      .getByRole('button');
    await expect(letters).toHaveText(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    for (const r of await letters.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);

    await letters.filter({ hasText: 'G' }).click();
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ G');
    await expect(page.getByTestId('d22-explain')).toHaveText(
      'G is on the 2nd line. Play it on the open 3rd string.',
    );
    // The neck shows every cell that plays it.
    await expect(neck.getByText('G').first()).toBeVisible();
  });

  test('answers a reading card from a hardware keyboard', async ({ page }) => {
    await open(page);
    await reach(page, 'read');
    // Before the answer the staff says where the note is, never its name.
    await expect(staff(page).getByRole('img')).toHaveAccessibleName(/^whole note on /);
    const { position } = await readCard(page);
    await press(page, letterAt(position).toLowerCase());
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(
      card(page).getByRole('button', { name: letterAt(position), exact: true }),
    ).toHaveAttribute('data-state', 'correct');
  });

  test('a miss on a reading card draws and names the neighbour it was', async ({ page }) => {
    await open(page);
    await reach(page, 'read');
    const { position } = await readCard(page);
    await (await answerControl(page, false)).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText(
      `That was ${letterAt(position)}`,
    );
    await expect(card(page).locator('[data-state="wrong"]')).toHaveCount(1);
    await expect(card(page).locator('[data-state="expected"]')).toHaveCount(1);
    await expect(page.getByTestId('d22-explain')).toContainText('one step above');
    const notes = staff(page).getByRole('img');
    await expect(notes).toHaveCount(2);
    await expect(notes.nth(0)).toHaveAttribute('data-style', 'correct');
    await expect(notes.nth(1)).toHaveAttribute('data-style', 'wrong');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('a placing card takes a tap on a line or space', async ({ page }) => {
    // Placing cards come a new-item block after the reading cards (r1.ts),
    // so a whole block is answered first.
    test.slow();
    await open(page);
    await reach(page, 'place');
    await expect(page.locator('#drill-prompt')).toHaveText(/^Tap .* the staff$/);
    await expect(page.getByTestId('d22-neck')).toHaveCount(0);
    // Every place is a button for VoiceOver and the arrow keys.
    await expect(staff(page).getByRole('button').first()).toBeVisible();
    await (await answerControl(page, true)).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(staff(page).getByRole('img')).toHaveAttribute('data-style', 'correct');
    await expect(page.getByTestId('d22-neck')).toBeVisible();
  });

  test('a miss on a placing card draws both notes', async ({ page }) => {
    // Placing cards come a new-item block after the reading cards (r1.ts),
    // so a whole block is answered first.
    test.slow();
    await open(page);
    await reach(page, 'place');
    await (await answerControl(page, false)).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(page.getByTestId('d22-explain')).toContainText('You tapped the ');
    await expect(staff(page).getByRole('img')).toHaveCount(2);
  });

  test('the ledger lines below open on open low E', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, [...PREREQS, 'R1.staff']);
    await focusSession(page, 'R1.ledger-below');
    await expect(page.locator('#drill-prompt')).toHaveText(
      'This is E, in the space below the 3rd ledger line. Tap E to continue.',
    );
    await press(page, 'e');
    await expect(page.getByTestId('d22-explain')).toHaveText(
      'E is in the space below the 3rd ledger line. Play it on the open 6th string.',
    );
  });

  test('a reading card on a phone @smoke @phone', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: 'G', exact: true }).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
