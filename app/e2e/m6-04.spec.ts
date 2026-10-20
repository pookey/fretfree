import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M6-04: the I1 voice-leading puzzle (D19). A triad is drawn as rings on a
// string set, and the learner taps the next chord's voicing nearest it: the
// held note stays, the others move a fret or two. A tap on the key's third
// chord (V when asked for IV) is logged against that move.

interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code).
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN_MIDI: Record<number, number> = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };

const chroma = (name: string) =>
  (CHROMATIC.indexOf(name[0]!) + (name[1] === '♯' ? 1 : name[1] === '♭' ? 11 : 0)) % 12;
const midiAt = (c: Cell) => OPEN_MIDI[c.string]! + c.fret;
const key = (c: Cell) => `s${c.string}f${c.fret}`;
const majorTriad = (root: number) => [0, 4, 7].map((s) => (root + s) % 12);

/**
 * The voicing of `toRoot`'s major triad on the same strings as `from` whose
 * every note lies within 2 frets of the one below it on its string: one
 * chord tone per string, rising in pitch.
 */
function solveMove(from: readonly Cell[], toRoot: number): Cell[] {
  const tones = majorTriad(toRoot);
  const options = from.map((c) =>
    [-2, -1, 0, 1, 2]
      .map((d) => ({ string: c.string, fret: c.fret + d }))
      .filter((n) => n.fret >= 0 && n.fret <= 15 && tones.includes(midiAt(n) % 12)),
  );
  const found: Cell[][] = [];
  for (const a of options[0]!) {
    for (const b of options[1]!) {
      for (const c of options[2]!) {
        const pcs = new Set([a, b, c].map((n) => midiAt(n) % 12));
        if (pcs.size === 3 && midiAt(a) < midiAt(b) && midiAt(b) < midiAt(c)) found.push([a, b, c]);
      }
    }
  }
  expect(found, `nearest ${CHROMATIC[toRoot]} from ${from.map(key).join(' ')}`).toHaveLength(1);
  return found[0]!;
}

