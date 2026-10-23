import { expect, test, type Locator, type Page } from '@playwright/test';
import { freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { TARGET_MARKERS } from './helpers/targets';

// M6-11: worked examples keep each note's degree shape and label what to tap
// (M6 QA findings 1 and 2; design §8 "shape as well as colour", rules 8 and
// 10). The ring a target carries sits on top of its degree's marker (the
// root square, the 5th triangle), never in place of it; every target is
// labelled; and the prompt says how many to tap, matching the count.

interface Mark {
  string: number;
  fret: number;
  style: string;
  label: string;
  ringed: boolean;
}

const neck = (page: Page) => page.locator('svg[data-fret-from]');

async function marksOf(markers: Locator): Promise<Mark[]> {
  const out: Mark[] = [];
  for (const m of await markers.all()) {
    out.push({
      string: Number(await m.getAttribute('data-string')),
      fret: Number(await m.getAttribute('data-fret')),
      style: (await m.getAttribute('data-testid'))!.replace(/^marker-/, ''),
      label: ((await m.textContent()) ?? '').trim(),
      ringed: (await m.getAttribute('data-emphasis')) === 'true',
    });
  }
  return out;
}

const allMarks = (page: Page) => marksOf(neck(page).locator('[data-testid^="marker-"]'));
const targets = (page: Page) => marksOf(neck(page).locator(TARGET_MARKERS));

/** Tap every target cell; the worked example then answers correct. */
async function tapAll(page: Page, cells: readonly Mark[]): Promise<void> {
  for (const c of cells) {
    await neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`).click();
  }
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
}

/** The count in "Tap the 6 ringed notes", which the prompt must state. */
async function askedCount(prompt: Locator): Promise<number> {
  const text = await prompt.innerText();
  const m = /Tap the (\d+) ringed/.exec(text);
  expect(m, text).not.toBeNull();
  return Number(m![1]);
}

const DEGREE_LABEL = /^(R|♭?\d)$/;

test.describe('M6-11 degree shapes and labelled targets in worked examples', () => {
  test('D8 draws its worked example by degree shape, as the legend does', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['C5.tones-sevenths', 'C6.dominant7-shapes', 'C7.minor-boxes']);
    await focusSession(page, 'I2.sevenths-roots');
    await expect(page.getByTestId('d8-prompt')).toContainText(/are marked|is marked/);

    const marks = await allMarks(page);
    expect(marks.length).toBeGreaterThanOrEqual(4);
    // Every note in its degree's shape and labelled by degree: no plain dots, no letters.
    for (const m of marks) {
      expect(['root', 'third', 'fifth', 'seventh']).toContain(m.style);
      expect(m.label).toMatch(DEGREE_LABEL);
    }
    expect(marks.some((m) => m.style === 'seventh' && m.label === '♭7')).toBe(true);
    // The roots to tap are ringed root squares.
    const ringed = await targets(page);
    expect(ringed.length).toBeGreaterThan(0);
    expect(ringed.every((m) => m.style === 'root' && m.label === 'R' && m.ringed)).toBe(true);
    await tapAll(page, ringed.slice(0, 1));
  });

  test('D18 keeps the 5th a triangle before it is tapped @smoke', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['C6.triad-cores']);
    await focusSession(page, 'I1.major-top-sets');
    const prompt = page.getByTestId('d18-prompt');
    await expect(prompt).toContainText('This is');

    const n = await askedCount(prompt);
    const ringed = await targets(page);
    expect(ringed).toHaveLength(n);
    await expect(page.getByTestId('d18-count')).toHaveText(`Found 0 of ${n}`);
    expect(ringed.map((m) => m.style).sort()).toEqual(['fifth', 'third']);
    expect(ringed.find((m) => m.style === 'fifth')).toMatchObject({ label: '5', ringed: true });
    expect(ringed.find((m) => m.style === 'third')?.label).toMatch(/^♭?3$/);
    await tapAll(page, ringed);
  });

  test("D19 names each target, the next chord's root a square", async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['I1.major-top-sets']);
    await focusSession(page, 'I1.voice-leading-top-sets');
    const prompt = page.getByTestId('d19-prompt');
    const m = /^This is \S+ to (\S+) on strings/.exec(await prompt.innerText());
    expect(m).not.toBeNull();
    const to = m![1]!;

    const n = await askedCount(prompt);
    expect(n).toBe(3);
    await expect(prompt).toContainText(`ringed notes of ${to}`);
    const ringed = await targets(page);
    expect(ringed).toHaveLength(n);
    await expect(page.getByTestId('d19-count')).toHaveText(`Found 0 of ${n}`);
    expect(ringed.every((t) => t.ringed && /^[A-G][♯♭]?$/.test(t.label))).toBe(true);
    expect(ringed.map((t) => t.style).sort()).toEqual(['fifth', 'root', 'third']);
    expect(ringed.find((t) => t.style === 'root')?.label).toBe(to);
    await tapAll(page, ringed);
  });

  test("C7's box worked example labels every target and counts them", async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, ['C6.minor-cores', 'C6.minor-shapes']);
    await focusSession(page, 'C7.minor-boxes');
    const prompt = page.getByTestId('dpb-prompt');
    await expect(prompt).toContainText('pentatonic box 1');

    const n = await askedCount(prompt);
    const ringed = await targets(page);
    expect(ringed).toHaveLength(n);
    await expect(page.getByTestId('dpb-count')).toHaveText(`Found 0 of ${n}`);
    // Each labelled and ringed; a chord tone keeps its shape under the ring.
    for (const t of ringed) {
      expect(t.label).not.toBe('');
      expect(t.ringed).toBe(true);
      expect(['root', 'third', 'fifth', 'tone']).toContain(t.style);
    }
    expect(ringed.some((t) => t.style !== 'tone')).toBe(true);
    await tapAll(page, ringed);
  });

  test('the relative-minor worked example labels each root it asks for', async ({ page }) => {
    await freshStart(page);
    await masterSkills(page, [
      'C6.minor-cores',
      'C6.minor-shapes',
      'C7.minor-boxes',
      'C7.major-boxes',
    ]);
    await focusSession(page, 'C7.relative');
    const prompt = page.getByTestId('dpb-prompt');
    const m = /root is ([A-G][♯♭]?)\./.exec(await prompt.innerText());
    expect(m).not.toBeNull();
    const rel = m![1]!;

    const n = await askedCount(prompt);
    await expect(prompt).toContainText(`Tap the ${n} ringed ${rel} notes to continue.`);
    const ringed = await targets(page);
    expect(ringed).toHaveLength(n);
    expect(ringed.every((t) => t.label === rel)).toBe(true);
    await expect(page.getByTestId('dpb-count')).toHaveText(`Found 0 of ${n}`);
    await tapAll(page, ringed);
  });

  test("I7's worked example names the 4ths and 7ths to tap, the box in its shapes", async ({
    page,
  }) => {
    await freshStart(page);
    await masterSkills(page, ['C7.major-boxes']);
    await focusSession(page, 'I7.positions');
    const prompt = page.getByTestId('dpb-prompt');
    await expect(prompt).toContainText('position 1');

    const n = await askedCount(prompt);
    const ringed = await targets(page);
    expect(ringed).toHaveLength(n);
    await expect(page.getByTestId('dpb-count')).toHaveText(`Found 0 of ${n}`);
    expect(new Set(ringed.map((t) => t.label))).toEqual(new Set(['4', '7']));
    const explain = page.getByTestId('dpb-explain');
    await expect(explain).toContainText(
      /^The squares are the roots, [A-G][♯♭]?\. The ringed notes are the 4ths \([A-G][♯♭]?\) and 7ths \([A-G][♯♭]?\)\.$/,
    );
    await expect(explain).not.toContainText('the dots are');
    // The given box draws its 3rds and 5ths in their shapes, as C7 does.
    const marks = await allMarks(page);
    expect(marks.some((m) => m.style === 'third' && m.label === '3')).toBe(true);
    expect(marks.some((m) => m.style === 'fifth' && m.label === '5')).toBe(true);
    await tapAll(page, ringed);
  });
});
