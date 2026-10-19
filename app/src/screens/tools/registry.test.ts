import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { ROUTES } from '../../routes/registry';
import { NAV_ITEMS, navItems } from '../../shell/nav';
import {
  collectTools,
  TEST_TOOLS_KEY,
  testToolsEnabled,
  TOOLS,
  TOOLS_NAV,
  toolPath,
  toolsNav,
  type ToolMeta,
  type ToolModule,
} from './registry';

const meta = (id: string, extra: Partial<ToolMeta> = {}): ToolMeta => ({
  id,
  name: id,
  purpose: `What ${id} is for.`,
  icon: '•',
  order: 1,
  ...extra,
});
const load = (): Promise<ToolModule> => Promise.resolve({ View: () => null });

describe('collectTools', () => {
  it('pairs each folder’s meta with its view, by order then id', () => {
    const tools = collectTools(
      {
        './b/tool.meta.ts': meta('b', { order: 2 }),
        './a/tool.meta.ts': meta('a', { order: 2 }),
        './first/tool.meta.ts': meta('first', { order: 1 }),
      },
      { './a/tool.tsx': load, './b/tool.tsx': load, './first/tool.tsx': load },
    );
    expect(tools.map((t) => t.id)).toEqual(['first', 'a', 'b']);
    for (const t of tools) expect(t.View).toBeTypeOf('object'); // lazy
  });

  it('drops test-only tools unless asked for them', () => {
    const metas = {
      './real/tool.meta.ts': meta('real'),
      './fake/tool.meta.ts': meta('fake', { testOnly: true }),
    };
    const loaders = { './real/tool.tsx': load, './fake/tool.tsx': load };
    expect(collectTools(metas, loaders).map((t) => t.id)).toEqual(['real']);
    expect(collectTools(metas, loaders, { includeTestOnly: true }).map((t) => t.id)).toEqual([
      'fake',
      'real',
    ]);
  });

  it('rejects a tool missing either half, or whose id isn’t its folder, naming the file', () => {
    expect(() => collectTools({ './a/tool.meta.ts': meta('a') }, {})).toThrow(
      './a/tool.meta.ts: no ./a/tool.tsx to load',
    );
    expect(() => collectTools({}, { './a/tool.tsx': load })).toThrow(
      './a/tool.tsx: no ./a/tool.meta.ts to list it',
    );
    expect(() => collectTools({ './a/tool.meta.ts': meta('b') }, { './a/tool.tsx': load })).toThrow(
      './a/tool.meta.ts: id "b" must match its folder',
    );
    expect(() =>
      collectTools(
        { './a/tool.meta.ts': meta('a', { order: Number.NaN }) },
        { './a/tool.tsx': load },
      ),
    ).toThrow('./a/tool.meta.ts: missing numeric `order`');
  });
});

describe('testToolsEnabled', () => {
  const storage = (value: string | null) => () => ({ getItem: () => value });

  it('is on only when the key is "1"', () => {
    expect(testToolsEnabled(storage('1'))).toBe(true);
    expect(testToolsEnabled(storage('0'))).toBe(false);
    expect(testToolsEnabled(storage(null))).toBe(false);
    expect(testToolsEnabled(() => undefined)).toBe(false);
  });

  it('counts storage that throws as off', () => {
    expect(
      testToolsEnabled(() => {
        throw new Error('SecurityError');
      }),
    ).toBe(false);
    expect(
      testToolsEnabled(() => ({
        getItem: () => {
          throw new Error('blocked');
        },
      })),
    ).toBe(false);
  });

  it('reads localStorage by default', () => {
    localStorage.setItem(TEST_TOOLS_KEY, '1');
    expect(testToolsEnabled()).toBe(true);
    localStorage.removeItem(TEST_TOOLS_KEY);
    expect(testToolsEnabled()).toBe(false);
  });
});

describe('the Tools section', () => {
  const tool = collectTools({ './a/tool.meta.ts': meta('a') }, { './a/tool.tsx': load });

  it('stays out of the nav until a tool is registered', () => {
    expect(toolsNav([])).toBeUndefined();
    expect(toolsNav(tool)).toBe(TOOLS_NAV);
  });

  it('sits between Explore and Progress once it has a tool', () => {
    const routes = ROUTES.map((r) => (r.path === '/tools' ? { ...r, nav: toolsNav(tool) } : r));
    expect(navItems(routes).map((n) => n.label)).toEqual([
      'Today',
      'Learn',
      'Explore',
      'Tools',
      'Progress',
      'Settings',
    ]);
  });

  it('lists no test tools for learners, so the live nav matches the registry', () => {
    expect(TOOLS.some((t) => t.testOnly)).toBe(false);
    expect(NAV_ITEMS.some((n) => n.to === '/tools')).toBe(TOOLS.length > 0);
  });

  it('routes the index and each tool, both loaded on demand', () => {
    const element = (path: string) =>
      (ROUTES.find((r) => r.path === path)?.element as ReactElement | undefined)?.type;
    expect(element('/tools')).toBe(Suspense);
    expect(element('/tools/:tool')).toBe(Suspense);
    expect(ROUTES.find((r) => r.path === '/tools/:tool')?.nav).toBeUndefined();
    expect(toolPath('tuner')).toBe('/tools/tuner');
  });
});