const drill = (page: Page) => page.getByTestId('d19-drill');
const promptText = (page: Page) => page.getByTestId('d19-prompt');
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="${key(c)}"]`);

async function markersOf(page: Page, style: string): Promise<Cell[]> {
  const out: Cell[] = [];
  for (const m of await neck(page).getByTestId(`marker-${style}`).all()) {
    out.push({
      string: Number(await m.getAttribute('data-string')),
      fret: Number(await m.getAttribute('data-fret')),
    });
  }
  return out.sort((a, b) => b.string - a.string);
}

interface Task {
  guided: boolean;
  from: number;
  to: number;
  low: number;
  /** The starting triad, low string first (recall prompts only). */
  start: Cell[];
  /** The cells to tap. */
  answer: Cell[];
}

/** Read the prompt and the neck, and solve from the independent key. */
async function readTask(page: Page): Promise<Task> {
  await expect(drill(page)).toBeVisible();
  const text = (await promptText(page).innerText()).trim();
  const m = /^(Voice-lead|This is) ([A-G][♯♭]?) to ([A-G][♯♭]?) on strings (\d)/.exec(text);
  expect(m, text).not.toBeNull();
  const task = { from: chroma(m![2]!), to: chroma(m![3]!), low: Number(m![4]) };
  if (m![1] === 'This is') {
    // A worked example marks the notes to copy (rule 8).
    const answer = await markersOf(page, 'target');
    expect(answer).toHaveLength(3);
    return { ...task, guided: true, start: [], answer };
  }
  const start = await markersOf(page, 'ghost');
  expect(start.map((c) => c.string)).toEqual([task.low, task.low - 1, task.low - 2]);
  return { ...task, guided: false, start, answer: solveMove(start, task.to) };
}

/** Answer whatever is on screen correctly and wait for the next prompt. */
async function solve(page: Page): Promise<Task> {
  const task = await readTask(page);
  for (const c of task.answer) await cellAt(page, c).click();
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return task;
}

/** Solve until a card is served as recall, not as a worked example. */
async function nextRecall(page: Page): Promise<Task> {
  for (let i = 0; i < 20; i++) {
    const t = await readTask(page);
    if (!t.guided) return t;
    await solve(page);
  }
  throw new Error('No recall prompt within 20 cards');
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

async function focusItem(page: Page, itemId: string): Promise<void> {
  await page.goto(`/session?item=${encodeURIComponent(itemId)}`);
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
}

test.describe('M6-04 voice-leading puzzle', () => {
  test('a worked example, then each move solved from the starting triad @smoke', async ({
    page,
  }, info) => {
    await freshStart(page);
    await masterSkills(page, ['I1.major-top-sets']);
    await focusSession(page, 'I1.voice-leading-top-sets');

    // The first card is I to IV on strings 3–1, as a worked example.
    const first = await readTask(page);
    expect(first).toMatchObject({ guided: true, low: 3 });
    expect((first.to - first.from + 12) % 12).toBe(5);
    await expect(page.getByTestId('d19-count')).toHaveText('Found 0 of 3');

    // iPad landscape shows the whole neck (design §7); portrait a 12-fret
    // neck and a phone a window, each holding the move.
    const from = Number(await neck(page).getAttribute('data-fret-from'));
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    if (info.project.name === 'ipad-portrait') expect(to - from).toBe(12);
    else if (info.project.name !== 'iphone-smoke') expect([from, to]).toEqual([0, 15]);
    for (const c of [...(await markersOf(page, 'ghost')), ...first.answer]) {
      expect(c.fret).toBeGreaterThanOrEqual(from);
      expect(c.fret).toBeLessThanOrEqual(to);
    }

    let recalled = 0;
    for (let i = 0; i < 20 && recalled < 2; i++) {
      const task = await solve(page);
      if (!task.guided) recalled++;
    }
    expect(recalled).toBe(2);
    await expectNoHorizontalOverflow(page);
  });

  test("a note of the key's V for the IV is that confusion, and the panel lists the moves", async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await masterSkills(page, ['I1.major-top-sets']);
    await focusItem(page, 'voice-lead:I-IV@s3');

    const task = await nextRecall(page);
    expect(task.low).toBe(3);
    // The rings carry no answer, and nothing marks the notes to tap (rule 4).
    await expect(neck(page).getByTestId('marker-target')).toHaveCount(0);
    await expect(page.getByTestId('d19-count')).toHaveText('Found 0 of 3');

    // V's 3rd, in neither I nor IV, one fret below the held note on string 3.
    const keyRoot = task.from;
    const leadingTone = (keyRoot + 11) % 12;
    const window = {
      from: Number(await neck(page).getAttribute('data-fret-from')),
      to: Number(await neck(page).getAttribute('data-fret-to')),
    };
    const wrong = Array.from({ length: 16 }, (_, fret) => ({ string: 3, fret })).find(
      (c) =>
        midiAt(c) % 12 === leadingTone &&
        c.fret >= window.from &&
        c.fret <= window.to &&
        !task.start.some((s) => key(s) === key(c)),
    )!;
    await cellAt(page, wrong).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('on strings 3–1');
    await expect(page.getByTestId('d19-explain')).toContainText(/a note of [A-G][♯♭]? \(V\)/);
    await expect(neck(page).getByTestId('marker-wrong')).toHaveCount(1);
    // The answer: the next chord's three notes, by degree.
    for (const c of task.answer) {
      await expect(
        neck(page).locator(`[data-string="${c.string}"][data-fret="${c.fret}"]`).first(),
      ).toBeVisible();
    }
    await expect(page.getByTestId('d19-moves').getByRole('listitem')).toHaveCount(3);
    await expect(page.getByTestId('d19-moves')).toContainText('stays');
    expect(await confusionPairs(page)).toEqual([['voice-lead:I-IV@s3', 'voice-lead:I-V@s3']]);

    // Every cell is a comfortable target on iPad (design §7: ≥ 44pt).
    const box = await cellAt(page, { string: 3, fret: 7 }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });
});
