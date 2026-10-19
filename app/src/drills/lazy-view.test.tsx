import { describe, expect, it, vi } from 'vitest';
import { Suspense, type FC } from 'react';
import { render, screen } from '@testing-library/react';
import { lazyView, resolveView } from './lazy-view';
import { DRILLS, preloadDrill } from './registry';

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

describe('resolveView', () => {
  it('returns an eager component as it is', async () => {
    expect(await resolveView(Hello)).toBe(Hello);
  });
});

describe('drill views', () => {
  // Design §10: the plugins are eager, their views are not. A drill.ts that
  // imports its view directly puts it back in first-load JS.
  it.each(DRILLS.map((d) => [d.id, d] as const))(
    '%s loads its view and context panel on demand',
    async (_, drill) => {
      expect(drill.render).toHaveProperty('preload');
      if (drill.contextPanel) expect(drill.contextPanel).toHaveProperty('preload');
      await preloadDrill(drill);
      expect(typeof (await resolveView(drill.render))).toBe('function');
    },
  );
});
