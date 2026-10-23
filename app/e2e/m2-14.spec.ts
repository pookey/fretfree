import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, firstLaunch, freshStart, noteName } from './helpers';
import { focusSession } from './helpers/focus';
import { skipInstallTip } from './helpers/install';
import { C3_SKILLS, SKILLS_BEFORE_C3, seedIntervals } from './helpers/intervals';
import { seedDueItems } from './helpers/octaves';
import { d5ButtonName } from './helpers/interval-names';

// M2-14: the M2 milestone QA (design §11: C1, C3 via D4–D6, G–B shift
// content, confusable pairing, placement test). One session serves due
// octave and interval reviews through all three M2 drills, interleaved; a
// slip on the G–B shift comes back a few prompts later through its own
// drill. Then every M2 screen is checked for overflow.
//
// The @smoke tests also run against production, on every profile:
//   E2E_BASE_URL=https://fretfree.app pnpm e2e:only e2e/m2-14.spec.ts
// The screenshot pass is on demand: with SCREENSHOTS=1 the screen walk also
// saves each screen, dark and light, under --output (run from app/):
//   SCREENSHOTS=1 E2E_BASE_URL=https://fretfree.app pnpm e2e:only \
//     e2e/m2-14.spec.ts --grep @screens --output <dir>

// An independent answer key (deliberately not imported from app code).
const OPEN_MIDI: Record<number, number> = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const NAMES = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];
const SEMITONES: Record<string, number> = {
  'minor 2nd': 1,
  'major 2nd': 2,
  'minor 3rd': 3,
  'major 3rd': 4,
  'perfect 4th': 5,
  tritone: 6,
  'perfect 5th': 7,
  'minor 6th': 8,
  'major 6th': 9,
  'minor 7th': 10,
  'major 7th': 11,
};

/**
 * Due reviews for each M2 drill: D4 (octaves), D5 (name the interval) and D6
 * (tap it), oldest review first. Due reviews run in FSRS order (lowest
 * retrievability first), so this order mixes the drills.
 */
const DUE = [
  { itemId: 'octave:s6f5→s4', skillId: 'C1.octaves' },
  { itemId: 'interval:M3@s3→s2', skillId: 'C3.thirds' },
  { itemId: 'interval-name:M3@s3→s2', skillId: 'C3.thirds' },
  { itemId: 'octaves:G', skillId: 'C1.every-octave' },
  { itemId: 'interval:P5@s6→s5', skillId: 'C3.fourths-fifths' },
  { itemId: 'interval-name:m3@s6→s5', skillId: 'C3.thirds' },
  { itemId: 'octave:s4f5→s2', skillId: 'C1.octaves-gb-shift' },
];
const M2_SKILLS = [...new Set(DUE.map((d) => d.skillId))];

type Drill = 'octave-finder' | 'interval-name' | 'interval-tap';

interface Cell {
  string: number;
  fret: number;
}

const midi = (c: Cell) => OPEN_MIDI[c.string]! + c.fret;
const neck = (page: Page) => page.locator('svg[data-fret-from]');
const cellAt = (page: Page, c: Cell) => neck(page).locator(`[data-cell="s${c.string}f${c.fret}"]`);
const d4Prompt = (page: Page) => page.getByTestId('d4-prompt');
const d5Prompt = (page: Page) => page.getByTestId('d5-drill').locator('#drill-prompt');
const d6Prompt = (page: Page) => page.getByTestId('d6-prompt');
const summary = (page: Page) => page.getByTestId('session-summary');

async function markerCells(page: Page, style: string): Promise<Cell[]> {
  return neck(page)
    .getByTestId(`marker-${style}`)
    .evaluateAll((els) =>
      els.map((el) => ({
        string: Number(el.getAttribute('data-string')),
        fret: Number(el.getAttribute('data-fret')),
      })),
    );
}

async function markerCell(page: Page, style: string): Promise<Cell> {
  await expect(neck(page).getByTestId(`marker-${style}`).first()).toBeVisible();
  return (await markerCells(page, style))[0]!;
}

const text = async (loc: ReturnType<Page['getByTestId']>) => (await loc.innerText()).trim();

/** Which M2 drill is on screen, or null once the session is over. */
async function current(page: Page): Promise<Drill | null> {
  await expect(
    d4Prompt(page).or(d5Prompt(page)).or(d6Prompt(page)).or(summary(page)),
  ).toBeVisible();
  if (await d4Prompt(page).isVisible()) return 'octave-finder';
  if (await d5Prompt(page).isVisible()) return 'interval-name';
  if (await d6Prompt(page).isVisible()) return 'interval-tap';
  return null;
}

