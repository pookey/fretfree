import { expect, type Page } from '@playwright/test';
import { focusSession } from './focus';
import { C3_SKILLS, SKILLS_BEFORE_C3 } from './intervals';

// D5 at its widest scope: every interval from m2 to P8 on the buttons. The
// scope widens within a session once the rolling accuracy is high enough, so
// a spec seeds plenty of due name-it cards and answers its way there.

const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const NAMES = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];
const C3_INTERVALS = ['m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'];
const SKILL_OF: Record<string, string> = {
  m3: 'C3.thirds',
  M3: 'C3.thirds',
  P4: 'C3.fourths-fifths',
  TT: 'C3.fourths-fifths',
  P5: 'C3.fourths-fifths',
  m7: 'C3.sevenths',
  M7: 'C3.sevenths',
  m6: 'C3.sixths',
  M6: 'C3.sixths',
  m2: 'C3.seconds',
  M2: 'C3.seconds',
};

/** C3's playable shapes (`engine/skills/c3.ts`): up to 2 strings over, 4 frets of stretch. */
function c3Shapes(): { shape: string; skillId: string }[] {
  const out: { shape: string; skillId: string }[] = [];
  for (const interval of C3_INTERVALS) {
    const semitones = NAMES.indexOf(interval);
    for (let from = 6; from >= 2; from--) {
      for (let to = from - 1; to >= Math.max(1, from - 2); to--) {
        const offset = semitones - (OPEN_MIDI[to]! - OPEN_MIDI[from]!);
        if (Math.abs(offset) <= 4) {
          out.push({ shape: `${interval}@s${from}→s${to}`, skillId: SKILL_OF[interval]! });
        }
      }
    }
  }
  return out;
}

/**
 * Every C3 skill in practice at guide level 3, with every name-it card due
 * and every tap card known, so a C3 session is all D5 reviews. Reloads.
 */
export async function seedWideD5(page: Page): Promise<void> {
  await page.evaluate(
    async ({ mastered, practising, shapes }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
      const now = Date.now();
      const card = (itemId: string, skillId: string, due: number, stability: number) => ({
        itemId,
        skillId,
        fsrs: {
          due: new Date(due),
          stability,
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
      const cards = tx.objectStore('cards');
      for (const { shape, skillId } of shapes) {
        cards.put(card(`interval-name:${shape}`, skillId, now - DAY, 3));
        cards.put(card(`interval:${shape}`, skillId, now + 30 * DAY, 60));
      }
      const states = tx.objectStore('skillStates');
      for (const skillId of mastered) {
        states.put({ skillId, status: 'mastered', guideLevel: 0, rollingAccuracy: 1 });
      }
      for (const skillId of practising) {
        states.put({ skillId, status: 'practising', guideLevel: 3, rollingAccuracy: 0.8 });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { mastered: SKILLS_BEFORE_C3, practising: C3_SKILLS, shapes: c3Shapes() },
  );
  await page.reload();
}

const drill = (page: Page) => page.getByTestId('d5-drill');
const choices = (page: Page) =>
  drill(page)
    .getByRole('group', { name: /interval|continue/i })
    .getByRole('button');

/** The interval the two dots make, read off the neck. */
async function correctAnswer(page: Page): Promise<string> {
  const prompt = (await drill(page).locator('#drill-prompt').innerText()).trim();
  const guided = /Tap (\S+) to continue/.exec(prompt);
  if (guided) return guided[1]!;
  const cell = async (style: string) => {
    const m = page.locator(`svg[data-fret-from] [data-testid="marker-${style}"]`).first();
    return (
      OPEN_MIDI[Number(await m.getAttribute('data-string'))]! +
      Number(await m.getAttribute('data-fret'))
    );
  };
  return NAMES[(await cell('target')) - (await cell('root'))]!;
}

/** Answer the D5 prompt on screen, rightly or wrongly, and move on. */
export async function answerD5(page: Page, right: boolean): Promise<void> {
  const answer = await correctAnswer(page);
  const names = await choices(page).allInnerTexts();
  const name = right ? answer : (names.map((n) => n.trim()).find((n) => n !== answer) as string);
  await choices(page)
    .and(page.getByRole('button', { name, exact: true }))
    .click();
  if (right) {
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
    await expect(page.getByTestId('feedback-correct')).toBeHidden();
  } else {
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  }
}

/** How many answer buttons the D5 prompt on screen has. */
export async function d5ChoiceCount(page: Page): Promise<number> {
  await expect(drill(page)).toBeVisible();
  return choices(page).count();
}

/** The legend's guide level, or null when the help panel is hidden. */
export async function legendLevel(page: Page): Promise<number | null> {
  const legend = page.getByTestId('interval-legend');
  if ((await legend.count()) === 0) return null;
  return Number(await legend.getAttribute('data-level'));
}

/**
 * Start a C3 session and answer until a prompt has every interval on its
 * buttons and the full level-3 legend: right answers widen the scope, and
 * once it is widest, pairs of wrong ones restore guides faded on the way.
 */
export async function reachWideD5(page: Page, limit = 60): Promise<void> {
  await focusSession(page, C3_SKILLS);
  for (let i = 0; i < limit; i++) {
    const count = await d5ChoiceCount(page);
    if (count === NAMES.length - 1 && (await legendLevel(page)) === 3) return;
    await answerD5(page, count < NAMES.length - 1);
  }
  throw new Error(`No widest-scope prompt at guide level 3 within ${limit} answers`);
}
