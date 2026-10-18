import type { ReactNode } from 'react';

/** `shell` routes render inside the sidebar / tab bar; `fullscreen` ones (Session) don't. */
export type RouteLayout = 'shell' | 'fullscreen';

/** A sidebar and tab-bar entry, sorted by `order`. */
export interface NavEntry {
  label: string;
  icon: string;
  order: number;
}

/** What every `routes/<name>.route.tsx` file exports. */
export interface RouteModule {
  path: string;
  element: ReactNode;
  nav?: NavEntry;
  layout: RouteLayout;
}

const LAYOUTS: readonly RouteLayout[] = ['shell', 'fullscreen'];

/**
 * The routes of a glob (file → module), sorted by path. Throws, naming the
 * file, on a missing path, an unknown layout or a path another file claims.
 */
export function collectRoutes(modules: Record<string, RouteModule>): RouteModule[] {
  const seen = new Map<string, string>();
  for (const [file, route] of Object.entries(modules)) {
    if (typeof route.path !== 'string' || !route.path.startsWith('/'))
      throw new Error(`${file}: \`path\` must start with "/"`);
    if (!LAYOUTS.includes(route.layout))
      throw new Error(`${file}: \`layout\` must be one of ${LAYOUTS.join(', ')}`);
    const other = seen.get(route.path);
    if (other) throw new Error(`${file}: path "${route.path}" is already used by ${other}`);
    seen.set(route.path, file);
  }
  return Object.values(modules).sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Every screen (design §7). One file per route: each `routes/<name>.route.tsx`
 * is registered automatically, and those with a `nav` entry appear in the
 * sidebar and tab bar.
 */
export const ROUTES: readonly RouteModule[] = collectRoutes(
  import.meta.glob<RouteModule>('./*.route.tsx', { eager: true }),
);
