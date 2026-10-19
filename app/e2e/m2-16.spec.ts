import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import { focusSession } from './helpers/focus';

// M2-16: "test out" of a locked module (design §3.4, research/02 rule 7).
// Chords needs Intervals and Keys mastered. That gate stays, but an
// experienced player can prove the mastery: a locked module's detail offers
// a test-out of the prerequisites its first skills still need (for Chords,
// the C3 and C4 skills C5.triads builds on). Passed fluently, Chords opens
// and a Chords session starts; a partial pass keeps what it found.

// An independent answer key (deliberately not imported from app code).
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const INTERVAL_SEMITONES: Record<string, number> = {
  m2: 1,
  M2: 2,
  m3: 3,
  M3: 4,
  P4: 5,
  TT: 6,
  P5: 7,
  m6: 8,
  M6: 9,
  m7: 10,
  M7: 11,
};
/** Half steps from the tonic to each degree of a major scale (W W H W W W H). */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** Correct answers move on by themselves after this long. */
const AUTO_ADVANCE_MS = 700;
/** Test-out probes for Chords: 3rds (6), 4ths and 5ths (8), sharp keys (4), flat keys (4). */
const CHORDS_PROBES = 22;

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Test out' });
const probe = (page: Page) => page.getByTestId('placement-probe');
const result = (page: Page) => page.getByTestId('test-out-result');
const detail = (page: Page) => page.getByTestId('module-detail');

/** `F#` → `F sharp`, the D7 button's accessible name. */
const spoken = (n: string) =>
  n.charAt(0) + ({ '': '', '#': ' sharp', b: ' flat' } as Record<string, string>)[n.slice(1)];

function semitone(note: string): number {
  const acc = note.slice(1);
  const shift = acc.startsWith('#') ? acc.length : -acc.length;
  return (NATURAL[note.charAt(0)]! + shift + 12) % 12;
}

/** The note `letters` letters and `halfSteps` half steps above `root`, on its letter. */
function tone(root: string, letters: number, halfSteps: number): string {
  const letter = LETTERS[(LETTERS.indexOf(root.charAt(0)) + letters) % 7]!;
  const diff = ((semitone(root) + halfSteps - NATURAL[letter]! + 18) % 12) - 6;
  return letter + (diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff));
}

/** A major key, spelled with each letter once: F# → F# G# A# B C# D# E#. */
const majorScale = (key: string) => MAJOR.map((h, i) => tone(key, i, h));

type Answer =
  | { kind: 'button'; label: string }
  | { kind: 'cell'; string: number; fret: number }
  | { kind: 'spell'; notes: string[] };

