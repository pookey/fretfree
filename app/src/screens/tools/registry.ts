import { lazy, type ComponentType } from 'react';
import { ordered, type Ordered } from '../../registry';
import type { NavEntry } from '../../routes/registry';

/** What every `tools/<tool>/tool.meta.ts` file exports. `id` names the folder. */
export interface ToolMeta extends Ordered {
  name: string;
  /** One line on what the tool is for, shown on its card. */
  purpose: string;
  /** A text glyph for the card, decorative only. */
  icon: string;
  /** Listed only when test tools are switched on (`TEST_TOOLS_KEY`), never for learners. */
  testOnly?: boolean;
}

/** What every `tools/<tool>/tool.tsx` file exports. */
export interface ToolModule {
  View: ComponentType;
}

/** A listed tool. `View` may be lazy, so render it inside `<Suspense>`. */
export interface Tool extends ToolMeta {
  View: ComponentType;
}

const folderOf = (file: string) => /^\.\/([^/]+)\//.exec(file)?.[1];

/**
 * Pairs each `<tool>/tool.meta.ts` with its `<tool>/tool.tsx` loader, sorted
 * by `order`. The metadata is eager so the index renders at once; each view
 * loads on first render, keeping Tools out of first-load JS (design §10).
 * Test-only tools are dropped unless `includeTestOnly`. Throws, naming the
 * file, if either half is missing or an id doesn't match its folder.
 */
export function collectTools(
  metas: Record<string, ToolMeta>,
  loaders: Record<string, () => Promise<ToolModule>>,
  { includeTestOnly = false }: { includeTestOnly?: boolean } = {},
): Tool[] {
  const unpaired = new Set(Object.keys(loaders));
  const tools: Record<string, Tool> = {};
  for (const [file, meta] of Object.entries(metas)) {
    const viewFile = file.replace(/\.meta\.ts$/, '.tsx');
    const load = loaders[viewFile];
    if (!load) throw new Error(`${file}: no ${viewFile} to load`);
    unpaired.delete(viewFile);
    if (meta.id !== folderOf(file))
      throw new Error(`${file}: id "${meta.id}" must match its folder`);
    if (meta.testOnly && !includeTestOnly) continue;
    tools[file] = { ...meta, View: lazy(() => load().then((m) => ({ default: m.View }))) };
  }
  const [orphan] = unpaired;
  if (orphan) throw new Error(`${orphan}: no ${orphan.replace(/\.tsx$/, '.meta.ts')} to list it`);
  return ordered(tools);
}

/** Set to "1" in localStorage (e2e only) to list test-only tools. */
export const TEST_TOOLS_KEY = 'fretwork.e2e.testTools';

/**
 * Whether test-only tools are switched on. Storage that is missing or throws
 * (blocked site data, some private windows) counts as off.
 */
export function testToolsEnabled(
  storage: () => Pick<Storage, 'getItem'> | undefined = () => globalThis.localStorage,
): boolean {
  try {
    return storage()?.getItem(TEST_TOOLS_KEY) === '1';
  } catch {
    return false;
  }
}

/** The Tools nav entry, between Explore (30) and Progress (40). */
export const TOOLS_NAV: NavEntry = { label: 'Tools', icon: '⚒︎', order: 35 };

/** The nav entry for a list of tools: none until a tool is registered (design §7 Tools). */
export const toolsNav = (tools: readonly Tool[]): NavEntry | undefined =>
  tools.length > 0 ? TOOLS_NAV : undefined;

export const toolPath = (id: string) => `/tools/${id}`;

/**
 * The practice utilities (design §7 Tools), listed by `order`. One folder per
 * tool: `<tool>/tool.meta.ts` (id, name, purpose, icon, order) and
 * `<tool>/tool.tsx` (`View`), registered automatically.
 */
export const TOOLS: readonly Tool[] = collectTools(
  import.meta.glob<ToolMeta>('./*/tool.meta.ts', { eager: true }),
  import.meta.glob<ToolModule>('./*/tool.tsx'),
  { includeTestOnly: testToolsEnabled() },
);
