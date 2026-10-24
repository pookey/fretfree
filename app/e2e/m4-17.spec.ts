import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M4-17: the M4 QA's copy and picture fixes (M4-11 findings 2, 5, 7 and 9).
// D14 names the chords a wrong progression has or lacks, and leaves what it
// sounds like to the panel beside it; D13 shades the dead frets behind the
// capo, as the progression player does; the player's legend matches its neck
// in both themes; and a locked module names each prerequisite once.

// An independent answer key (deliberately not imported from app code).
const PROGRESSIONS: Record<string, string> = {
  'I-IV-V': 'I–IV–V',
  'I-V-vi-IV': 'I–V–vi–IV',
  'vi-IV-I-V': 'vi–IV–I–V',
  'I-vi-IV-V': 'I–vi–IV–V',
};

const d14 = (page: Page) => page.getByTestId('d14-drill');

test.describe('M4-17 M4 QA fixes', () => {
  test('D14 says which chords a wrong progression has or lacks @smoke @layout', async ({
    page,
  }, info) => {
    await freshStart(page);
    await masterSkills(page, ['C9.pop']);
    await focusSession(page, 'I6.progressions-pop');
    await expect(d14(page)).toBeVisible();

    const id = (await d14(page).getAttribute('data-item')) as string;
    const right = PROGRESSIONS[/^prog:(.+):ear$/.exec(id)![1]!]!;
    // I–IV–V lacks the vi chord the other three share; they have it.
    const wrong = right === 'I–IV–V' ? 'I–V–vi–IV' : 'I–IV–V';
    await d14(page).getByRole('group').getByRole('button', { name: wrong, exact: true }).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();

    const feedback = page.getByTestId('d14-feedback');
    await expect(feedback).not.toContainText('has different chords');
    await expect(feedback).toContainText(
      right === 'I–IV–V'
        ? /^I–V–vi–IV uses .+\. This one has no [A-G][♯♭]?m\./
        : /^I–IV–V uses .+\. This one also has [A-G][♯♭]?m\./,
    );
    if (info.project.name === 'iphone-smoke') {
      // A phone's panel is a closed sheet, so the feedback keeps the description.
      await expect(feedback).toContainText(/(major|minor)\. \S/);
    } else {
      // The panel beside it describes each progression, so the feedback doesn't.
      await expect(page.getByTestId('context-panel')).toBeVisible();
      await expect(feedback.locator('p')).toHaveText(new RegExp(`in [A-G][♯♭]? (major|minor)\\.$`));
    }
    await expectNoHorizontalOverflow(page);
  });

  test('D13 shades the frets behind the capo, and its panel says each thing once @layout', async ({
    page,
  }) => {
    await freshStart(page);
    await masterSkills(page, ['C4.sharp-keys', 'C5.triads']);
    await focusSession(page, 'C10.capo-g-c-d');
    const drill = page.getByTestId('d13-drill');
    await expect(drill).toBeVisible();
    const capo = Number(await drill.getAttribute('data-capo'));
    // The rng picks the capo; at fret 1 only the open strings are behind it.
    expect(capo).toBeGreaterThanOrEqual(1);

    const cells = page.getByTestId('d13-neck').getByRole('listitem');
    const shaded = await cells.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).backgroundImage !== 'none'),
    );
    // The open strings up to the fret below the capo are dead; from the capo on they ring.
    expect(shaded).toEqual(shaded.map((_, fret) => fret < capo));

    const panel = page.getByTestId('context-panel');
    await expect(panel).toContainText('raises every shape');
    await expect(panel).not.toContainText('count up one half step per fret');
  });

  test('the progression player’s legend matches its neck in both themes', async ({ page }) => {
    await freshStart(page, '/explore?view=progression-player');
    const view = page.getByRole('region', { name: 'Progression player' });
    await view.getByRole('combobox', { name: 'Key' }).selectOption({ label: 'B♭ major' });
    await view.getByRole('button', { name: 'Capo 3: G major shapes' }).click();
    await expect(view.getByRole('group', { name: 'G voicing, capo on fret 3' })).toBeVisible();

    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme });
      const fills = await page.evaluate(() => {
        const fill = (sel: string) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).fill : null;
        };
        return {
          legendRoot: fill('[aria-label="Legend"] svg[data-style="root"]'),
          neckRoot: fill('[data-testid="marker-root"] rect'),
          legendThird: fill('[aria-label="Legend"] svg[data-style="third"]'),
          neckThird: fill('[data-testid="marker-third"] circle'),
        };
      });
      expect(fills.neckRoot, colorScheme).not.toBeNull();
      expect(fills.legendRoot, colorScheme).toBe(fills.neckRoot);
      expect(fills.neckThird, colorScheme).not.toBeNull();
      expect(fills.legendThird, colorScheme).toBe(fills.neckThird);
    }
    await page.emulateMedia({ colorScheme: null });
  });

  test('a locked module names each prerequisite once', async ({ page }) => {
    await freshStart(page, '/learn?module=progressions');
    await expect(page.getByTestId('module-detail')).toBeVisible();
    const offer = page.getByRole('region', { name: 'Already know this?' });
    const paragraph = offer.getByText(/^Progressions opens once/);
    await expect(paragraph).toBeVisible();
    // The gate sentence only: the offer then lists what the test covers.
    const text = (await paragraph.innerText()).split(' Already there?')[0]!;
    // Its nearest first skill, capo keys, needs only practising (M10-21).
    expect(text).toMatch(/^Progressions opens once you’re practising .+ and .+\.$/);
    expect(text.match(/Spell major and minor triads/g)).toHaveLength(1);
  });
});
