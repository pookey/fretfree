import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';
import { readVisualise, solveVisualise, visualiseDrill } from './helpers/visualise';

// M6-10: the M6 milestone QA (design §11: C7, I1, I2, I4, I5, I7, D18–D21 and
// the rhythm track). A screen walk opens every M6 screen and checks it for
// horizontal overflow: the six Learn modules M6 fills, each M6 drill's first
// prompt (a new skill's worked example, with its context panel), feedback
// from the choice drill, D20 and D21, then the summary and Progress.
//
// The walk is tagged @smoke, so it also runs against production on every
// profile (run from app/):
//   E2E_BASE_URL=https://fretfree.app pnpm e2e:only e2e/m6-10.spec.ts
// The screenshot pass is on demand: with SCREENSHOTS=1 the walk also saves each
// screen, dark and light, under --output:
//   SCREENSHOTS=1 E2E_BASE_URL=https://fretfree.app pnpm e2e:only \
//     e2e/m6-10.spec.ts --grep @screens --output <dir>

const SCREENSHOTS = Boolean(process.env.SCREENSHOTS);
const FAKE_ONSETS_KEY = 'fretwork.e2e.fakeOnsets';

type HookWindow = Window & { fretworkFakeOnsets?: { echo: number | null } };

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

/** The Learn modules M6 fills. */
const MODULES = [
  'pentatonic',
  'triads',
  'arpeggios',
  'minor-function',
  'scales',
  'rhythm',
] as const;

/**
 * Each M6 drill, reached by focusing one of its skills once that skill's
 * prerequisites are mastered (rule 7). Mastery accumulates down the list, so
 * each step names only what it adds. The skill itself is never mastered first,
 * so its session serves new items with full guides and the context panel up.
 */
const DRILLS = [
  { name: 'c7-minor-box', skill: 'C7.minor-boxes', drill: 'dpb-drill', adds: ['C6.minor-shapes'] },
  {
    name: 'c7-relative',
    skill: 'C7.relative',
    drill: 'dpb-drill',
    adds: ['C7.minor-boxes', 'C7.major-boxes'],
  },
  { name: 'i7-positions', skill: 'I7.positions', drill: 'dpb-drill', adds: [] },
  {
    name: 'd18-inversions',
    skill: 'I1.major-top-sets',
    drill: 'd18-drill',
    adds: ['C6.triad-cores'],
  },
  {
    name: 'd19-voice-leading',
    skill: 'I1.voice-leading-top-sets',
    drill: 'd19-drill',
    adds: ['I1.major-top-sets'],
  },
  {
    name: 'i2-arpeggio-d8',
    skill: 'I2.sevenths-roots',
    drill: 'd8-drill',
    adds: ['C5.tones-sevenths', 'C6.dominant7-shapes'],
  },
  {
    name: 'i5-function',
    skill: 'I5.function-major',
    drill: 'df-drill',
    adds: ['C9.pop'],
  },
] as const;

const MAJOR_SHAPES = ['C', 'A', 'G', 'E', 'D'] as const;

/**
 * File the five major CAGED shapes as due reviews, last served by D10, so a
 * C6.major-shapes session hands them to D21 (the next in C6's list). The shape
 * skill is practising at guide level 1. Reloads.
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
        drillType: 'which-shape',
        correct: true,
        responseMs: 2000,
        rating: 3,
        hintUsed: false,
        answerGiven: '',
        at: new Date(now - 4 * DAY),
      });
    }
    tx.objectStore('skillStates').put({
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

/**
 * Answer a guided function-drill card wrongly: with the minor chord on the
 * answer's root (the natural v for the harmonic V) when it is offered, or
 * else with any other choice. The worked example names its answer as shown
 * on its button ("Tap E to continue.").
 */
async function answerWrongly(page: Page): Promise<void> {
  const group = page.getByTestId('df-drill').getByRole('group');
  const choices = group.getByRole('button');
  const text = await page.locator('#drill-prompt').innerText();
  const shown = /Tap (.+) to continue\./.exec(text)?.[1];
  expect(shown, text).toBeDefined();
  const labels = await choices.evaluateAll((els) =>
    els.map((e) => ({ text: e.textContent?.trim() ?? '', label: e.getAttribute('aria-label') })),
  );
  const answer = labels.find((l) => l.text === shown);
  const root = answer?.label?.split(' ')[0];
  const natural = labels.find((l) => l.label === `${root} minor`);
  const wrong = natural ?? labels.find((l) => l.text !== shown);
  await group.getByRole('button', { name: wrong!.label ?? wrong!.text, exact: true }).click();
}

