/**
 * Which body shapes are drawn, without loading their drawings: a lazy
 * glob keeps only the file names in first-load JS. The Garage (M11-04,
 * M11-06) hides body parts whose shape isn't here, because the renderer
 * falls back to the Stratocaster rather than throwing.
 */
const files = import.meta.glob(['./bodies/*.ts', '!./bodies/*.test.ts']);

export const BODY_SHAPES: readonly string[] = Object.keys(files).map((path) =>
  path.replace(/^\.\/bodies\/(.*)\.ts$/, '$1'),
);

export function hasBody(shape: string): boolean {
  return BODY_SHAPES.includes(shape);
}

/**
 * Bodies drawn without a pickguard, so a guard in the spec isn't drawn or
 * named on them. Kept here, not read from the drawings, so it stays out of
 * first-load JS; `registry.test.ts` checks it against the drawings.
 */
export const GUARDLESS_SHAPES: readonly string[] = ['superstrat', 'classical'];

/** Whether `shape` draws a pickguard (an unknown shape draws the Stratocaster's). */
export function hasGuard(shape: string): boolean {
  return !GUARDLESS_SHAPES.includes(shape);
}
