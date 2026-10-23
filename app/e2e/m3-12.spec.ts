import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { F1_SKILLS, expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// M3-12: the M3 milestone QA (design §11: C4, C5 and C6 via D7–D10, plus
// D36–D38, Explore's CAGED visualiser and chord finder, and the C4–C6 worked
// examples). A screen walk opens every M3 screen and checks it for horizontal
// overflow: the Keys, Chords and CAGED modules with their worked examples, both
// Explore views, each M3 drill's first prompt with its context panel, a D10
// answer's feedback, the summary and Progress.
//
// The walk is tagged @smoke, so it also runs against production on every
// profile (run from app/):
//   E2E_BASE_URL=https://fretfree.app pnpm e2e:only e2e/m3-12.spec.ts
// The screenshot pass is on demand: with SCREENSHOTS=1 the walk also saves each
// screen, dark and light, under --output:
//   SCREENSHOTS=1 E2E_BASE_URL=https://fretfree.app pnpm e2e:only \
//     e2e/m3-12.spec.ts --grep @screens --output <dir>

const SCREENSHOTS = Boolean(process.env.SCREENSHOTS);

/** Check the screen for overflow; with SCREENSHOTS set, save it in both themes. */
async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  await expectNoHorizontalOverflow(page);
  if (!SCREENSHOTS) return;
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({
      path: info.outputPath(`${name}-${colorScheme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.emulateMedia({ colorScheme: null });
}

/**
 * Each M3 drill, reached by focusing one of its skills once that skill's
 * prerequisites are mastered (rule 7). Mastery accumulates down the list, so
 * each step names only what it adds. The skill itself is never mastered first,
 * so its session serves new items with full guides and the context panel up.
 */
const DRILLS = [
  { name: 'd7-keys', skill: 'C4.sharp-keys', drill: 'd7-drill', adds: F1_SKILLS },
  {
    name: 'd7-chords',
    skill: 'C5.triads',
    drill: 'd7-drill',
    adds: ['C3.thirds', 'C3.fourths-fifths', 'C4.sharp-keys', 'C4.flat-keys'],
  },
  {
    name: 'd8-chord-tone',
    skill: 'C5.tones-roots',
    drill: 'd8-drill',
    adds: ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads'],
  },
  { name: 'd9-build-caged', skill: 'C6.triad-cores', drill: 'd9-drill', adds: [] },
  {
    name: 'd36-name-the-chord',
    skill: 'C5.name-triads',
    drill: 'd36-drill',
    adds: ['C5.tones-roots', 'C5.tones-thirds'],
  },
  {
    name: 'd38-build-the-chord',
    skill: 'C5.build-triads',
    drill: 'd38-drill',
    adds: ['C5.tones-fifths'],
  },
  {
    name: 'd37-chord-tones-neck',
    skill: 'C5.neck-triads',
    drill: 'd37-drill',
    adds: ['C1.every-octave'],
  },
] as const;

/** The Learn modules M3 adds, each with the skills whose worked examples it shows. */
const MODULES = [
  { module: 'keys', examples: ['C4.sharp-key-degrees'] },
  { module: 'chords', examples: ['C5.tones-roots', 'C5.tones-sevenths'] },
  { module: 'caged', examples: ['C6.triad-cores', 'C6.minor-cores'] },
] as const;

const MAJOR_SHAPES = ['C', 'A', 'G', 'E', 'D'] as const;

/**
 * File the five major CAGED shapes as due reviews, last served by D9, so a
 * C6.major-shapes session hands them to D10 (the picker moves away from the
 * last drill). The shape skill is practising at guide level 1. Reloads.
 */
async function seedShapeReviews(page: Page): Promise<void> {
  await page.evaluate(async (shapes) => {
    const DAY = 86_400_000;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['cards', 'skillStates', 'reviewLogs'], 'readwrite');
    const now = Date.now();
    for (const shape of shapes) {
      const itemId = `caged:${shape}-shape@major`;
      const skillId = 'C6.major-shapes';
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
          last_review: new Date(now - 4 * DAY),
        },
        createdAt: new Date(now - 8 * DAY),
        lastReviewedAt: new Date(now - 4 * DAY),
      });
      tx.objectStore('reviewLogs').add({
        itemId,
        skillId,
        drillType: 'build-caged',
        correct: true,
        responseMs: 2000,
        rating: 3,
        hintUsed: false,
        answerGiven: '',
        at: new Date(now - 4 * DAY),
      });
    }
    const states = tx.objectStore('skillStates');
    states.put({
      skillId: 'C6.triad-cores',
      status: 'mastered',
      guideLevel: 0,
      rollingAccuracy: 1,
    });
    states.put({
      skillId: 'C6.major-shapes',
      status: 'practising',
      guideLevel: 1,
      rollingAccuracy: 0.85,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, MAJOR_SHAPES);
  await page.reload();
}

/** Wait until the drill's view (a lazy chunk) is up, not its loading state. */
async function drillReady(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId)).toBeVisible();
  await expect(page.getByTestId('drill-loading')).toBeHidden();
}

test.describe('M3-12 screenshot pass', () => {
  test('every M3 screen renders without overflow @smoke @screens @layout', async ({
    page,
  }, info) => {
    test.slow();

    // Learn: each M3 module (locked for a new learner), and its worked examples.
    await freshStart(page);
    for (const [i, { module, examples }] of MODULES.entries()) {
      await page.goto(`/learn?module=${module}`);
      await expect(page.locator('[data-loaded="true"]')).toBeVisible();
      await expect(page.getByTestId('module-detail')).toBeVisible();
      await shoot(page, info, `0${i + 1}-learn-${module}`);
      for (const [j, skill] of examples.entries()) {
        await page
          .getByTestId(`skill-${skill}`)
          .getByRole('button', { name: 'Worked example' })
          .click();
        const example = page.getByTestId('worked-example');
        await expect(example).toHaveAttribute('data-stage', 'worked');
        // The shell scrolls inside its own container, which a full-page shot doesn't unroll.
        await example.scrollIntoViewIfNeeded();
        await shoot(page, info, `0${i + 1}${'bc'[j]}-worked-example-${skill}`);
        await page.goto(`/learn?module=${module}`);
        await expect(page.locator('[data-loaded="true"]')).toBeVisible();
      }
    }

    // Explore: the CAGED visualiser (C major's open C shape, then G's chain)
    // and the chord finder (tapped C7, then F#m7's voicings).
    await page.goto('/explore?view=caged');
    const caged = page.getByRole('region', { name: 'CAGED visualiser' });
    await expect(caged.getByTestId('caged-name')).toHaveText('C: C shape');
    await shoot(page, info, '04-explore-caged');
    await page.getByRole('combobox', { name: 'Root' }).selectOption({ label: 'G' });
    await expect(page.getByRole('list', { name: 'CAGED chain of G' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    await shoot(page, info, '04b-explore-caged-chain');

    await page.goto('/explore?view=chord-finder');
    const finder = page.getByRole('region', { name: 'Chord finder' });
    for (const cell of ['s5f3', 's4f2', 's3f3', 's2f1', 's1f0']) {
      await finder.locator(`svg[data-fret-from] [data-cell="${cell}"]`).click();
    }
    await expect(page.getByTestId('chord-name')).toHaveText('C7 (dominant seventh)');
    await shoot(page, info, '05-explore-chord-finder');
    await page.getByRole('textbox', { name: 'Chord symbol' }).fill('F#m7');
    await page.getByRole('textbox', { name: 'Chord symbol' }).press('Enter');
    const voicings = page.getByRole('list', { name: 'Voicings of F#m7' });
    await expect(voicings.getByRole('img').first()).toBeVisible();
    await voicings.scrollIntoViewIfNeeded();
    await shoot(page, info, '05b-explore-chord-voicings');

    // Each M3 drill's first prompt, with its context panel where it has one.
    for (const [i, { name, skill, drill, adds }] of DRILLS.entries()) {
      if (adds.length > 0) await masterSkills(page, adds);
      await focusSession(page, skill);
      await drillReady(page, drill);
      await shoot(page, info, `${String(i + 6).padStart(2, '0')}-session-${name}`);
    }

    // D10 serves known shapes as reviews: answer one, then end on the summary.
    await seedShapeReviews(page);
    await focusSession(page, 'C6.major-shapes');
    await drillReady(page, 'd10-drill');
    await shoot(page, info, '13-session-d10-which-shape');
    await page.getByTestId('d10-drill').getByRole('button').first().click();
    const correct = page.getByTestId('feedback-correct');
    const wrong = page.getByTestId('feedback-wrong');
    await expect(correct.or(wrong)).toBeVisible();
    await shoot(page, info, '13b-session-d10-feedback');
    if (await wrong.isVisible()) await page.getByRole('button', { name: 'Continue' }).click();
    const summary = page.getByTestId('session-summary');
    const end = page.getByRole('button', { name: 'End session' });
    await expect(end.or(summary)).toBeVisible();
    if (await end.isVisible()) await end.click();
    await expect(summary).toBeVisible();
    await shoot(page, info, '14-session-summary');

    // Progress, with the chord and CAGED skills now in its topics.
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await shoot(page, info, '15-progress');
  });
});

test.describe('M3-12 Explore load failure', () => {
  // The service worker would answer from its cache, past the aborted route.
  test.use({ serviceWorkers: 'block' });

  test("Explore's Reload button is a full tap target @smoke @layout", async ({ page }) => {
    await freshStart(page);
    await page.route(/\/caged-[^/]*\.js$/, (route) => route.abort());
    await page.goto('/explore?view=caged');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Couldn’t load CAGED visualiser');
    const reload = alert.getByRole('button', { name: 'Reload' });
    const box = (await reload.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
  });
});
