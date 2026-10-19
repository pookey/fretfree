import { describe, expect, it, vi } from 'vitest';
import { Suspense, type FC } from 'react';
import { render, screen } from '@testing-library/react';
import { lazyParts, lazyView, resolveView, viewReady } from './lazy-view';
import { DRILLS, drillReady, preloadDrill } from './registry';
import type { AnyDrillType } from './types';
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

describe('lazyParts', () => {
  it('fails, naming the file, for a part the drill’s views.ts lacks', async () => {
    // D9 has no context panel of its own.
    const parts = lazyParts<{ render: FC; contextPanel: FC }>('d9-build-caged');
    await expect(parts.contextPanel.preload()).rejects.toThrow(
      'drills/d9-build-caged/views.ts exports no contextPanel',
    );
  });

  it('fails for a folder with no views.ts', async () => {
    await expect(lazyParts('d0-missing').render.preload()).rejects.toThrow(
      'drills/d0-missing/views.ts is missing',
    );
  });
});

// Design §10: the plugins are eager, their views are not. Every drill takes
// its parts from its own views.ts through lazyParts; one that imports its
// view directly would put it back in first-load JS.
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
});
