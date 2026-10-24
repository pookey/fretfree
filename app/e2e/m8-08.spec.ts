import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart, masterSkills } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';
import { focusSession } from './helpers/focus';

// M8-08: T3 and T5 skills and D31 "Accent and strum in meter" on the M8-01
// timing engine. The click is real, on the Tone Transport; the onsets come
// from the e2e fake (timing/e2e-hook.ts), which plays an onset a set number
// of ms after every click, strong or soft by a rule over the click. The
// cards here play a stroke on every click, so every stroke gets an onset.

const FAKE_ONSETS_KEY = 'fretwork.e2e.fakeOnsets';

/** Which clicks get a strong onset: the bar's downbeat, or every beat (not the subdivisions). */
type Strong = 'downbeat' | 'beats' | 'all';

type HookWindow = Window & {
  fretworkFakeOnsets?: {
    echo: number | null;
    strength?: ((click: { accent: string }) => number) | null;
  };
};

const session = (page: Page) => page.getByTestId('session');

async function open(page: Page, mastered: string[], skillId: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((key) => localStorage.setItem(key, '1'), FAKE_ONSETS_KEY);
  await tapAudioOutput(page);
  await freshStart(page);
  // A focus can't unlock a skill: the pulse comes first.
  await masterSkills(page, mastered);
  await focusSession(page, skillId);
  return errors;
}

/** Plays a stroke `ms` after every click, strong per `strong`; the hook exists once a rep has started. */
async function echo(page: Page, ms: number, strong: Strong) {
  await page.waitForFunction(() => Boolean((window as HookWindow).fretworkFakeOnsets));
  await page.evaluate(
    ({ v, rule }) => {
      const hook = (window as HookWindow).fretworkFakeOnsets!;
      hook.strength = (c) =>
        rule === 'all' || c.accent === 'bar' || (rule === 'beats' && c.accent !== 'sub') ? 1 : 0.5;
      hook.echo = v;
    },
    { v: ms, rule: strong },
  );
}

test.describe('M8-08 D31 accent and strum in meter', () => {
  test('accents the downbeat as the click fades out @smoke @layout', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page, ['F4.pulse'], 'T5.downbeat');
    const drill = session(page);
    await expect(drill.getByTestId('d31-prompt')).toContainText('Tap beat 1 of 4/4');
    // The worked example: the count under the bar, the accent marked, the whole click.
    await expect(drill.getByTestId('d31-explain')).toContainText('Listen to the count-in');
    const grid = drill.getByRole('list', { name: 'The bar, with its accents' });
    await expect(grid.getByRole('listitem')).toHaveCount(4);
    await expect(grid.getByRole('listitem').first()).toHaveAccessibleName('1: strong tap');
    await expect(grid.getByRole('listitem').nth(1)).toHaveAccessibleName('2: soft tap');
    await expect(drill.getByTestId('d31-syllable')).toHaveText(['1', '2', '3', '4']);
    await expect(drill.getByTestId('d31-click')).toHaveText('Click: every beat');
    await expectNoHorizontalOverflow(page);

    await drill.getByRole('button', { name: 'Start' }).click();
    await echo(page, 10, 'downbeat');
    const pads = drill.getByRole('group', { name: 'Tap pads' });
    const strong = pads.getByRole('button', { name: 'Strong' });
    const soft = pads.getByRole('button', { name: 'Soft' });
    await expect(strong).toBeFocused();
    for (const pad of [strong, soft]) {
      await expect(pad).toBeInViewport();
      const box = await pad.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    // The click sounds.
    await expect
      .poll(() => audioLevel(page), { timeout: 10_000, intervals: [20] })
      .toBeGreaterThan(0.01);
    // Every stroke right: the click drops to the downbeat, then fades further.
    await expect(drill.getByTestId('d31-click')).toHaveText('Click: beat 1', { timeout: 20_000 });

    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ 16 of 16 right', {
      timeout: 30_000,
    });
    const results = drill.getByTestId('d31-results');
    await expect(results).toContainText('Bar 1 · Click: every beat');
    await expect(results).toContainText('Bar 4 · Click: beat 1 of every 2nd bar');
    await expect(
      results.getByRole('list', { name: 'Bar 4' }).getByRole('listitem').first(),
    ).toHaveAccessibleName('1: strong, on time, 10 ms late');
    expect(errors).toEqual([]);
  });

  test('marks strokes played with the wrong accent and asks again', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page, ['F4.pulse'], 'T5.downbeat');
    const drill = session(page);
    await drill.getByRole('button', { name: 'Start' }).click();
    // Every stroke strong: in time, but the soft beats are wrong.
    await echo(page, 10, 'all');

    await expect(page.getByTestId('feedback-wrong')).toContainText(
      'That was 4 of 16 right (13 needed; 12 accents off).',
      { timeout: 45_000 },
    );
    await expect(drill.getByTestId('d31-explain')).toContainText('12 soft strokes played strong.');
    const cells = drill
      .getByTestId('d31-results')
      .getByRole('list', { name: 'Bar 1' })
      .getByRole('listitem');
    await expect(cells.first()).toHaveAccessibleName('1: strong, on time, 10 ms late');
    await expect(cells.nth(1)).toHaveAccessibleName('2: on time, but strong: it should be soft');
    // The click never faded: the strokes weren't right.
    await expect(drill.getByTestId('d31-results')).toContainText('Bar 4 · Click: every beat');
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(drill.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(drill.getByTestId('d31-results')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('counts sixteenths, “1 e & a”, with the beats strong', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page, ['F4.pulse', 'F4.eighths'], 'T3.simple');
    const drill = session(page);
    await expect(drill.getByTestId('d31-prompt')).toContainText('Count 2/4 in sixteenths');
    await expect(drill.getByTestId('d31-syllable')).toHaveText([
      '1',
      'e',
      '&',
      'a',
      '2',
      'e',
      '&',
      'a',
    ]);
    await expect(drill.getByTestId('d31-click')).toHaveText('Click: every step');
    await expectNoHorizontalOverflow(page);

    await drill.getByRole('button', { name: 'Start' }).click();
    await echo(page, 8, 'beats');
    await expect(page.getByTestId('feedback-correct')).toHaveText('✓ 32 of 32 right', {
      timeout: 30_000,
    });
    await expect(
      drill.getByTestId('d31-results').getByRole('list', { name: 'Bar 1' }).getByRole('listitem'),
    ).toHaveCount(8);
    expect(errors).toEqual([]);
  });
});