/** End the session from wherever it is, and wait for the summary. */
async function endSession(page: Page): Promise<void> {
  const summary = page.getByTestId('session-summary');
  const end = page.getByRole('button', { name: 'End session' });
  await expect(end.or(summary)).toBeVisible();
  if (await end.isVisible()) await end.click();
  await expect(summary).toBeVisible();
}

test.describe('M6-10 screenshot pass', () => {
  test('every M6 screen renders without overflow @smoke @screens', async ({ page }, info) => {
    test.setTimeout(240_000);
    // D20's hits come from the e2e onset fake (timing/e2e-hook.ts).
    await page.addInitScript((key) => localStorage.setItem(key, '1'), FAKE_ONSETS_KEY);

    // Learn: each module M6 fills, locked or open for a new learner.
    await freshStart(page);
    for (const [i, module] of MODULES.entries()) {
      await page.goto(`/learn?module=${module}`);
      await expect(page.locator('[data-loaded="true"]')).toBeVisible();
      await expect(page.getByTestId('module-detail')).toBeVisible();
      await shoot(page, info, `0${i + 1}-learn-${module}`);
    }

    // Each M6 drill's first prompt, with its context panel.
    for (const [i, { name, skill, drill, adds }] of DRILLS.entries()) {
      if (adds.length > 0) await masterSkills(page, adds);
      await focusSession(page, skill);
      await drillReady(page, drill);
      await shoot(page, info, `${String(i + 10)}-session-${name}`);
    }

    // The harmonic-minor V (I4) in the choice drill, answered with the natural
    // v beside it: its feedback.
    await masterSkills(page, ['C9.minor', 'I4.minor-numerals']);
    await focusSession(page, 'I4.harmonic-minor');
    await drillReady(page, 'df-drill');
    await shoot(page, info, '20-session-i4-harmonic-minor');
    await answerWrongly(page);
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await shoot(page, info, '20b-session-i4-feedback');

    // D20: the eighth-notes rhythm, played 90 ms late, and its marks.
    await masterSkills(page, ['F4.pulse']);
    await focusSession(page, 'F4.eighths');
    await drillReady(page, 'd20-prompt');
    await shoot(page, info, '21-session-d20-rhythm');
    await page.getByTestId('session').getByRole('button', { name: 'Start' }).click();
    await page.waitForFunction(() => Boolean((window as HookWindow).fretworkFakeOnsets));
    await page.evaluate(() => {
      (window as HookWindow).fretworkFakeOnsets!.echo = 90;
    });
    await expect(page.getByTestId('feedback-wrong')).toBeVisible({ timeout: 30_000 });
    await shoot(page, info, '21b-session-d20-feedback');

    // D21: a whole shape pictured on a blank neck, then a tap outside it.
    await masterSkills(page, ['F2.string6-naturals', 'F2.string5-naturals', 'C5.triads']);
    await seedShapeReviews(page);
    await focusSession(page, 'C6.major-shapes');
    const task = await readVisualise(page);
    await shoot(page, info, '22-session-d21-visualise');
    const [root] = solveVisualise(task);
    const neck = visualiseDrill(page).locator('svg[data-fret-from]');
    await neck.locator(`[data-cell="s${root!.string}f${root!.fret}"]`).click();
    // No major shape has a note on string 1 a fret above its lowest fret.
    await neck.locator(`[data-cell="s1f${task.position + 1}"]`).click();
    await expect(page.getByTestId('feedback-wrong')).toBeVisible();
    await shoot(page, info, '22b-session-d21-feedback');
    await page.getByRole('button', { name: 'Continue' }).click();
    await endSession(page);
    await shoot(page, info, '23-session-summary');

    // Progress, with the M6 skills now in its topics.
    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await shoot(page, info, '24-progress');
  });
});
