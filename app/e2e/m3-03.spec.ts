import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { C3_SKILLS, SKILLS_BEFORE_C3 } from './helpers/intervals';
import { C4_SKILLS } from './helpers/keys';

// M3-03: C5 chord-construction skills, spelled in D7. Triads open once the
// intervals (C3) and keys (C4) are mastered; 7 and maj7 share a skill, so the
// b7 vs 7 confusion is drilled side by side.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * An independent answer key (deliberately not imported from app code): each
 * chord tone above the root as [letters up, half steps up].
 */
const FORMULAS: Record<string, [number, number][]> = {
  '': [
    [2, 4],
    [4, 7],
  ],
  m: [
    [2, 3],
    [4, 7],
  ],
  '7': [
    [2, 4],
    [4, 7],
    [6, 10],
  ],
  maj7: [
    [2, 4],
    [4, 7],
    [6, 11],
  ],
  m7: [
    [2, 3],
    [4, 7],
    [6, 10],
  ],
  m7b5: [
    [2, 3],
    [4, 6],
    [6, 10],
  ],
};

/** `F♯` → `F#`. */
const ascii = (s: string) => s.replace('♯', '#').replace('♭', 'b');
/** The button's accessible name: `F#` → `F sharp`. */
const spoken = (n: string) =>
  n.charAt(0) + ({ '': '', '#': ' sharp', b: ' flat' } as Record<string, string>)[n.slice(1)];

function semitone(note: string): number {
  const acc = note.slice(1);
  const shift = acc.startsWith('#') ? acc.length : -acc.length;
  return (NATURAL[note.charAt(0)]! + shift + 12) % 12;
}

/** Spell a chord tone on its letter: the 3rd of F (2 letters, 4 half steps up) is A. */
function tone(root: string, letters: number, halfSteps: number): string {
  const letter = LETTERS[(LETTERS.indexOf(root.charAt(0)) + letters) % 7]!;
  const diff = ((semitone(root) + halfSteps - NATURAL[letter]! + 18) % 12) - 6;
  return letter + (diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff));
}

/** The chord on screen: `F♯m` → root `F#`, suffix `m`. */
async function subject(page: Page): Promise<{ text: string; root: string; suffix: string }> {
  const text = (await page.getByTestId('d7-subject').innerText()).trim();
  const m = /^([A-G][♯♭]?)(.*)$/.exec(text);
  expect(m, text).not.toBeNull();
  // The suffix is shown with ♭ too (`m7♭5`); the answer key is ASCII.
  return { text, root: ascii(m![1]!), suffix: m![2]!.replace(/♭/g, 'b') };
}

/** The notes after the root, in order. */
function blanks(root: string, suffix: string): string[] {
  const formula = FORMULAS[suffix];
  expect(formula, `no answer key for ${root}${suffix}`).toBeDefined();
  return formula!.map(([l, h]) => tone(root, l, h));
}

async function enter(page: Page, notes: readonly string[]): Promise<void> {
  const grid = page.getByTestId('d7-drill').getByRole('group');
  for (const n of notes) await grid.getByRole('button', { name: spoken(n), exact: true }).click();
}

/** Spell whatever chord is on screen correctly, wait for the next prompt, and return its name. */
async function spellCorrectly(page: Page): Promise<string> {
  const { text, root, suffix } = await subject(page);
  await enter(page, blanks(root, suffix));
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return text;
}

test.describe('M3-03 C5 chord construction', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    // Chord construction is gated on mastered intervals and keys (rule 7).
    await masterSkills(page, [...SKILLS_BEFORE_C3, ...C3_SKILLS, ...C4_SKILLS]);
  });

  test('triads come first, major and minor side by side', async ({ page }) => {
    await focusSession(page, 'C5.triads');
    await expect(page.getByTestId('d7-drill')).toBeVisible();
    const seen: string[] = [];
    for (let n = 0; n < 6; n++) seen.push(await spellCorrectly(page));
    // Every prompt is a triad, and F's major and minor are both introduced.
    for (const s of seen) expect(s).toMatch(/^[A-G][♯♭]?m?$/);
    expect(seen).toContain('F');
    expect(seen).toContain('Fm');
    await expectNoHorizontalOverflow(page);
  });

  test('7 and maj7 are drilled together, and the b7 slip is explained', async ({ page }) => {
    await masterSkills(page, ['C5.triads']);
    await focusSession(page, 'C5.sevenths');
    const seen: string[] = [];
    // Spell until a maj7 comes up, having met its dominant 7th on the way.
    for (let n = 0; n < 12 && !(await subject(page)).suffix.startsWith('maj7'); n++) {
      seen.push(await spellCorrectly(page));
    }
    const { text, root, suffix } = await subject(page);
    expect(suffix).toBe('maj7');
    expect(seen).toContain(`${text.replace('maj7', '')}7`);

    // Spell the maj7 with a dominant's b7: the 7th is wrong, and says why.
    const right = blanks(root, suffix);
    const b7 = tone(root, 6, 10);
    await enter(page, [...right.slice(0, 2), b7]);
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(page.getByTestId('d7-explanation')).toContainText(`the 7th of ${text}`);
    await expect(page.getByTestId('d7-expected')).toContainText(
      right[2]!.replace('#', '♯').replace('b', '♭'),
    );
    await expectNoHorizontalOverflow(page);
  });

  test('spells a triad on a phone @smoke', async ({ page }) => {
    await focusSession(page, 'C5.triads');
    const first = await spellCorrectly(page);
    expect(first).toMatch(/^[A-G][♯♭]?m?$/);
    await expectNoHorizontalOverflow(page);
  });
});
