import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { press } from './helpers/keyboard';

// M8-15: R5 and the staff-interval drill, "Name the step or skip". A reading
// card shows two neighbouring notes on the treble 8vb staff and takes the
// interval, 2nd (a step) to octave, by button or number key; a placing card
// shows one note and "a 3rd above" and takes a tap on a line or space. The
// staff sits above the neck, which shows the pair once answered. R5 opens as
// soon as R1's staff is being practised.

const PREREQS = [
  'F4.pulse',
  'T1.simple-meters',
  'F2.string6-naturals',
  'F2.string5-naturals',
  'R1.staff',
];

const LABELS = ['2nd', '3rd', '4th', '5th', '6th', '7th', 'Octave'];
const NICK: Record<string, string> = { '2nd': '2nd step', '3rd': '3rd skip' };
/** A label's button name: "3rd skip", "4th". */
const buttonName = (label: string) => NICK[label] ?? label;

const card = (page: Page) => page.getByTestId('si-drill');
const staff = (page: Page) => page.getByTestId('si-staff').getByRole('group');
const prompt = (page: Page) => page.locator('#drill-prompt');

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

/** The position a note's label ("whole note on line 2") names. */
function positionOfLabel(label: string): number {
  const p = POSITIONS.find((q) => label.endsWith(` note on ${positionName(q)}`));
  expect(p, label).toBeDefined();
  return p!;
}

interface Card {
  direction: string;
  /** Reading: the right label. Placing: the start note and the right place. */
  label?: string;
  from?: number;
  to?: number;
}

/** The card on screen and the answer that is right for it. */
async function readCard(page: Page): Promise<Card> {
  await expect(card(page)).toBeVisible();
  await expect(staff(page)).toHaveAttribute('data-ready', 'true');
  const direction = (await card(page).getAttribute('data-direction')) ?? '';
  const task = (await prompt(page).textContent()) ?? '';
  if (direction === 'read') {
    const worked = /Tap (\S+) to continue\.$/.exec(task);
    if (worked) return { direction, label: worked[1] };
    const notes = staff(page).getByRole('img');
    const marked = staff(page).locator('[role="img"][data-style="target"]');
    const pair = (await marked.count()) > 0 ? marked : notes;
    const labels = await pair.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!));
    expect(labels).toHaveLength(2);
    const [a, b] = labels.map(positionOfLabel) as [number, number];
    return { direction, label: LABELS[Math.abs(b - a) - 1] };
  }
  const from = positionOfLabel((await staff(page).getByRole('img').getAttribute('aria-label'))!);
  const mark = staff(page).getByTestId('staff-mark');
  if ((await mark.count()) > 0) {
    return { direction, from, to: Number(await mark.getAttribute('data-position')) };
  }
  const m = /^Tap the note (?:an? )(\S+) (above|below)$/.exec(task);
  expect(m, task).not.toBeNull();
  const size = m![1] === 'octave' ? 8 : LABELS.indexOf(m![1]!) + 2;
  return { direction, from, to: from + (m![2] === 'above' ? 1 : -1) * (size - 1) };
}

/** The control that answers the card on screen, right or (one size off) wrong. */
async function answerControl(page: Page, right: boolean): Promise<Locator> {
  const c = await readCard(page);
  if (c.direction === 'read') {
    const i = LABELS.indexOf(c.label!);
    const label = right ? c.label! : LABELS[i === LABELS.length - 1 ? i - 1 : i + 1]!;
    return card(page).getByRole('button', { name: buttonName(label), exact: true });
  }
  // Wrong: one place past the right one, or short of it at the edge of the
  // staff (never the start note itself, which isn't an interval).
  const way = c.to! > c.from! ? 1 : -1;
  let miss = c.to! + way;
  if (miss < -1 || miss > 9) miss = c.to! - way === c.from ? c.from! - way : c.to! - way;
  return staff(page).getByRole('button', { name: positionName(right ? c.to! : miss), exact: true });
}

async function open(page: Page, skillId = 'R5.steps-skips') {
  await freshStart(page);
  await masterSkills(page, PREREQS);
  await focusSession(page, skillId);
  await expect(card(page)).toBeVisible();
}

/** Answers cards right until one asks `direction` and isn't a worked example. */
async function reach(page: Page, direction: 'read' | 'place') {
  for (let i = 0; i < 40; i++) {
    const task = (await prompt(page).textContent()) ?? '';
    const dir = await card(page).getAttribute('data-direction');
    if (dir === direction && !task.includes('to continue')) return;
    const progress = page.getByRole('progressbar', { name: 'Session progress' });
    const at = Number(await progress.getAttribute('aria-valuenow'));
    await (await answerControl(page, true)).click();
    // The session moves on by itself after a right answer. Under load the
    // brief ✓ can come and go before a check sees it, so wait for the next card.
    await expect(progress).not.toHaveAttribute('aria-valuenow', String(at));
    await expect(page.getByTestId('feedback-bar')).not.toHaveAttribute('data-state', /./);
  }
  throw new Error(`No unguided ${direction} card`);
}

