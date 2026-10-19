import { describe, expect, it, vi } from 'vitest';
import { Suspense, type FC } from 'react';
import { render, screen } from '@testing-library/react';
import { lazyLogic, lazyParts, lazyView, resolveView, viewReady } from './lazy-view';
import { DRILLS, drillReady, preloadDrill } from './registry';
import type { AnyDrillType } from './types';
import { logicOf } from './logics';
import { viewsOf } from './views';

const Hello: FC<{ name: string }> = ({ name }) => <p>Hello {name}</p>;

const inSuspense = (node: React.ReactNode) =>
  render(<Suspense fallback={<p role="status">Loading</p>}>{node}</Suspense>);

describe('lazyView', () => {
  it('suspends until its chunk loads, then renders the component', async () => {
    const View = lazyView(() => Promise.resolve(Hello));
    inSuspense(<View name="A" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByText('Hello A')).toBeInTheDocument();
  });

  it('renders at once, without a fallback, once preloaded', async () => {
    const load = vi.fn(() => Promise.resolve(Hello));
    const View = lazyView(load);
    expect(await View.preload()).toBe(Hello);
    expect(await View.preload()).toBe(Hello);
    expect(load).toHaveBeenCalledTimes(1);
    inSuspense(<View name="B" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Hello B')).toBeInTheDocument();
  });

  it('retries a failed download', async () => {
    const load = vi
      .fn<() => Promise<typeof Hello>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(Hello);
    const View = lazyView(load);
    await expect(View.preload()).rejects.toThrow('offline');
    expect(await View.preload()).toBe(Hello);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('resolveView and viewReady', () => {
  it('pass an eager component through', async () => {
    expect(await resolveView(Hello)).toBe(Hello);
    expect(viewReady(Hello)).toBe(true);
  });

  it('report a lazy one ready once it has loaded', async () => {
    const View = lazyView(() => Promise.resolve(Hello));
    expect(viewReady(View)).toBe(false);
    await View.preload();
    expect(viewReady(View)).toBe(true);
  });
});

/** Logic that is already there, for the view tests. */
const NO_LOGIC = { preload: () => Promise.resolve(undefined) };

describe('lazyParts', () => {
  it('fails, naming the file, for a part the drill’s views.ts lacks', async () => {
    // D1 has no context panel of its own.
    const parts = lazyParts<{ render: FC; contextPanel: FC }>('d1-name-the-note', NO_LOGIC);
    await expect(parts.contextPanel.preload()).rejects.toThrow(
      'drills/d1-name-the-note/views.ts exports no contextPanel',
    );
  });

  it('fails for a folder with no views.ts', async () => {
    await expect(lazyParts('d0-missing', NO_LOGIC).render.preload()).rejects.toThrow(
      'drills/d0-missing/views.ts is missing',
    );
  });

  it('loads the drill’s logic with its view, so a view that loaded can make its prompt', async () => {
    let done = (): void => undefined;
    const logic = { preload: vi.fn(() => new Promise<void>((r) => (done = r))) };
    const { render } = lazyParts('d1-name-the-note', logic);
    const loading = render.preload();
    await new Promise((r) => setTimeout(r, 0));
    expect(logic.preload).toHaveBeenCalledTimes(1);
    expect(render.ready()).toBe(false);
    done();
    expect(await loading).toBe(viewsOf('d1-name-the-note').render);
    expect(render.ready()).toBe(true);
  });

  it('fails the view when the logic fails to download, and retries both', async () => {
    const logic = {
      preload: vi
        .fn<() => Promise<unknown>>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(undefined),
    };
    const { render } = lazyParts('d1-name-the-note', logic);
    await expect(render.preload()).rejects.toThrow('offline');
    expect(render.ready()).toBe(false);
    expect(await render.preload()).toBe(viewsOf('d1-name-the-note').render);
  });
});

describe('lazyLogic', () => {
  it('throws until loaded, then hands over what it picked from the drill’s logic.ts', async () => {
    const pick = vi.fn((l: { d1Check: unknown }) => ({ check: l.d1Check }) as never);
    const logic = lazyLogic('d1-name-the-note', pick);
    expect(logic.ready()).toBe(false);
    expect(() => logic.get()).toThrow(
      'drills/d1-name-the-note/logic.ts hasn’t loaded: await preloadDrill first',
    );
    const loaded = await logic.preload();
    expect(await logic.preload()).toBe(loaded);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(logic.ready()).toBe(true);
    expect(logic.get()).toBe(loaded);
    expect(loaded).toEqual({ check: logicOf('d1-name-the-note')['d1Check' as keyof object] });
  });

  it('fails, naming the file, for a folder with no logic.ts', async () => {
    const logic = lazyLogic('d0-missing', () => ({}) as never);
    await expect(logic.preload()).rejects.toThrow('drills/d0-missing/logic.ts is missing');
    expect(logic.ready()).toBe(false);
  });
});

// Design §10: the plugins are eager metadata; their logic and views are not.
// Every drill takes its logic from its own logic.ts through lazyLogic, and its
// parts from its views.ts through lazyParts; one that imports either directly
// would put it back in first-load JS.
const plugins = import.meta.glob<{ default: AnyDrillType }>('./*/drill.ts', { eager: true });
const FOLDERS = Object.entries(plugins).map(
  ([file, m]) => [file.split('/')[1]!, m.default] as const,
);

describe('drill views', () => {
  it('cover every registered drill', () => {
    expect(FOLDERS.map(([, d]) => d.id).sort()).toEqual(DRILLS.map((d) => d.id).sort());
  });

  it.each(FOLDERS)('%s loads its parts from its views.ts, on demand', async (folder, drill) => {
    const views = viewsOf(folder);
    expect(drillReady(drill)).toBe(false);
    expect(await resolveView(drill.render)).toBe(views.render);
    // A panel exists exactly when views.ts exports one.
    expect(drill.contextPanel === undefined).toBe(views.contextPanel === undefined);
    if (drill.contextPanel) expect(await resolveView(drill.contextPanel)).toBe(views.contextPanel);
    await preloadDrill(drill);
    expect(drillReady(drill)).toBe(true);
  });

  it.each(FOLDERS)('%s loads its logic from its logic.ts, on demand', async (folder, drill) => {
    const logic = await drill.logic.preload();
    for (const key of ['makePrompt', 'check', 'describeAnswer', 'sounds'] as const) {
      expect(typeof logic[key], key).toBe('function');
    }
    // Every function it hands over is one its logic.ts exports, or a wrapper of one.
    const exported = new Set(Object.values(logicOf(folder)));
    expect(Object.values(logic).some((f) => exported.has(f))).toBe(true);
  });
});

/**
 * What a drill folder's modules import at run time, by source: every relative
 * import and re-export but `import type` / `export type`, which compile away.
 * With `verbatimModuleSyntax`, `import { type X } from './logic'` still loads
 * `./logic`, so it counts.
 */
const IMPORT = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?'(\.\.?\/[^']+)'/gm;

/** The files of a drill folder that loading its `drill.ts` loads too. */
function eagerFiles(folder: string, sources: Record<string, string>): string[] {
  const seen = new Set<string>();
  const queue = [`./${folder}/drill.ts`];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, typeOnly, spec] of (sources[file] ?? '').matchAll(IMPORT)) {
      // Shared modules (`../lazy-view`, `../../theory`) are first-load by design.
      if (typeOnly || !spec?.startsWith('./')) continue;
      const base = `./${folder}/${spec.slice(2)}`;
      const found = [`${base}.ts`, `${base}.tsx`, base].find((f) => f in sources);
      if (found) queue.push(found);
    }
  }
  return [...seen].map((f) => f.slice(folder.length + 3)).sort();
}

