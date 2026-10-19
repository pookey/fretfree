import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M4-04: C10 skills and D13 "Capo calculator". A song card names two of the
// shapes, the capo fret and the key that sounds; the learner picks the third.
// The neck below shows the capo and, once answered, the half-step ladder it
// climbs. Transposing the wrong way is explained and logged as the
// `capo:up` / `capo:down` confusion.

/** Rule 7: what Harmony (C8) builds on, keys and triads. */
const PREREQS = ['C4.sharp-keys', 'C5.triads'];

// An independent answer key (deliberately not imported from app code).
const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod12 = (n: number) => ((n % 12) + 12) % 12;
/** `B♭` → 10. */
const chroma = (note: string) =>
  mod12(LETTERS[note.charAt(0)]! + (note.includes('♯') ? 1 : note.includes('♭') ? -1 : 0));
/** A key button's accessible name, `B flat major` or `G major shapes` → 10 / 7. */
const chromaOfName = (name: string) => {
  const m = /^([A-G])( sharp| flat)? /.exec(name)!;
  return mod12(LETTERS[m[1]!]! + (m[2] === ' sharp' ? 1 : m[2] === ' flat' ? -1 : 0));
};

type Ask = 'sound' | 'shape' | 'fret';

interface Task {
  ask: Ask;
  guided: boolean;
  capo: number;
  /** The answer's pitch (sound, shape) or fret. */
  answer: number;
  /** The wrong-direction answer's pitch or fret. */
  wrongWay: number;
}

const drill = (page: Page) => page.getByTestId('d13-drill');
const choices = (page: Page) => drill(page).getByRole('group');
const neck = (page: Page) => page.getByTestId('d13-neck');

/** Work the answer out from the question's words. */
async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const ask = (await drill(page).getAttribute('data-ask')) as Ask;
  const capo = Number(await drill(page).getAttribute('data-capo'));
  const text = await page.getByTestId('d13-prompt').innerText();
  const tap = /Tap (\S+) to continue\.$/.exec(text);
  const guided = tap !== null;
  if (guided) {
    // The worked example names the answer to tap (rule 8).
    const shown = tap[1]!;
    const answer = ask === 'fret' ? Number(shown) : chroma(shown);
    return { ask, guided, capo, answer, wrongWay: -1 };
  }
  if (ask === 'sound') {
    const m = /You play ([A-G][♯♭]?)m? shapes with a capo on fret (\d+)\./.exec(text)!;
    expect(Number(m[2])).toBe(capo);
    const shape = chroma(m[1]!);
    return { ask, guided, capo, answer: mod12(shape + capo), wrongWay: mod12(shape - capo) };
  }
  const song = chroma(/The song is in ([A-G][♯♭]?) (major|minor)\./.exec(text)![1]!);
  if (ask === 'shape') {
    expect(text).toContain(`capo on fret ${capo},`);
    return { ask, guided, capo, answer: mod12(song - capo), wrongWay: mod12(song + capo) };
  }
  const shape = chroma(/You play it with ([A-G][♯♭]?)m? shapes/.exec(text)![1]!);
  const fret = mod12(song - shape);
  return { ask, guided, capo, answer: fret, wrongWay: 12 - fret };
}

/** The button for a pitch (key questions) or a fret. */
async function buttonFor(page: Page, task: Task, value: number): Promise<Locator> {
  if (task.ask === 'fret') {
    return choices(page).getByRole('button', { name: `fret ${value}`, exact: true });
  }
  for (const b of await choices(page).getByRole('button').all()) {
    const name = (await b.getAttribute('aria-label'))!;
    if (chromaOfName(name) === value) return b;
  }
  throw new Error(`No button for ${value}`);
}

/** Answer whatever is on screen correctly and wait for the next prompt. */
async function solve(page: Page): Promise<Task> {
  const task = await readTask(page);
  await (await buttonFor(page, task, task.answer)).click();
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return task;
}

/** A recall prompt's neck shows only what the question gives (M1-25). */
async function expectAnswerHidden(page: Page, task: Task): Promise<void> {
  const cells = neck(page).getByRole('listitem');
  if (task.ask === 'fret') {
    await expect(neck(page).getByTestId('d13-capo')).toHaveCount(0);
  } else {
    await expect(neck(page)).toHaveAccessibleName(`Neck with a capo on fret ${task.capo}`);
  }
  if (task.ask === 'sound') {
    await expect(cells.nth(task.capo)).toHaveAccessibleName(`Fret ${task.capo}, capo`);
  }
  if (task.ask === 'shape') await expect(cells.first()).toHaveAccessibleName('Open strings');
}

