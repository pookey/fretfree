import { expect, type Locator, type Page } from '@playwright/test';

// D10 "Which shape, and which comes next?" (M3-06). D10 shares C6's
// whole-shape cards with D9, and the picker alternates between them, so a
// spec that builds whole shapes meets D10 prompts too.

export type Shape = 'C' | 'A' | 'G' | 'E' | 'D';

export interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code): each
// major shape as string → frets from the root, plus its root string.
export const MAJOR_SHAPES: Record<Shape, { rootString: number; offsets: Record<number, number> }> =
  {
    C: { rootString: 5, offsets: { 5: 0, 4: -1, 3: -3, 2: -2, 1: -3 } },
    A: { rootString: 5, offsets: { 5: 0, 4: 2, 3: 2, 2: 2, 1: 0 } },
    G: { rootString: 6, offsets: { 6: 0, 5: -1, 4: -3, 3: -3, 2: -3, 1: 0 } },
    E: { rootString: 6, offsets: { 6: 0, 5: 2, 4: 2, 3: 1, 2: 0, 1: 0 } },
    D: { rootString: 4, offsets: { 4: 0, 3: 2, 2: 3, 1: 2 } },
  };

/** The chain up the neck: C A G E D, then round again. */
export const AFTER: Record<Shape, Shape> = { C: 'A', A: 'G', G: 'E', E: 'D', D: 'C' };
export const BEFORE: Record<Shape, Shape> = { A: 'C', G: 'A', E: 'G', D: 'E', C: 'D' };

export const whichShapeDrill = (page: Page) => page.getByTestId('d10-drill');
const neck = (page: Page) => page.locator('svg[data-fret-from]');

async function cellsOf(markers: Locator): Promise<Cell[]> {
  const out: Cell[] = [];
  for (const m of await markers.all()) {
    out.push({
      string: Number(await m.getAttribute('data-string')),
      fret: Number(await m.getAttribute('data-fret')),
    });
  }
  return out;
}

/** The dots on the neck: root squares and the rest of the shape, rings left out. */
export async function shapeCells(page: Page): Promise<{ roots: Cell[]; all: Cell[] }> {
  const roots = await cellsOf(neck(page).getByTestId('marker-root'));
  const others = await cellsOf(
    neck(page).locator(
      '[data-testid="marker-tone"], [data-testid="marker-third"], [data-testid="marker-fifth"], [data-testid="marker-seventh"]',
    ),
  );
  return { roots, all: [...roots, ...others] };
}

/** Which major shape the dots make, from the independent key. */
export function majorShapeOf(roots: readonly Cell[], all: readonly Cell[]): Shape | null {
  const key = (c: Cell) => `s${c.string}f${c.fret}`;
  const drawn = new Set(all.map(key));
  for (const [shape, t] of Object.entries(MAJOR_SHAPES) as [
    Shape,
    (typeof MAJOR_SHAPES)[Shape],
  ][]) {
    for (const r of roots.filter((c) => c.string === t.rootString)) {
      const cells = Object.entries(t.offsets).map(([s, off]) =>
        key({ string: Number(s), fret: r.fret + off }),
      );
      if (cells.length === drawn.size && cells.every((c) => drawn.has(c))) return shape;
    }
  }
  return null;
}

export interface WhichShapeTask {
  ask: 'name' | 'next' | 'previous';
  guided: boolean;
  answer: Shape;
}

/** Read a D10 prompt about a major shape and work out its answer. */
export async function readWhichShape(page: Page): Promise<WhichShapeTask> {
  await expect(whichShapeDrill(page)).toBeVisible();
  const ask = (await whichShapeDrill(page).getAttribute('data-ask')) as WhichShapeTask['ask'];
  const text = (await page.getByTestId('d10-prompt').innerText()).trim();
  const tap = /Tap ([CAGED]) to continue/.exec(text);
  if (tap) return { ask, guided: true, answer: tap[1] as Shape };
  if (ask === 'name') {
    const { roots, all } = await shapeCells(page);
    const answer = majorShapeOf(roots, all);
    expect(answer, text).not.toBeNull();
    return { ask, guided: false, answer: answer! };
  }
  const shown = /This is the ([CAGED]) shape/.exec(text)?.[1] as Shape | undefined;
  expect(shown, text).toBeDefined();
  return { ask, guided: false, answer: ask === 'next' ? AFTER[shown!] : BEFORE[shown!] };
}

/**
 * If the session shows D10 (rather than D9), answer it correctly and wait for
 * the next prompt; returns whether it did. Major shapes only.
 */
export async function answerWhichShape(page: Page): Promise<boolean> {
  const d9 = page.getByTestId('d9-drill');
  await expect(d9.or(whichShapeDrill(page))).toBeVisible();
  if (!(await whichShapeDrill(page).isVisible())) return false;
  const task = await readWhichShape(page);
  await page.getByRole('button', { name: `${task.answer} shape` }).click();
  await expect(page.getByTestId('feedback-correct')).toContainText(`the ${task.answer} shape`);
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return true;
}
