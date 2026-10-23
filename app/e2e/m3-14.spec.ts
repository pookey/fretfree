import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills, noteName } from './helpers';
import { answerKey, startChordTones, type Cell } from './helpers/chord-tones';

// M3-14: D37 "Chord tones across the neck" (user request: "highlight all
// notes in a C chord"). The prompt names a chord, or one degree of it, inside
// a CAGED shape's frets, then across the whole neck on iPad. Each tap is
// marked at once by its degree, by shape and colour; feedback rings what was
// missed and marks wrong taps.

const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`);
const prompt = (page: Page) => page.getByTestId('d37-prompt');
const count = (page: Page) => page.getByTestId('d37-count');

async function markers(page: Page, style: string): Promise<(Cell & { label: string })[]> {
  return neck(page)
    .getByTestId(`marker-${style}`)
    .evaluateAll((els) =>
      els.map((el) => ({
        string: Number(el.getAttribute('data-string')),
        fret: Number(el.getAttribute('data-fret')),
        label: el.textContent ?? '',
      })),
    );
}

/** The first cell in the asked frets that sounds `note` (sharp spelling). */
function cellOf(note: string, frets: [number, number]): Cell {
  for (let fret = frets[0]; fret <= frets[1]; fret++) {
    for (let string = 1; string <= 6; string++) {
      if (noteName(string, fret) === note) return { string, fret };
    }
  }
  throw new Error(`No ${note} in frets ${frets.join('–')}`);
}

function askedFrets(text: string): [number, number] {
  const m = /in frets (\d+)–(\d+)/.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : [0, 12];
}

/** Tap every cell of the answer key for the prompt on screen; returns it. */
async function answerRound(page: Page): Promise<Cell[]> {
  const key = answerKey(await prompt(page).innerText());
  for (const cell of key) await cellAt(page, cell).click();
  return key;
}

test.describe('M3-14 D37 chord tones across the neck', () => {
  test('taps every note of C major in a CAGED box, each marked by its degree @smoke', async ({
    page,
  }) => {
    await freshStart(page);
    await startChordTones(page, ['chord-tones:C'], 2);
    // A fresh session starts at the narrow scope: one CAGED shape's frets.
    await expect(prompt(page)).toHaveText(/^Tap every note of C major in frets \d+–\d+$/);
    const key = answerKey(await prompt(page).innerText());
    expect(key.length).toBeGreaterThanOrEqual(4);
    await expect(count(page)).toHaveText(`Found 0 of ${key.length}`);
    // Nothing on the neck gives the notes away before a tap.
    await expect(neck(page).locator('[data-testid^="marker-"]')).toHaveCount(0);

    for (const [i, cell] of key.slice(0, -1).entries()) {
      await cellAt(page, cell).click();
      await expect(count(page)).toHaveText(`Found ${i + 1} of ${key.length}`);
    }
    // Each found note shows its degree: the root a square, the 3rd a circle, the 5th a triangle.
    const byDegree = [
      ...(await markers(page, 'root')),
      ...(await markers(page, 'third')),
      ...(await markers(page, 'fifth')),
    ];
    expect(byDegree).toHaveLength(key.length - 1);
    for (const m of byDegree) {
      expect({ C: 'R', E: '3', G: '5' }[noteName(m.string, m.fret)]).toBe(m.label);
    }
    await expect(neck(page).getByTestId('marker-root').locator('rect').first()).toBeAttached();
    await expectNoHorizontalOverflow(page);

    await cellAt(page, key.at(-1)!).click();
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ C major: C E G');
  });

  test('a wrong tap ends the round: the ♭3 is C minor, and the misses are ringed', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await startChordTones(page, ['chord-tones:C'], 2);
    const text = await prompt(page).innerText();
    const frets = askedFrets(text);
    const key = answerKey(text);

    await cellAt(page, key[0]!).click();
    const eb = cellOf('D#', frets);
    await cellAt(page, eb).click();
    await expect(page.getByTestId('feedback-wrong')).toContainText('That was C major: C E G.');
    await expect(page.getByTestId('d37-explain')).toContainText(
      `You tapped E♭ (string ${eb.string}, fret ${eb.fret}): the ♭3rd, which makes C minor.`,
    );
    await expect(page.getByTestId('d37-explain')).toContainText(/shape of C major\.$/);
    expect((await markers(page, 'wrong')).map(({ string, fret }) => ({ string, fret }))).toEqual([
      eb,
    ]);
    const ghosts = await markers(page, 'ghost');
    expect(ghosts).toHaveLength(key.length - 1);
    for (const g of ghosts) {
      expect({ C: 'R', E: '3', G: '5' }[noteName(g.string, g.fret)]).toBe(g.label);
    }
    // The CAGED shape the box came from is outlined (guide level 2).
    await expect(neck(page).getByTestId('shape-outline')).toHaveCount(1);
  });

  test('a degree card asks for every 3rd, with the roots squared as a guide', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    await startChordTones(page, ['chord-tones:3@G'], 2);
    await expect(prompt(page)).toHaveText(/^Tap every 3rd of G major in frets \d+–\d+$/);
    const roots = await markers(page, 'root');
    expect(roots.length).toBeGreaterThan(0);
    for (const r of roots) expect(noteName(r.string, r.fret)).toBe('G');
    await answerRound(page);
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ B, the 3rd of G major');
  });

  test('widens to the whole neck on iPad once the boxes are fluent @layout', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    test.setTimeout(120_000);
    await freshStart(page);
    const chords = ['C', 'Cm', 'G', 'Gm', 'D', 'Dm', 'A', 'Am', 'E', 'Em', 'F', 'Fm'];
    await startChordTones(
      page,
      chords.map((c) => `chord-tones:${c}`),
      2,
    );
    // Ten correct boxes in a row (the adaptive window) widen the scope.
    let text = await prompt(page).innerText();
    for (let round = 0; round < 10; round++) {
      expect(text).toMatch(/in frets \d+–\d+$/);
      await answerRound(page);
      await expect(page.getByTestId('feedback-correct')).toBeVisible();
      await expect(prompt(page)).not.toHaveText(text);
      text = await prompt(page).innerText();
    }
    await expect(prompt(page)).toHaveText(/^Tap every note of [A-G]♯?♭? (major|minor)$/);
    // Landscape shows frets 13–15 too, dimmed and inert; portrait shows frets 0–12.
    const to = Number(await neck(page).getAttribute('data-fret-to'));
    expect(to).toBe(info.project.name === 'ipad-portrait' ? 12 : 15);
    await expect(page.getByTestId('dimmed-fret')).toHaveCount(to - 12);
    const box = (await cellAt(page, { string: 1, fret: to }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    const key = answerKey(text);
    expect(key.length).toBeGreaterThan(15);
    // Fluent rounds faded the guides, so the count no longer gives the total.
    await expect(count(page)).toHaveText('Found 0');
    for (const cell of key) await cellAt(page, cell).click();
    await expect(page.getByTestId('feedback-correct')).toBeVisible();
  });

  test('"Quiz me on this" on a chord in Explore opens D37 on that chord', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    await freshStart(page);
    // D37's first stage opens once its prerequisites are mastered.
    await masterSkills(page, ['C5.triads', 'C1.every-octave']);
    await page.goto('/explore');
    await page.getByRole('combobox', { name: 'Root' }).selectOption({ label: 'C' });
    await page.getByRole('combobox', { name: 'Show' }).selectOption({ label: 'Major' });
    const quiz = page.getByRole('link', { name: 'Quiz me on this' });
    await expect(quiz).toHaveAttribute('href', /item=chord-tones%3AC(&|$)/);
    await quiz.click();
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(prompt(page)).toContainText('of C major', { timeout: 15_000 });
  });
});