/** D4: the octave shape's cell (single), or every other cell of the note (every). */
async function d4Answer(page: Page): Promise<Cell[]> {
  const prompt = await text(d4Prompt(page));
  const single = /^Tap the octave of \S+ on string (\d)$/.exec(prompt);
  if (single) {
    const dot = await markerCell(page, 'root');
    // The octave nearest in fret: 12 semitones either way, less the strings' gap.
    const to = Number(single[1]);
    const gap = OPEN_MIDI[to]! - OPEN_MIDI[dot.string]!;
    return [{ string: to, fret: dot.fret + 12 * Math.round(gap / 12) - gap }];
  }
  const every = /^Tap every ([A-G]#?)(?: in frets (\d+)–(\d+))?$/.exec(prompt);
  if (!every) throw new Error(`Unexpected D4 prompt: ${prompt}`);
  const [from, to] = every[2] ? [Number(every[2]), Number(every[3])] : [0, 12];
  // The shown dot (only in its own region on compact) and the Gs found so far.
  const known = [...(await markerCells(page, 'root')), ...(await markerCells(page, 'correct'))];
  const out: Cell[] = [];
  for (let string = 1; string <= 6; string++) {
    for (let fret = from; fret <= to; fret++) {
      const c = { string, fret };
      const isKnown = known.some((k) => k.string === string && k.fret === fret);
      if (noteName(string, fret) === every[1] && !isKnown) out.push(c);
    }
  }
  return out;
}

/** D5: the interval from the lower (root) dot to the upper one. */
async function d5Answer(page: Page): Promise<string> {
  const prompt = await text(d5Prompt(page));
  const guided = /Tap (\S+) to continue/.exec(prompt);
  if (guided) return guided[1]!;
  const root = await markerCell(page, 'root');
  const upper = await markerCell(page, 'target');
  return NAMES[midi(upper) - midi(root)]!;
}

/** D6: the named interval above the root, on the named string (or any live one, widened). */
async function d6Answer(page: Page): Promise<Cell> {
  const prompt = await text(d6Prompt(page));
  const root = await markerCell(page, 'root');
  const shape = /^Tap the (.+) above the root on string (\d)$/.exec(prompt);
  if (shape) {
    const string = Number(shape[2]);
    return { string, fret: midi(root) + SEMITONES[shape[1]!]! - OPEN_MIDI[string]! };
  }
  const degree = /^Tap a (.+) from the root, on any string$/.exec(prompt);
  if (!degree) throw new Error(`Unexpected D6 prompt: ${prompt}`);
  const drill = page.locator('[data-scope]');
  const from = Number(await drill.getAttribute('data-active-from'));
  const to = Number(await drill.getAttribute('data-active-to'));
  const chroma = (midi(root) + SEMITONES[degree[1]!]!) % 12;
  for (let string = 1; string <= 6; string++) {
    for (let fret = from; fret <= to; fret++) {
      if (midi({ string, fret }) % 12 === chroma) return { string, fret };
    }
  }
  throw new Error(`No ${degree[1]} in frets ${from}–${to}`);
}

async function expectCorrect(page: Page): Promise<void> {
  await expect(page.getByTestId('feedback-correct')).toBeVisible();
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
}

/** Answer the prompt on screen correctly. */
async function answer(page: Page, drill: Drill): Promise<void> {
  if (drill === 'octave-finder') {
    // Compact screens ask "every" items region by region: answer until it's graded.
    const feedback = page.getByTestId('feedback-correct');
    while (!(await feedback.isVisible())) {
      const before = await text(d4Prompt(page));
      const cells = await d4Answer(page);
      expect(cells.length).toBeGreaterThan(0);
      for (const c of cells) await cellAt(page, c).click();
      await expect
        .poll(async () => (await feedback.isVisible()) || (await text(d4Prompt(page))) !== before)
        .toBe(true);
    }
  } else if (drill === 'interval-name') {
    const name = await d5Answer(page);
    await page
      .getByRole('group', { name: /interval|continue/i })
      .getByRole('button', { name: d5ButtonName(name), exact: true })
      .click();
  } else {
    await cellAt(page, await d6Answer(page)).click();
  }
  await expectCorrect(page);
}

/**
 * A learner with M1 to C3 mastered and only `DUE` waiting; the session focuses
 * on M2. `identical` seeds every card alike, as the placement test does.
 */
async function startM2Reviews(page: Page, identical = false): Promise<void> {
  await freshStart(page);
  await seedIntervals(page, {
    mastered: [...SKILLS_BEFORE_C3, ...C3_SKILLS],
    cards: DUE.map((d, i) => ({ ...d, dueInDays: -1, reviewedDaysAgo: identical ? 20 : 20 - i })),
  });
  await focusSession(page, M2_SKILLS);
}

/** Finish the session from its last prompt and go back to Today. */
async function finish(page: Page, answered: number): Promise<void> {
  const end = page.getByRole('button', { name: 'End session' });
  await expect(end.or(summary(page))).toBeVisible();
  if (await end.isVisible()) await end.click();
  await expect(page.getByTestId('summary-items')).toHaveText(String(answered));
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

interface Log {
  itemId: string;
  drillType: string;
  correct: boolean;
}

async function reviewLogs(page: Page): Promise<Log[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fretwork');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const logs = await new Promise<Log[]>((resolve, reject) => {
      const req = db.transaction('reviewLogs').objectStore('reviewLogs').getAll();
      req.onsuccess = () => resolve(req.result as Log[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return logs;
  });
}

/** How many times the sequence changes drill. */
const switches = (seq: readonly string[]) => seq.filter((d, i) => i > 0 && d !== seq[i - 1]).length;

test.describe('M2-14 a cross-drill session', () => {
  test('due octave and interval reviews run through D4, D5 and D6, interleaved', async ({
    page,
  }) => {
    test.slow();
    await startM2Reviews(page);

    const served: Drill[] = [];
    for (let drill = await current(page); drill; drill = await current(page)) {
      if (served.length >= DUE.length) break;
      served.push(drill);
      await answer(page, drill);
    }
    expect(served).toHaveLength(DUE.length);
    // Every M2 drill serves its own items, mixed rather than blocked by drill (rule 6).
    expect(new Set(served)).toEqual(new Set(['octave-finder', 'interval-name', 'interval-tap']));
    expect(switches(served)).toBeGreaterThanOrEqual(4);
    await expectNoHorizontalOverflow(page);
    await finish(page, DUE.length);

    // Each item was graded once, by the drill its ID belongs to, and nothing is due now.
    const logs = await reviewLogs(page);
    expect(logs.map((l) => l.itemId).sort()).toEqual(DUE.map((d) => d.itemId).sort());
    for (const log of logs) {
      expect(log.correct).toBe(true);
      const kind = log.itemId.split(':')[0];
      expect(log.drillType).toBe(
        kind === 'interval-name'
          ? 'interval-name'
          : kind === 'interval'
            ? 'interval-tap'
            : 'octave-finder',
      );
    }
    await expect(page.getByTestId('due-count')).toHaveText('0');
  });

  test('identically seeded reviews still interleave their drills (rule 6)', async ({ page }) => {
    test.slow();
    // Equal retrievability: item-ID order would serve each drill's items together.
    await startM2Reviews(page, true);

    const served: Drill[] = [];
    for (let drill = await current(page); drill; drill = await current(page)) {
      if (served.length >= DUE.length) break;
      served.push(drill);
      await answer(page, drill);
    }
    expect(served).toHaveLength(DUE.length);
    expect(switches(served)).toBeGreaterThanOrEqual(4);
    await finish(page, DUE.length);
  });

  test('a G–B shift slip comes back through its own drill, between the others', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    test.slow();
    await startM2Reviews(page);

    const served: string[] = [];
    let slipped: string | null = null;
    for (let drill = await current(page); drill; drill = await current(page)) {
      const prompt = await text(
        drill === 'octave-finder'
          ? d4Prompt(page)
          : drill === 'interval-tap'
            ? d6Prompt(page)
            : d5Prompt(page),
      );
      served.push(`${drill}: ${prompt}`);
      // The first D6 shape across G–B: tap one fret short, as the lower strings would have it.
      if (!slipped && drill === 'interval-tap' && /on string 2$/.test(prompt)) {
        const right = await d6Answer(page);
        expect((await markerCell(page, 'root')).string).toBe(3);
        await cellAt(page, { string: 2, fret: right.fret - 1 }).click();
        await expect(page.getByTestId('feedback-wrong')).toContainText('G–B shift');
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByTestId('feedback-wrong')).toBeHidden();
        slipped = served.at(-1)!;
        continue;
      }
      await answer(page, drill);
      if (served.length > DUE.length + 1) break;
    }
    expect(slipped).not.toBeNull();
    // The miss returned once, later in the session, after other drills' prompts.
    const first = served.indexOf(slipped!);
    const again = served.lastIndexOf(slipped!);
    expect(again).toBeGreaterThan(first + 1);
    expect(served.slice(first + 1, again).some((p) => !p.startsWith('interval-tap'))).toBe(true);
    expect(served).toHaveLength(DUE.length + 1);
    await finish(page, DUE.length + 1);

    const logs = await reviewLogs(page);
    const shift = logs.filter((l) => l.itemId === 'interval:M3@s3→s2');
    expect(shift.map((l) => l.correct)).toEqual([false, true]);
  });
});

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