/** The right answer to a test-out probe for Chords, from its item ID (and the neck, for D6). */
async function solve(page: Page, itemId: string): Promise<Answer> {
  // D5 names the interval the two dots make.
  const named = /^interval-name:([mMPT][1-8T])@s\d→s\d$/.exec(itemId);
  if (named) return { kind: 'button', label: named[1]! };
  // D6 taps the interval above the shown root, on the item's upper string.
  const tap = /^interval:([mMPT][1-8T])@s(\d)→s(\d)$/.exec(itemId);
  if (tap) {
    const root = dialog(page).getByTestId('marker-root').first();
    const rs = Number(await root.getAttribute('data-string'));
    const rf = Number(await root.getAttribute('data-fret'));
    expect(rs).toBe(Number(tap[2]));
    const string = Number(tap[3]);
    const fret = OPEN_MIDI[rs]! + rf + INTERVAL_SEMITONES[tap[1]!]! - OPEN_MIDI[string]!;
    return { kind: 'cell', string, fret };
  }
  // D7 spells the key after its given tonic.
  const key = /^spell-key:([A-G][#b]?)$/.exec(itemId);
  if (key) return { kind: 'spell', notes: majorScale(key[1]!).slice(1) };
  throw new Error(`No answer key for ${itemId}`);
}

async function answerRight(page: Page, itemId: string): Promise<void> {
  const a = await solve(page, itemId);
  if (a.kind === 'button') {
    await dialog(page)
      .locator('[role="group"][aria-labelledby="drill-prompt"]')
      .getByRole('button', { name: a.label, exact: true })
      .click();
  } else if (a.kind === 'cell') {
    await dialog(page)
      .locator('svg[data-fret-from]')
      .locator(`[data-cell="s${a.string}f${a.fret}"]`)
      .click();
  } else {
    const grid = dialog(page).getByTestId('d7-drill').getByRole('group');
    for (const n of a.notes)
      await grid.getByRole('button', { name: spoken(n), exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Check' }).click();
  }
  await expect(dialog(page).getByTestId('feedback-correct')).toBeVisible();
}

/**
 * Run the test-out to its result. `knows` picks the probes answered (fluently:
 * the page clock is paused, so every answer is instant); the rest get "Not sure".
 * Returns the item IDs probed.
 */
async function takeTestOut(page: Page, knows: (itemId: string) => boolean): Promise<string[]> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await detail(page).getByRole('button', { name: 'Test out' }).click();
  await expect(dialog(page)).toBeVisible();
  const seen: string[] = [];
  for (let n = 0; n < 60 && !(await result(page).isVisible()); n++) {
    await expect(probe(page).or(result(page))).toBeVisible();
    if (!(await probe(page).isVisible())) break;
    const id = (await probe(page).getAttribute('data-item'))!;
    seen.push(id);
    if (n === 0) await expectNoHorizontalOverflow(page);
    if (knows(id)) {
      await answerRight(page, id);
      await page.clock.runFor(AUTO_ADVANCE_MS);
    } else {
      await dialog(page).getByRole('button', { name: 'Not sure' }).click();
    }
    await expect(probe(page).or(result(page))).toBeVisible();
    if (await probe(page).isVisible())
      await expect(probe(page)).not.toHaveAttribute('data-item', id);
  }
  await page.clock.resume();
  await expect(result(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  return seen;
}

/** The chord on screen: `F♯m` → root `F#`, suffix `m`. */
async function triad(page: Page): Promise<{ text: string; notes: string[] }> {
  const text = (await page.getByTestId('d7-subject').innerText()).trim();
  const m = /^([A-G][♯♭]?)(m?)$/.exec(text);
  expect(m, `${text} is a triad`).not.toBeNull();
  const root = m![1]!.replace('♯', '#').replace('♭', 'b');
  return { text, notes: [tone(root, 2, m![2] ? 3 : 4), tone(root, 4, 7)] };
}

test.describe('M2-16 test out of a locked module', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await freshStart(page, '/learn?module=chords');
    await expect(detail(page).getByRole('heading', { name: 'Chords', level: 2 })).toBeVisible();
    await expect(detail(page).getByTestId('module-state')).toHaveText('Locked: preview');
  });

  test('a fluent test-out opens Chords, and a Chords session starts @smoke', async ({ page }) => {
    // Twenty-odd probes; leave room for a loaded machine.
    test.setTimeout(120_000);
    const offer = page.getByRole('region', { name: 'Already know this?' });
    await expect(offer).toContainText('a short test of Interval shapes: 3rds');
    await expect(offer).toContainText('Spell the flat keys');
    await expectNoHorizontalOverflow(page);

    const seen = await takeTestOut(page, () => true);
    // Scoped to what C5.triads needs, at the test-out bar: every probe asked, all fluent.
    expect(seen).toHaveLength(CHORDS_PROBES);
    for (const kind of [/^interval-name:/, /^interval:/, /^spell-key:/])
      expect(seen.some((id) => kind.test(id))).toBe(true);
    expect(seen.every((id) => /^(interval-name:|interval:|spell-key:)/.test(id))).toBe(true);

    const found = result(page).getByRole('list', { name: 'What the test found' });
    await expect(found).toHaveText(/Intervals: known\.\s*Keys: known\./);
    await expect(result(page)).toContainText('Chords is open.');
    await expect(result(page)).toBeFocused();
    // The map reloads: Chords is open, its triads ready for sessions.
    await expect(detail(page).getByTestId('module-state')).toHaveText('In progress');
    const triads = detail(page).getByTestId('skill-C5.triads');
    await expect(triads).toHaveAttribute('data-status', 'unlocked');
    await expect(triads.getByRole('link', { name: 'Practise this now' })).toBeVisible();
    await expect(
      result(page).getByRole('link', { name: 'Start a Chords session' }),
    ).toHaveAttribute('href', '/session?skill=C5.triads');
    await expectNoHorizontalOverflow(page);
    // A fresh load agrees (and on a phone, the map is its own screen).
    await page.goto('/learn');
    await expect(page.getByTestId('module-chords')).toHaveAttribute('data-state', 'open');

    await focusSession(page, 'C5.triads');
    const { text, notes } = await triad(page);
    const grid = page.getByTestId('d7-drill').getByRole('group');
    for (const n of notes) await grid.getByRole('button', { name: spoken(n), exact: true }).click();
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    expect(text).toMatch(/^[A-G][♯♭]?m?$/);
  });

  test('a partial test-out keeps what it found and says what to practise', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'The full flow runs on the iPad projects.');
    test.setTimeout(120_000);
    // Knows the interval shapes, not the keys.
    await takeTestOut(page, (id) => !id.startsWith('spell-key:'));

    const found = result(page).getByRole('list', { name: 'What the test found' });
    await expect(found).toHaveText(/Intervals: known\.\s*Keys: let’s practise those first\./);
    await expect(result(page)).toContainText('Chords opens once those are mastered');
    await expect(result(page).getByRole('link')).toHaveCount(0);
    // Chords stays locked (rule 7), but the passed part unlocks what it can.
    await expect(detail(page).getByTestId('module-state')).toHaveText('Locked: preview');
    await expect(page.getByTestId('module-intervals')).toHaveAttribute('data-state', 'open');

    // Only the keys are left to prove, so testing out again asks just those.
    await result(page).getByRole('button', { name: 'Test out again' }).click();
    await expect(result(page)).toHaveCount(0);
    const offer = page.getByRole('region', { name: 'Already know this?' });
    await expect(offer).toContainText(
      'a short test of Spell the sharp keys and Spell the flat keys',
    );
    await expect(offer.getByRole('button', { name: 'Test out' })).toBeFocused();
    const seen = await takeTestOut(page, () => true);
    expect(seen.every((id) => id.startsWith('spell-key:'))).toBe(true);
    await expect(result(page).getByRole('list', { name: 'What the test found' })).toHaveText(
      /^Keys: known\.$/,
    );
    await expect(result(page)).toContainText('Chords is open.');
    await expect(result(page).getByRole('button', { name: 'Test out again' })).toHaveCount(0);
    await expect(detail(page).getByTestId('module-state')).toHaveText('In progress');
  });
});
