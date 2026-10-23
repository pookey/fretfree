import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';

// M3-08: the CAGED visualiser in Explore. Picking a chord plays its five
// shapes up the neck, each with its triad core in the chord-tone styles and
// the rest of the shape as dashed guide notes. Reduced motion never plays;
// the learner steps the chain by hand. "Quiz me on this" opens a focused
// session on the shapes, or on the nearest open steps towards them.

/** Rule 7: natural notes on strings 6 and 5, and triads (C5), open CAGED. */
const PREREQS = ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads'];

/** How long each shape stays up while the chain plays (`STEP_MS`). */
const STEP = 1800;

const view = (page: Page) => page.getByRole('region', { name: 'CAGED visualiser' });
const neck = (page: Page) => view(page).locator('svg[data-fret-from]');
const shown = (page: Page) => page.getByTestId('caged-name');

/** The cells of one marker style on the neck, as `s<string>f<fret>`. */
async function cellsOf(page: Page, style: string): Promise<string[]> {
  const ms = neck(page).getByTestId(`marker-${style}`);
  const out = await ms.evaluateAll((els) =>
    els.map((e) => `s${e.getAttribute('data-string')}f${e.getAttribute('data-fret')}`),
  );
  return out.sort();
}

test.describe('M3-08 CAGED visualiser', () => {
  test('a chord plays its chain of five shapes, triad cores highlighted @layout', async ({
    page,
  }) => {
    await page.clock.install();
    await freshStart(page, '/explore');
    await page
      .getByRole('navigation', { name: 'Explore views' })
      .getByRole('link', { name: 'CAGED visualiser' })
      .click();
    await expect(page).toHaveURL(/\?view=caged$/);

    // The open C shape of C major. An independent answer key: its core is the
    // G–C–E triad on strings 3–1, the rest the C and E on strings 5 and 4.
    await expect(shown(page)).toHaveText('C: C shape');
    expect(await cellsOf(page, 'root')).toEqual(['s2f1']);
    expect(await cellsOf(page, 'third')).toEqual(['s1f0']);
    expect(await cellsOf(page, 'fifth')).toEqual(['s3f0']);
    expect(await cellsOf(page, 'ghost')).toEqual(['s4f2', 's5f3']);
    await expect(neck(page).getByTestId('dimmed-fret').first()).toBeAttached();

    // Picking G plays G → E → D → C → A up the neck, then stops on A.
    await page.getByRole('combobox', { name: 'Root' }).selectOption({ label: 'G' });
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    const chain = page.getByRole('list', { name: 'CAGED chain of G' });
    await expect(chain.getByRole('button')).toHaveText([
      /^G shape\s*frets 0–3$/,
      /^E shape\s*frets 3–5$/,
      /^D shape\s*frets 5–8$/,
      /^C shape\s*frets 7–10$/,
      /^A shape\s*frets 10–12$/,
      /^Whole chain/,
    ]);
    for (const s of ['G', 'E', 'D', 'C', 'A']) {
      await expect(shown(page)).toHaveText(`G: ${s} shape`);
      await expect(chain.getByTestId(`chain-${s}`)).toHaveAttribute('aria-pressed', 'true');
      // Every shape shows a three-note core: one root, one 3rd, one 5th.
      await expect(neck(page).getByTestId('marker-root')).toHaveCount(1);
      await expect(neck(page).getByTestId('marker-third')).toHaveCount(1);
      await expect(neck(page).getByTestId('marker-fifth')).toHaveCount(1);
      await page.clock.runFor(STEP);
    }
    await expect(shown(page)).toHaveText('G: A shape');
    await expect(page.getByRole('button', { name: 'Play the chain' })).toBeVisible();

    // The whole chain, then a dominant 7 with its b7 as a hexagon.
    await page.getByRole('button', { name: /Whole chain/ }).click();
    await expect(shown(page)).toHaveText('G: the whole chain');
    await expect(neck(page).getByTestId('dimmed-fret')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Chord' }).selectOption({ label: 'Dominant 7' });
    await expect(shown(page)).toHaveText('G7: G shape');
    await expect(neck(page).getByTestId('marker-seventh')).toHaveCount(1);
    await expect(page.getByTestId('caged-legend')).toContainText('b7');

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

  test('reduced motion never plays the chain; the learner steps it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await freshStart(page, '/explore?view=caged');
    await expect(page.getByRole('button', { name: 'Play the chain' })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Chord' }).selectOption({ label: 'Minor' });
    await expect(shown(page)).toHaveText('Cm: C shape');
    await page.waitForTimeout(STEP + 400);
    await expect(shown(page)).toHaveText('Cm: C shape');

    await page.getByTestId('chain-E').click();
    await expect(shown(page)).toHaveText('Cm: E shape');
    await expect(page.getByTestId('caged-detail')).toHaveText(
      'Root on string 6, frets 8–10. Triad core on strings 3–1. Next up the neck: the D shape.',
    );
    // Cm E shape at fret 8: its core is Eb–G–C on strings 3–1.
    await page.getByRole('radio', { name: 'Note names' }).check({ force: true });
    await expect(neck(page).getByTestId('marker-root')).toHaveText('C');
    await expect(neck(page).getByTestId('marker-third')).toHaveText('E♭');
    await expect(neck(page).getByTestId('marker-fifth')).toHaveText('G');
  });

  test('"Quiz me on this" opens the shapes once they are open', async ({ page }) => {
    await freshStart(page, '/explore?view=caged');
    // A fresh learner is walked back to the open steps towards CAGED (rule 7).
    const quiz = page.getByRole('link', { name: 'Quiz me on this' });
    await expect(quiz).toHaveAttribute('href', /skill=F2\.string6-naturals/);
    await expect(quiz).not.toHaveAttribute('href', /C6\./);

    await masterSkills(page, PREREQS);
    await expect(quiz).toHaveAttribute('href', '/session?skill=C6.triad-cores');
    await quiz.click();
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByTestId('d9-drill')).toBeVisible();
    await expect(page.getByTestId('d9-prompt')).toContainText(/shape/);
  });

  test('the visualiser on a phone @smoke @phone', async ({ page }) => {
    await page.clock.install();
    await freshStart(page, '/explore?view=caged');
    await expect(shown(page)).toHaveText('C: C shape');
    await page.getByRole('combobox', { name: 'Root' }).selectOption({ label: 'A' });
    await expect(shown(page)).toHaveText('A: A shape');
    await page.clock.runFor(STEP);
    await expect(shown(page)).toHaveText('A: G shape');
    await page.getByTestId('chain-D').click();
    await expect(shown(page)).toHaveText('A: D shape');
    await expect(page.getByRole('link', { name: 'Quiz me on this' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
