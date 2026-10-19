import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';

// M3-09: the chord finder in Explore. Tapping notes on the neck names the
// chord (tonal's Chord.detect), shaping each note by its degree. Typing a
// symbol shows its voicings from chords-db, which can be played or put on
// the neck. "Quiz me on this" opens spelling the chord (C5) once it is open.

/** Rule 7: intervals and keys open C5 triad spelling. */
const C5_TRIAD_PREREQS = ['C3.thirds', 'C3.fourths-fifths', 'C4.sharp-keys', 'C4.flat-keys'];

const view = (page: Page) => page.getByRole('region', { name: 'Chord finder' });
const neck = (page: Page) => view(page).locator('svg[data-fret-from]');
const named = (page: Page) => page.getByTestId('chord-name');
const voicings = (page: Page) => page.getByRole('list', { name: /^Voicings of / });

/** Tap `s<string>f<fret>` cells on the neck. */
async function tap(page: Page, ...cells: string[]) {
  for (const c of cells) await neck(page).locator(`[data-cell="${c}"]`).click();
}

/** The cells of one marker style on the neck, as `s<string>f<fret>`. */
async function cellsOf(page: Page, style: string): Promise<string[]> {
  const ms = neck(page).getByTestId(`marker-${style}`);
  const out = await ms.evaluateAll((els) =>
    els.map((e) => `s${e.getAttribute('data-string')}f${e.getAttribute('data-fret')}`),
  );
  return out.sort();
}

async function showVoicings(page: Page, symbol: string) {
  await page.getByRole('textbox', { name: 'Chord symbol' }).fill(symbol);
  await page.getByRole('textbox', { name: 'Chord symbol' }).press('Enter');
}

test.describe('M3-09 chord finder', () => {
  test('tapped notes are named and shaped by degree', async ({ page }) => {
    await freshStart(page, '/explore');
    await page
      .getByRole('navigation', { name: 'Explore views' })
      .getByRole('link', { name: 'Chord finder' })
      .click();
    await expect(page).toHaveURL(/\?view=chord-finder$/);
    await expect(named(page)).toContainText('Tap at least two notes');

    // Open C, x32010. An independent answer key: C on 5/3 and 2/1, E on 4/2
    // and 1/0, G on 3/0.
    await tap(page, 's5f3', 's4f2', 's3f0', 's2f1', 's1f0');
    await expect(named(page)).toHaveText('C (major)');
    expect(await cellsOf(page, 'root')).toEqual(['s2f1', 's5f3']);
    expect(await cellsOf(page, 'third')).toEqual(['s1f0', 's4f2']);
    expect(await cellsOf(page, 'fifth')).toEqual(['s3f0']);
    await expect(page.getByTestId('chord-notes')).toHaveText(/C R\s*E 3\s*G 5\s*C R\s*E 3/);

    // Bb on string 3 makes it C7; lifting the top E keeps it C7.
    await tap(page, 's3f3');
    await expect(named(page)).toHaveText('C7 (dominant seventh)');
    expect(await cellsOf(page, 'seventh')).toEqual(['s3f3']);
    await tap(page, 's1f0');
    await expect(named(page)).toHaveText('C7 (dominant seventh)');
    await expect(neck(page).locator('[data-testid^="marker-"]')).toHaveCount(4);

    // A E G C, bass first: Am7, also C6/A.
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(neck(page).locator('[data-testid^="marker-"]')).toHaveCount(0);
    await tap(page, 's5f0', 's4f2', 's3f0', 's2f1');
    await expect(named(page)).toHaveText('Am7 (minor seventh)');
    await expect(page.getByTestId('chord-alternatives')).toHaveText('Also read as C6/A');

    // iPad keeps neck cells at 44pt or more (design §7).
    const sizes = await neck(page)
      .locator('[data-cell^="s6f"]')
      .evaluateAll((cells) => cells.map((c) => c.getBoundingClientRect()));
    expect(sizes.length).toBeGreaterThan(0);
    for (const r of sizes) {
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
  });

  test('a typed chord shows its voicings, which go on the neck', async ({ page }) => {
    await freshStart(page, '/explore?view=chord-finder');
    await expect(voicings(page)).toHaveAccessibleName('Voicings of C');

    await showVoicings(page, 'f#m7');
    await expect(voicings(page)).toHaveAccessibleName('Voicings of F#m7');
    await expect(page.getByTestId('voicings-status')).toContainText(/F#m7: \d voicings/);
    const diagrams = voicings(page).getByRole('img');
    expect(await diagrams.count()).toBeGreaterThanOrEqual(3);
    // F#m7 is F# A C# E: every diagram, read by degree, names only those.
    await page.getByRole('radio', { name: 'Degrees' }).check({ force: true });
    for (const name of await diagrams.evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label') ?? ''),
    )) {
      const labels = [...name.matchAll(/labelled (\S+?)(?:,|$)/g)].map((m) => m[1]);
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) expect(['R', 'b3', '5', 'b7']).toContain(l);
    }

    // The first shape on the neck is named back as the same chord.
    await voicings(page)
      .getByRole('button', { name: /^Show F#m7, .*, on the neck$/ })
      .first()
      .click();
    await expect(named(page)).toHaveText('F#m7 (minor seventh)');

    // A tapped chord opens its own voicings.
    await page.getByRole('button', { name: 'Voicings of F#m7' }).click();
    await expect(page.getByRole('textbox', { name: 'Chord symbol' })).toHaveValue('F#m7');

    // Slash chords and nonsense.
    await showVoicings(page, 'C/E');
    await expect(voicings(page)).toHaveAccessibleName('Voicings of C/E');
    await showVoicings(page, 'Q7');
    await expect(page.getByTestId('voicings-status')).toContainText('isn’t a chord symbol');
    await expect(voicings(page)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'chords-db' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('"Quiz me on this" spells the chord once it is open', async ({ page }) => {
    await freshStart(page, '/explore?view=chord-finder');
    // A fresh learner is walked back to the open steps towards chords (rule 7).
    const quiz = page.getByRole('link', { name: 'Quiz me on this' });
    await expect(quiz).toHaveAttribute('href', /skill=F2\.string6-naturals/);
    await expect(quiz).not.toHaveAttribute('href', /C5\./);

    await masterSkills(page, C5_TRIAD_PREREQS);
    await expect(quiz).toHaveAttribute('href', '/session?item=spell-chord%3Amajor%40C');
    await quiz.click();
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByTestId('d7-drill')).toBeVisible();
    await expect(page.getByTestId('d7-subject')).toContainText('C');
  });

  test('the chord finder on a phone @smoke', async ({ page }) => {
    await freshStart(page, '/explore?view=chord-finder');
    await tap(page, 's5f0', 's4f2', 's3f2', 's2f1', 's1f0');
    await expect(named(page)).toHaveText('Am (minor)');
    await showVoicings(page, 'G');
    await expect(voicings(page)).toHaveAccessibleName('Voicings of G');
    await expect(voicings(page).getByRole('img').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quiz me on this' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
