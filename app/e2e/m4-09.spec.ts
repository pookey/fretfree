import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';

// M4-09: the progression player in Explore. Pick a progression and a key,
// read its chart as chords or numerals, use a capo, and hear it loop on the
// Tone Transport with the sounding chord marked. "Quiz me on this" starts a
// session on the progression's C9 skill (D12).

const view = (page: Page) => page.getByRole('region', { name: 'Progression player' });
const cards = (page: Page) => view(page).getByTestId('player-chord');
const playing = (page: Page) => view(page).locator('[data-testid="player-chord"][data-playing]');

/** C9.pop opens on numerals (rule 7), which open on key degrees and triads. */
const C9_PREREQUISITES = ['C4.flat-key-degrees', 'C5.triads', 'C8.numerals-major'];

async function open(page: Page, mastered: readonly string[] = []) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await tapAudioOutput(page);
  await freshStart(page, '/explore');
  if (mastered.length > 0) await masterSkills(page, mastered);
  await page
    .getByRole('navigation', { name: 'Explore views' })
    .getByRole('link', { name: 'Progression player' })
    .click();
  await expect(page).toHaveURL(/\?view=progression-player$/);
  await expect(cards(page)).toHaveCount(4);
  return errors;
}

/** Card texts, main label then the second line: `CI` is C over I. */
const chart = (page: Page) => cards(page).allInnerTexts();
const flat = (texts: string[]) => texts.map((t) => t.replace(/\s+/g, ''));

test.describe('M4-09 progression player', () => {
  test('shows a chart as chords or numerals, in any key, with a capo @layout', async ({ page }) => {
    const errors = await open(page);
    await expect(view(page).getByTestId('player-title')).toHaveText('I–V–vi–IV in C major');
    expect(flat(await chart(page))).toEqual(['CI', 'GV', 'Amvi', 'FIV']);

    await view(page).getByRole('radio', { name: 'Numerals' }).check();
    expect(flat(await chart(page))).toEqual(['IC', 'VG', 'viAm', 'IVF']);

    // Another key: the numerals stay, the chords move.
    await view(page).getByRole('combobox', { name: 'Key' }).selectOption({ label: 'D major' });
    expect(flat(await chart(page))).toEqual(['ID', 'VA', 'viBm', 'IVG']);

    // B♭ is awkward in open position; capo 3 gives G shapes.
    await view(page).getByRole('radio', { name: 'Chords' }).check();
    await view(page).getByRole('combobox', { name: 'Key' }).selectOption({ label: 'B♭ major' });
    await view(page).getByRole('button', { name: 'Capo 3: G major shapes' }).click();
    await expect(view(page).getByTestId('player-capo')).toHaveText(
      'Capo on fret 3: play G major shapes, sounding B♭ major.',
    );
    expect(flat(await chart(page))).toEqual([
      'GIsoundsB♭',
      'DVsoundsF',
      'EmvisoundsGm',
      'CIVsoundsE♭',
    ]);
    await cards(page).nth(2).click();
    await expect(view(page).getByTestId('player-neck-chord')).toHaveText(
      'Em shape, capo 3: sounds Gm',
    );
    await expect(
      view(page).getByRole('group', { name: 'Em voicing, capo on fret 3' }),
    ).toBeVisible();

    // iPad: every card is a comfortable target (design §7).
    for (const box of await cards(page).evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()),
    )) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('plays the progression on the Transport, marking each chord as it sounds', async ({
    page,
  }) => {
    const errors = await open(page);
    // The fastest tempo: a bar is 1.5 seconds.
    await view(page).getByRole('slider', { name: 'Tempo' }).fill('160');
    await expect(view(page).getByText('160 bpm')).toBeVisible();

    await view(page).getByRole('button', { name: 'Play' }).click();
    await expect(view(page).getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
      .toBeGreaterThan(0.01);
    await expect(cards(page).nth(0)).toHaveAttribute('data-playing', 'true', { timeout: 5_000 });
    await expect(cards(page).nth(1)).toHaveAttribute('data-playing', 'true', { timeout: 5_000 });
    await expect(view(page).getByTestId('player-neck-chord')).toHaveText('G');
    await expect(playing(page)).toHaveCount(1);
    // It loops: past the last bar it comes back round to the first.
    await expect(cards(page).nth(3)).toHaveAttribute('data-playing', 'true', { timeout: 8_000 });
    await expect(cards(page).nth(0)).toHaveAttribute('data-playing', 'true', { timeout: 5_000 });

    await view(page).getByRole('button', { name: 'Stop' }).click();
    await expect(view(page).getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(playing(page)).toHaveCount(0);
    await expect
      .poll(() => audioLevel(page), { timeout: 1_000, intervals: [50] })
      .toBeLessThan(0.001);
    expect(errors).toEqual([]);
  });

  test('stops the music on leaving the view', async ({ page }) => {
    const errors = await open(page);
    await view(page).getByRole('button', { name: 'Play' }).click();
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
      .toBeGreaterThan(0.01);
    await page
      .getByRole('navigation', { name: 'Explore views' })
      .getByRole('link', { name: 'Circle of fifths' })
      .click();
    await expect(page.getByRole('region', { name: 'Circle of fifths' })).toBeVisible();
    await expect
      .poll(() => audioLevel(page), { timeout: 1_000, intervals: [50] })
      .toBeLessThan(0.001);
    // Nothing comes back: the loop's next bar never strums.
    await page.waitForTimeout(3_500);
    expect(await audioLevel(page)).toBeLessThan(0.001);
    expect(errors).toEqual([]);
  });

  test('"Quiz me on this" starts a progression-builder session', async ({ page }) => {
    await open(page, C9_PREREQUISITES);
    const quiz = view(page).getByRole('link', { name: 'Quiz me on this' });
    await expect(quiz).toHaveAttribute('href', '/session?skill=C9.pop');
    await quiz.click();
    await expect(page).toHaveURL(/\/session\?skill=C9\.pop$/);
    await expect(page.getByTestId('d12-drill')).toBeVisible();
  });

  test('plays and stops on a phone @smoke @phone', async ({ page }) => {
    const errors = await open(page);
    await view(page).getByRole('button', { name: 'Play' }).click();
    await expect(cards(page).nth(0)).toHaveAttribute('data-playing', 'true', { timeout: 10_000 });
    await view(page).getByRole('button', { name: 'Stop' }).click();
    await expect(view(page).getByRole('button', { name: 'Play' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
});