test.describe('M8-15 name the step or skip', () => {
  test('a reading card: the pair above the neck, 2nd to octave answers @layout', async ({
    page,
  }) => {
    await open(page);
    // The first card works a step up through, by counting.
    await expect(prompt(page)).toHaveText(
      /^(Line|Space) to (line|space): count both notes, 1, 2\. A 2nd up, a step\. Tap 2nd to continue\.$/,
    );
    await expect(staff(page)).toHaveAttribute('data-ready', 'true');
    await expect(staff(page).getByRole('img')).toHaveCount(2);
    const neck = page.getByTestId('si-neck');
    await expect(neck).toBeVisible();
    // iPad: the staff sits above the neck, both on screen at once (design §12).
    const staffBox = (await staff(page).boundingBox())!;
    const neckBox = (await neck.boundingBox())!;
    expect(staffBox.y + staffBox.height).toBeLessThanOrEqual(neckBox.y);
    expect(neckBox.y + neckBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    const answers = card(page)
      .getByRole('group', { name: /to continue/ })
      .getByRole('button');
    await expect(answers).toHaveText(LABELS.map(buttonName));
    for (const r of await answers.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);

    await card(page).getByRole('button', { name: '2nd step', exact: true }).click();
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ 2nd');
    await expect(page.getByTestId('si-explain')).toHaveText(
      /^[A-G] to [A-G], .*: a 2nd up, a step\.$/,
    );
    // The neck shows the pair in one position.
    await expect(neck.getByRole('group', { name: /as played/ })).toBeVisible();
  });

  test('answers a reading card with a number key', async ({ page }) => {
    await open(page);
    await reach(page, 'read');
    // Before the answer the staff says where the notes are, never their names.
    await expect(staff(page).getByRole('img').first()).toHaveAccessibleName(/ note on /);
    const { label } = await readCard(page);
    await press(page, String(LABELS.indexOf(label!) + 2));
    await expect(page.getByTestId('feedback-correct')).toHaveText(`✓ ${label}`);
    await expect(
      card(page).getByRole('button', { name: buttonName(label!), exact: true }),
    ).toHaveAttribute('data-state', 'correct');
  });

  test('a miss on a reading card marks where the answer reached', async ({ page }) => {
    await open(page);
    await reach(page, 'read');
    const { label } = await readCard(page);
    await (await answerControl(page, false)).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${label}`);
    await expect(card(page).locator('button[data-state="wrong"]')).toHaveCount(1);
    await expect(card(page).locator('button[data-state="expected"]')).toHaveCount(1);
    await expect(page.getByTestId('si-explain')).toContainText(
      /would be .*, one place (further|nearer)\./,
    );
    await expect(staff(page).getByTestId('staff-mark')).toHaveAttribute('data-style', 'wrong');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('a placing card takes a tap on a line or space', async ({ page }) => {
    // Placing cards come a new-item block after the reading cards (r5.ts).
    test.slow();
    await open(page);
    await reach(page, 'place');
    await expect(prompt(page)).toHaveText(/^Tap the note an? \S+ (above|below)$/);
    await expect(page.getByTestId('si-neck')).toHaveCount(0);
    // Every place is a button for VoiceOver and the arrow keys.
    await expect(staff(page).getByRole('button').first()).toBeVisible();
    await (await answerControl(page, true)).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(staff(page).getByRole('img')).toHaveCount(2);
    await expect(page.getByTestId('si-neck')).toBeVisible();
  });

  test('a miss on a placing card says what was tapped', async ({ page }) => {
    test.slow();
    await open(page);
    await reach(page, 'place');
    await (await answerControl(page, false)).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(page.getByTestId('si-explain')).toContainText('You tapped ');
    await expect(staff(page).getByTestId('staff-mark')).toHaveCount(1);
  });

  test('4ths and 5ths open once steps and skips are under way', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, [...PREREQS, 'R5.steps-skips']);
    await focusSession(page, 'R5.fourths-fifths');
    await expect(prompt(page)).toHaveText(/A 4th up\. Tap 4th to continue\.$/);
    await press(page, '4');
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ 4th');
  });

  test('a reading card on a phone @smoke @phone', async ({ page }) => {
    await open(page);
    await card(page).getByRole('button', { name: '2nd step', exact: true }).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
