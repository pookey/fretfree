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
