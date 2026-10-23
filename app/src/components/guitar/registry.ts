import type { BodyShape } from './types';

/**
 * Body shapes, one file per shape in `bodies/`, keyed by file name
 * (`bodies/s-style.ts` → `s-style`). A new shape is a new file.
 */
const modules = import.meta.glob<BodyShape>(['./bodies/*.ts', '!./bodies/*.test.ts'], {
  eager: true,
  import: 'default',
});

export function collectBodies(mods: Record<string, BodyShape>): ReadonlyMap<string, BodyShape> {
  const out = new Map<string, BodyShape>();
  for (const [path, body] of Object.entries(mods)) {
    const id = path.replace(/^\.\/bodies\/(.*)\.ts$/, '$1');
    if (!body?.outline)
      throw new Error(`components/guitar/bodies/${id}.ts must default-export a body`);
    out.set(id, body);
  }
  return out;
}

export const BODIES = collectBodies(modules);

/** The body for `shape`, or the first registered one when it isn't known. */
export function bodyFor(shape: string): BodyShape {
  const body = BODIES.get(shape) ?? BODIES.get('s-style') ?? [...BODIES.values()][0];
  if (!body) throw new Error('no guitar bodies are registered');
  return body;
}