test.describe('M2-14 screenshot pass', () => {
  test('every M2 screen renders without overflow @smoke @screens @layout', async ({
    page,
  }, info) => {
    test.slow();
    // The placement test, the last onboarding step.
    await skipInstallTip(page);
    await firstLaunch(page);
    await page.getByRole('button', { name: 'Get started' }).click();
    const placementStep = page.getByRole('heading', { name: 'Already play a bit?', level: 1 });
    // Wait for each skip to land before the next, as m10-10 does: a click
    // fired during a step's transition can hit the next step's buttons.
    const progress = page.getByTestId('onboarding-progress');
    for (let n = 0; n < 12 && !(await placementStep.isVisible()); n++) {
      const step = (await progress.textContent()) ?? '';
      await page.getByRole('button', { name: 'Skip this step' }).click();
      await expect(progress).not.toHaveText(step);
    }
    await expect(placementStep).toBeVisible();
    await shoot(page, info, '01-placement-intro');
    await page.getByRole('button', { name: 'Start the test' }).click();
    const dialog = page.getByRole('dialog', { name: 'Placement test' });
    await expect(dialog.getByTestId('placement-probe')).toBeVisible();
    await shoot(page, info, '02-placement-probe');

    // Today with its daily quests, Learn's Whole neck and Intervals modules with
    // their worked examples, and Explore's chord view.
    await freshStart(page);
    await expect(page.getByRole('region', { name: 'Daily quests' })).toBeVisible();
    await shoot(page, info, '03-today-quests');
    for (const [n, module, skill] of [
      ['04', 'notes-2', 'C1.octaves'],
      ['05', 'intervals', 'C3.thirds'],
    ] as const) {
      await page.goto(`/learn?module=${module}`);
      await expect(page.locator('[data-loaded="true"]')).toBeVisible();
      await expect(page.getByTestId('module-detail')).toBeVisible();
      await shoot(page, info, `${n}-learn-${module}`);
      await page
        .getByTestId(`skill-${skill}`)
        .getByRole('button', { name: 'Worked example' })
        .click();
      const example = page.getByTestId('worked-example');
      await expect(example).toHaveAttribute('data-stage', 'worked');
      // The shell scrolls inside its own container, which a full-page shot doesn't unroll.
      await example.scrollIntoViewIfNeeded();
      await shoot(page, info, `${n}b-worked-example-${module}`);
    }
    await page.goto('/explore');
    await page.getByRole('combobox', { name: 'Root' }).selectOption({ label: 'G' });
    await page.getByRole('combobox', { name: 'Show' }).selectOption({ label: 'Dominant seventh' });
    await expect(page.getByTestId('explorer-legend')).toBeVisible();
    await shoot(page, info, '06-explore-chord');

    // A cross-drill session with guides up, each drill's first prompt shot.
    await seedDueItems(page, DUE, 2);
    await focusSession(page, M2_SKILLS);
    const shot = new Set<Drill>();
    let answered = 0;
    for (let drill = await current(page); drill; drill = await current(page)) {
      if (!shot.has(drill)) {
        shot.add(drill);
        await shoot(page, info, `07-session-${drill}`);
      }
      await answer(page, drill);
      if (++answered >= DUE.length) break;
    }
    expect(shot.size).toBe(3);
    const end = page.getByRole('button', { name: 'End session' });
    await expect(end.or(summary(page))).toBeVisible();
    if (await end.isVisible()) await end.click();
    await expect(summary(page)).toBeVisible();
    await shoot(page, info, '08-session-summary');

    await page.goto('/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await shoot(page, info, '09-progress');
  });
});