const SOURCES = import.meta.glob<string>(['./*/*.ts', './*/*.tsx', '!./*/*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('first-load drill code', () => {
  it('follows static imports within the folder, but not type-only ones', () => {
    const sources = {
      './dx/drill.ts': [
        "import { lazyLogic } from '../lazy-view';",
        "import type * as logic from './logic';",
        "export type { XPrompt } from './logic';",
        'import {',
        '  X_ID,',
        '  xCanTest,',
        "} from './meta';",
      ].join('\n'),
      './dx/meta.ts': "import { type Shape } from './shapes';\nexport const X_ID = 'x';",
      './dx/shapes.ts': "export * from './logic';",
      './dx/logic.ts': "import { XView } from './XView';",
      './dx/XView.tsx': '',
    };
    expect(eagerFiles('dx', sources)).toEqual([
      'XView.tsx',
      'drill.ts',
      'logic.ts',
      'meta.ts',
      'shapes.ts',
    ]);
  });

  it.each(FOLDERS.map(([folder]) => folder))(
    '%s keeps its logic.ts and views out of drill.ts’s imports',
    (folder) => {
      const eager = eagerFiles(folder, SOURCES);
      expect(eager).toContain('drill.ts');
      expect(eager).not.toContain('logic.ts');
      expect(eager).not.toContain('views.ts');
      expect(eager.filter((f) => f.endsWith('.tsx'))).toEqual([]);
    },
  );
});