async function confusionPairs(page: Page): Promise<string[][]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ a: string; b: string }[]>((resolve) => {
      const req = db.transaction('confusions').objectStore('confusions').getAll();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return rows.map((r) => [r.a, r.b].sort());
  });
}

test.describe('M4-04 D13 capo calculator', () => {
  test('a worked example, then each direction from recall @smoke', async ({ page }, info) => {
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C10.capo-g-c-d');

    // The first card is G shapes, which key sounds, walked through (rule 8).
    const first = await readTask(page);
    expect(first).toMatchObject({ guided: true, ask: 'sound' });
    await expect(page.getByTestId('d13-prompt')).toContainText('raises G shapes');
    // The worked example names every rung on the neck, up to the capo.
    await expect(neck(page)).toHaveAccessibleName(`Neck with a capo on fret ${first.capo}`);
    await expect(neck(page).getByTestId('d13-capo')).toHaveCount(1);
    await expect(neck(page).getByRole('listitem').first()).toHaveAccessibleName(
      'Open strings, G shapes',
    );

    if (info.project.name !== 'iphone-smoke') {
      // Answer buttons and neck cells are comfortable targets on iPad (design §7: ≥ 44pt).
      const button = await choices(page).getByRole('button').first().boundingBox();
      expect(button!.height).toBeGreaterThanOrEqual(44);
      expect(button!.width).toBeGreaterThanOrEqual(44);
      const cell = await neck(page).getByRole('listitem').nth(1).boundingBox();
      expect(cell!.width).toBeGreaterThanOrEqual(44);
      expect(cell!.height).toBeGreaterThanOrEqual(44);
    }

    const seen = new Set<string>();
    const done = () => ['sound', 'shape', 'fret'].every((a) => seen.has(`recall:${a}`));
    for (let i = 0; i < 24 && !done(); i++) {
      const task = await readTask(page);
      if (!task.guided) await expectAnswerHidden(page, task);
      await solve(page);
      seen.add(`${task.guided ? 'guided' : 'recall'}:${task.ask}`);
    }
    expect([...seen]).toEqual(
      expect.arrayContaining(['recall:sound', 'recall:shape', 'recall:fret']),
    );
    await expectNoHorizontalOverflow(page);
  });

  test('the wrong way round is explained and logged as the direction confusion', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C10.capo-g-c-d');

    // Answer right until a recall "which key sounds?", then count down instead.
    let task: Task | null = null;
    for (let i = 0; i < 20; i++) {
      const t = await readTask(page);
      if (!t.guided && t.ask === 'sound' && t.capo !== 6) {
        task = t;
        break;
      }
      await solve(page);
    }
    expect(task).not.toBeNull();
    const wrong = await buttonFor(page, task!, task!.wrongWay);
    const right = await buttonFor(page, task!, task!.answer);
    await wrong.click();

    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await expect(page.getByTestId('d13-hint')).toContainText(/half steps? below/);
    await expect(page.getByTestId('d13-hint')).toContainText('count up');
    await expect(page.getByTestId('d13-summary')).toContainText(
      `A capo on fret ${task!.capo} raises`,
    );
    await expect(wrong).toHaveAttribute('data-state', 'wrong');
    await expect(right).toHaveAttribute('data-state', 'expected');
    // Every rung up to the capo is named once answered.
    const cells = neck(page).getByRole('listitem');
    await expect(cells.nth(task!.capo)).toHaveAccessibleName(
      new RegExp(`^Fret ${task!.capo}, capo, sounds `),
    );
    if (task!.capo > 1) await expect(cells.nth(1)).toHaveAccessibleName(/^Fret 1, [A-G]/);
    expect(await confusionPairs(page)).toEqual([['capo:down', 'capo:up']]);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeHidden();
  });

  test('a hardware keyboard answers keys and frets', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, PREREQS);
    await focusSession(page, 'C10.capo-g-c-d');

    const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const typed = new Set<Ask>();
    for (let i = 0; i < 24 && typed.size < 2; i++) {
      const task = await readTask(page);
      if (task.ask === 'fret') {
        for (const d of String(task.answer)) await page.keyboard.press(d);
      } else {
        const name = NAMES[task.answer]!;
        await page.keyboard.press(name.charAt(0));
        if (name.length > 1) await page.keyboard.press('#');
      }
      // A key that another button shares (B with B♭, 1 with 10) waits for Enter.
      const waiting = page.getByTestId('d13-hint').getByText(/^Typed/);
      await expect(page.getByTestId('feedback-correct').or(waiting)).toBeVisible();
      if (await waiting.isVisible()) await page.keyboard.press('Enter');
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(page.getByTestId('feedback-correct')).toBeHidden();
      typed.add(task.ask === 'fret' ? 'fret' : 'sound');
    }
    expect([...typed].sort()).toEqual(['fret', 'sound']);
  });
});
