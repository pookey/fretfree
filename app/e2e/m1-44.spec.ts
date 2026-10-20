import { expect, test, type Page } from '@playwright/test';
import { freshStart, masterSkills } from './helpers';
import { focusSession } from './helpers/focus';

// First-load JS is one chunk (design §10 budget, M1-44), and the build splits
// theory modules per declaration, so theory code only lazy views and drill
// logic use loads with them. These flows run that split code: a missing piece
// or a broken import between pieces fails at chunk load, as a page error or
// the screen's error boundary.

/** Records uncaught page errors, from now on. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/**
 * First-load scripts: the entry and modulepreload tags of the served
 * index.html. (Once the app runs, Vite adds preload tags for lazy chunks.)
 */
async function firstLoadScripts(page: Page): Promise<string[]> {
  const html = await (await page.request.get('/')).text();
  return [
    ...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g),
    ...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g),
  ].map((m) => m[1]!);
}

/** A focused session on `skillId` that served a prompt, with no error. */
async function expectPrompt(page: Page, skillId: string): Promise<void> {
  await focusSession(page, skillId);
  await expect(page.locator('[data-drill]')).toHaveAttribute('data-drill', /.+/);
  await expect(page.locator('[data-drill]').getByRole('button').first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
}

test.describe('M1-44 first-load JS headroom', () => {
  test('a cold start loads one app chunk, and a session runs on lazy theory @smoke', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await freshStart(page);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    // The entry chunk plus Rolldown's runtime (scripts/check-bundle.mjs).
    const scripts = await firstLoadScripts(page);
    expect(scripts.filter((s) => !/\/rolldown-runtime-[^/]+\.js$/.test(s))).toHaveLength(1);

    await expectPrompt(page, 'F2.string6-naturals');
    expect(errors).toEqual([]);
  });

  test('every Explore view renders', async ({ page }) => {
    const errors = watchErrors(page);
    await freshStart(page, '/explore');
    const views = page.getByRole('navigation', { name: 'Explore views' }).getByRole('link');
    const count = await views.count();
    expect(count).toBeGreaterThan(5);
    for (let i = 0; i < count; i++) {
      const link = views.nth(i);
      const title = (await link.textContent())!.trim();
      await link.click();
      await expect(link).toHaveAttribute('aria-current', 'page');
      const view = page.getByRole('region', { name: title });
      await expect(view).toBeVisible();
      // The view's chunk has loaded (or failed, which shows an alert).
      await expect(view.getByText(`Loading ${title}…`)).toBeHidden();
      await expect(view.locator(':scope > *').first()).toBeVisible();
      await expect(view.getByRole('alert')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  // A skill per theory module that lazy drill logic leans on, with the skills
  // it needs mastered so a focused session serves it.
  const F1 = ['F1.alphabet', 'F1.b-c-e-f', 'F1.half-steps', 'F1.whole-steps'];
  const BEFORE_C3 = [...F1, 'F2.string6-naturals', 'F2.string5-naturals', 'C1.octaves'];
  const BEFORE_C5 = [
    ...BEFORE_C3,
    'C3.thirds',
    'C3.fourths-fifths',
    'C4.sharp-keys',
    'C4.flat-keys',
  ];
  const SESSIONS: [skillId: string, theory: string, mastered: readonly string[]][] = [
    ['C3.thirds', 'intervals', BEFORE_C3],
    ['I3.sharp-signatures', 'staff', [...F1, 'C4.sharp-keys']],
    [
      'C8.numerals-major',
      'harmony, function',
      [...BEFORE_C5, 'C4.sharp-key-degrees', 'C4.flat-key-degrees', 'C5.triads'],
    ],
    ['C6.major-shapes', 'shapes, chords', [...BEFORE_C5, 'C5.triads', 'C6.triad-cores']],
  ];
  for (const [skillId, theory, mastered] of SESSIONS) {
    test(`a ${skillId} session serves a prompt (${theory})`, async ({ page }) => {
      const errors = watchErrors(page);
      await freshStart(page);
      await masterSkills(page, mastered);
      await expectPrompt(page, skillId);
      expect(errors).toEqual([]);
    });
  }
});
