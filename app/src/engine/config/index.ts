/**
 * Every tunable threshold of the learning engine (design §3.2 and research/02
 * rules 2, 3, 5, 6, 7). Change values in the area files, not inline.
 *
 * One file per area: every sibling module (`grading.ts`, `session.ts`, …)
 * exports a const named after its file and adds its type to `EngineConfig`
 * with a `declare module './index'` block. Modules are picked up
 * automatically, so parallel work packages add an area by adding a file
 * rather than editing a shared object.
 */
// Each area file augments this interface with its own key.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EngineConfig {}

const modules = import.meta.glob<Record<string, unknown>>(
  ['./*.ts', '!./index.ts', '!./*.test.ts'],
  { eager: true },
);

/** Area name → module exports, keyed by file name (`./grading.ts` → `grading`). */
export function collectAreas(
  mods: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, mod] of Object.entries(mods)) {
    const area = path.replace(/^\.\/(.*)\.ts$/, '$1');
    if (!(area in mod)) throw new Error(`engine/config/${area}.ts must export \`${area}\``);
    out[area] = mod[area];
  }
  return out;
}

export const ENGINE_CONFIG = collectAreas(modules) as unknown as EngineConfig;
