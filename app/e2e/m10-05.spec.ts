import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, noteName, targetNote } from './helpers';
import { focusSession } from './helpers/focus';
import { seedString6Reviews } from './helpers/guides';
import { skillsExcept } from './helpers/skills';

// M10-05: D1 and D3 teach on a miss, spell notes with ♯/♭, and D3's note
// wheel names only the starting note at guide levels 1–2.

// An independent answer key (deliberately not imported from app code).
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pretty = (pc: string) => pc.replace('#', '♯');
const NATURALS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * Seed `skillId` at `guideLevel` with every item a known card due now, and
 * master every other skill: the session is that skill's recall prompts only.
 */
async function seedReviews(
  page: Page,
  skillId: string,
  itemIds: readonly string[],
  guideLevel: 1 | 2,
): Promise<void> {
  await page.evaluate(
    async ({ skillId, itemIds, guideLevel, others }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
      const now = Date.now();
      for (const itemId of itemIds) {
        tx.objectStore('cards').put({
          itemId,
          skillId,
          fsrs: {
            due: new Date(now - DAY),
            stability: 3,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: 3,
            learning_steps: 0,
            reps: 3,
            lapses: 0,
            state: 2,
            last_review: new Date(now - 3 * DAY),
          },
          createdAt: new Date(now - 6 * DAY),
          lastReviewedAt: new Date(now - 3 * DAY),
        });
      }
      const states = tx.objectStore('skillStates');
      for (const id of others) {
        states.put({ skillId: id, status: 'mastered', guideLevel: 0, rollingAccuracy: 1 });
      }
      states.put({ skillId, status: 'practising', guideLevel, rollingAccuracy: 0.8 });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { skillId, itemIds, guideLevel, others: skillsExcept(skillId) },
  );
  await page.reload();
}

const prompt = (page: Page) => page.locator('#drill-prompt');

/** The note names written on the wheel. */
async function wheelNames(page: Page): Promise<string[]> {
  const texts = await page
    .getByTestId('note-wheel')
    .locator('[data-testid^="wheel-note-"] text')
    .allTextContents();
  return texts.map((t) => t.trim());
}

/** The D1 miss line, from an independent table: where the chosen note is, then the count. */
function d1Expected(fret: number, said: string): string {
  const name = (f: number) => pretty(noteName(6, f));
  let at = -1;
  for (let f = 0; f <= 15; f++) {
    if (noteName(6, f) === said && (at < 0 || Math.abs(f - fret) < Math.abs(at - fret))) at = f;
  }
  const diff = at - fret;
  const frets = Math.abs(diff) === 1 ? 'one fret' : `${Math.abs(diff)} frets`;
  const where = at === 0 ? 'the open string' : `fret ${at}`;
  let count: string;
  if (fret === 0) count = 'E is the open string 6.';
  else if (fret === 12) count = "Fret 12 is the open string's note again: E.";
  else {
    const from = fret > 6 ? 12 : 0;
    const step = fret > from ? 1 : -1;
    const walk: string[] = [];
    for (let f = from; f !== fret + step; f += step) walk.push(name(f));
    const start = from === 0 ? 'the open E' : 'fret 12, E';
    count = `Count ${step > 0 ? 'up' : 'down'} from ${start}: ${walk.join(' ')}.`;
  }
  return `You said ${said}. ${said} is ${frets} ${diff < 0 ? 'lower' : 'higher'}, at ${where}. ${count}`;
}

async function d1MissExplains(page: Page): Promise<void> {
  await freshStart(page);
  await seedString6Reviews(page, 1);
  await focusSession(page, 'F2.string6-naturals');
  await expect(prompt(page)).toHaveText('Name the highlighted note');
  const explain = page.getByTestId('d1-explain');
  await expect(explain).toBeEmpty();

  const fret = Number(await page.getByTestId('marker-target').getAttribute('data-fret'));
  const note = await targetNote(page);
  const said = note === 'C' ? 'D' : 'C';
  await page
    .getByRole('group', { name: 'Name the highlighted note' })
    .getByRole('button', { name: said, exact: true })
    .click();
  await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${pretty(note)}.`);
  await expect(explain).toHaveText(d1Expected(fret, said));
  await expect(explain).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(explain).toBeEmpty();
}

test.describe('M10-05 D1 teaches on a miss', () => {
  test('a wrong answer explains where the chosen note is and counts to the target', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await d1MissExplains(page);

    // A right answer gets one confirming line.
    const fret = Number(await page.getByTestId('marker-target').getAttribute('data-fret'));
    const note = await targetNote(page);
    await page
      .getByRole('group', { name: 'Name the highlighted note' })
      .getByRole('button', { name: note, exact: true })
      .click();
    await expect(page.getByTestId('d1-explain')).toHaveText(
      fret === 0 ? `${note}: string 6, played open.` : `${note}: fret ${fret} on string 6.`,
    );
  });

  test('a wrong answer explains itself on a phone @smoke', async ({ page }) => {
    await d1MissExplains(page);
  });
});

test.describe('M10-05 D3 fades the wheel and teaches on a miss', () => {
  test('at guide level 1 the wheel names only the start until answered', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    const items = [1, -1].flatMap((s) =>
      NATURALS.map((pc) => `letter:${s > 0 ? '+' : '-'}1@${pc}`),
    );
    await seedReviews(page, 'F1.alphabet', items, 1);
    await focusSession(page, 'F1.alphabet');

    const text = (await prompt(page).innerText()).trim();
    const m = /^The note (after|before) ([A-G]) in the musical alphabet\?$/.exec(text);
    expect(m, text).not.toBeNull();
    const [, which, from] = m!;
    const i = LETTERS.indexOf(from!) + (which === 'after' ? 1 : -1);
    const expected = LETTERS[(i + 7) % 7]!;

    const panel = page.getByTestId('context-panel');
    await expect(panel.getByTestId('note-wheel')).toHaveAttribute('data-guide-level', '1');
    await expect(panel.locator('[data-testid^="wheel-note-"]')).toHaveCount(12);
    await expect(panel.getByTestId('half-step-B-C')).toHaveText('½');
    await expect(panel.getByTestId('half-step-E-F')).toHaveText('½');
    expect(await wheelNames(page)).toEqual([from]);

    // A wrong answer: the rule, then the wheel names the answer and the choice.
    const said = LETTERS.find((l) => l !== expected && l !== from)!;
    await page
      .getByRole('group', { name: text })
      .getByRole('button', { name: said, exact: true })
      .click();
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${expected}.`);
    await expect(page.getByTestId('d3-explain')).toContainText(
      'The musical alphabet runs A B C D E F G, then A again.',
    );
    await expect(page.getByTestId('d3-explain')).toContainText(
      `${which === 'after' ? 'After' : 'Before'} ${from} comes ${expected}.`,
    );
    expect((await wheelNames(page)).sort()).toEqual([from!, expected, said].sort());
  });

  test('a whole-step miss names the half step it took, in ♯', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    const items = [2, -2].flatMap((s) => NATURALS.map((pc) => `step:${s > 0 ? '+' : '-'}2@${pc}`));
    await seedReviews(page, 'F1.whole-steps', items, 1);
    await focusSession(page, 'F1.whole-steps');

    const text = (await prompt(page).innerText()).trim();
    const m = /^A whole step (above|below) ([A-G])\?$/.exec(text);
    expect(m, text).not.toBeNull();
    const [, dir, from] = m!;
    const sign = dir === 'above' ? 1 : -1;
    const at = (n: number) => CHROMATIC[(CHROMATIC.indexOf(from!) + n + 12) % 12]!;
    const expected = at(2 * sign);
    const half = at(sign);
    expect(await wheelNames(page)).toEqual([from]);

    // Buttons read ♯; the half step is the classic miss.
    await expect(page.getByRole('button', { name: /#/ })).toHaveCount(0);
    await page
      .getByRole('group', { name: text })
      .getByRole('button', { name: pretty(half), exact: true })
      .click();
    await expect(page.getByTestId('feedback-wrong')).toContainText(`That was ${pretty(expected)}.`);
    const explain = page.getByTestId('d3-explain');
    await expect(explain).toContainText(`You said ${pretty(half)}, a half step ${dir} ${from}.`);
    const walk = [from!, half, expected].map(pretty).join(' ');
    await expect(explain).toContainText(`A whole step is two frets: ${walk}.`);
    // Two naturals a fret apart are B–C or E–F: the explanation names that gap.
    const steps = [from!, half, expected];
    const crosses = steps.some((n, k) => k > 0 && !n.includes('#') && !steps[k - 1]!.includes('#'));
    if (crosses) await expect(explain).toContainText(/There's no sharp between (B and C|E and F)/);
  });
});
