import { expect, type Page } from '@playwright/test';

// D21 "Visualise it" (M6-09). D21 shares C6's whole-shape cards with D9 and
// D10, and the picker takes each in turn, so a spec that works through whole
// shapes meets D21 prompts too.

export type Shape = 'C' | 'A' | 'G' | 'E' | 'D';

export interface Cell {
  string: number;
  fret: number;
}

// An independent answer key (deliberately not imported from app code): each
// major shape as string → [frets above its lowest fret, degree], from the
// open chords x32010, x02220, 320003, 022100 and xx0232.
export const MAJOR_AT: Record<Shape, Record<number, [number, 'R' | '3' | '5']>> = {
  C: { 5: [3, 'R'], 4: [2, '3'], 3: [0, '5'], 2: [1, 'R'], 1: [0, '3'] },
  A: { 5: [0, 'R'], 4: [2, '5'], 3: [2, 'R'], 2: [2, '3'], 1: [0, '5'] },
  G: { 6: [3, 'R'], 5: [2, '3'], 4: [0, '5'], 3: [0, 'R'], 2: [0, '3'], 1: [3, 'R'] },
  E: { 6: [0, 'R'], 5: [2, '5'], 4: [2, 'R'], 3: [1, '3'], 2: [0, '5'], 1: [0, 'R'] },
  D: { 4: [0, 'R'], 3: [2, '5'], 2: [3, 'R'], 1: [2, '3'] },
};

export const visualiseDrill = (page: Page) => page.getByTestId('d21-drill');

export interface VisualiseTask {
  guided: boolean;
  shape: Shape;
  /** The shape's lowest fret; 0 in open position. */
  position: number;
  /** What to tap: `R` or `3` (major shapes). */
  degree: 'R' | '3';
}

/** Read a D21 prompt about a major shape. */
export async function readVisualise(page: Page): Promise<VisualiseTask> {
  await expect(visualiseDrill(page)).toBeVisible();
  const text = (await page.getByTestId('d21-prompt').innerText()).trim();
  const m =
    /(Picture|This is) the ([CAGED]) shape (?:of \S+ )?(?:at fret (\d+)|in open position).*every (root|3rd)/.exec(
      text,
    );
  expect(m, text).not.toBeNull();
  return {
    guided: m![1] === 'This is',
    shape: m![2] as Shape,
    position: m![3] ? Number(m![3]) : 0,
    degree: m![4] === 'root' ? 'R' : '3',
  };
}

/** The cells to tap, from the independent key. */
export function solveVisualise(task: VisualiseTask): Cell[] {
  return Object.entries(MAJOR_AT[task.shape])
    .filter(([, [, degree]]) => degree === task.degree)
    .map(([s, [fret]]) => ({ string: Number(s), fret: task.position + fret }));
}

/**
 * If the session shows D21 (rather than D9 or D10), answer it correctly and
 * wait for the next prompt; returns whether it did. Major shapes only.
 */
export async function answerVisualise(page: Page): Promise<boolean> {
  const any = page
    .getByTestId('d9-drill')
    .or(page.getByTestId('d10-drill'))
    .or(visualiseDrill(page));
  await expect(any).toBeVisible();
  if (!(await visualiseDrill(page).isVisible())) return false;
  const task = await readVisualise(page);
  const neck = page.locator('svg[data-fret-from]');
  for (const c of solveVisualise(task)) {
    await neck.locator(`[data-cell="s${c.string}f${c.fret}"]`).click();
  }
  await expect(page.getByTestId('feedback-correct')).toContainText(`the ${task.shape} shape`);
  await expect(page.getByTestId('feedback-correct')).toBeHidden();
  return true;
}
