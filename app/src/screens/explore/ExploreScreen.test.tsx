import { lazy } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ExploreScreen } from './ExploreScreen';
import { EXPLORE_VIEWS, collectViews, type ExploreView } from './registry';

const views: ExploreView[] = [
  { id: 'alpha', title: 'Alpha', order: 1, View: () => <p>Alpha view</p> },
  { id: 'beta', title: 'Beta', order: 2, View: () => <p>Beta view</p> },
];

function renderAt(path: string, list: readonly ExploreView[] = views) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ExploreScreen views={list} />
    </MemoryRouter>,
  );
}

describe('<ExploreScreen>', () => {
  it('lists the views and shows the first by default', () => {
    renderAt('/explore');
    const nav = screen.getByRole('navigation', { name: 'Explore views' });
    expect(nav.querySelectorAll('a')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: 'Alpha' })).toHaveTextContent('Alpha view');
  });

  it('switches view from the list and honours ?view=', () => {
    renderAt('/explore?view=beta');
    expect(screen.getByText('Beta view')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Alpha' }));
    expect(screen.getByText('Alpha view')).toBeInTheDocument();
    expect(screen.queryByText('Beta view')).not.toBeInTheDocument();
  });

  it('falls back to the first view for an unknown id', () => {
    renderAt('/explore?view=nope');
    expect(screen.getByText('Alpha view')).toBeInTheDocument();
  });

  it('says so when no views are registered', () => {
    renderAt('/explore', []);
    expect(screen.getByText('Nothing to explore yet.')).toBeInTheDocument();
  });

  it('shows a status while a view loads', () => {
    const pending = [{ ...views[0]!, View: lazy(() => new Promise<never>(() => {})) }];
    renderAt('/explore', pending);
    expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading Alpha…');
  });

  it('offers a reload when a view fails to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = [
      { ...views[0]!, View: lazy(() => Promise.reject(new Error('offline'))) },
      views[1]!,
    ];
    renderAt('/explore', failing);
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load Alpha');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    // Another view still opens.
    fireEvent.click(screen.getByRole('link', { name: 'Beta' }));
    expect(screen.getByText('Beta view')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    error.mockRestore();
  });

  it('registers the fretboard explorer by default', async () => {
    render(
      <MemoryRouter>
        <ExploreScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: 'Fretboard explorer' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Quiz me on this' })).toHaveAttribute(
      'href',
      '/session?skill=F2.string6-naturals&skill=F2.string5-naturals&skill=C2.all-notes',
    );
  });

  it.each(EXPLORE_VIEWS.map((v) => [v.id, v.title]))(
    'loads and renders the registered %s view',
    async (id, title) => {
      renderAt(`/explore?view=${id}`, EXPLORE_VIEWS);
      const region = screen.getByRole('region', { name: title });
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
      expect(region).not.toBeEmptyDOMElement();
    },
  );
});

describe('collectViews', () => {
  const View = () => <p>Loaded</p>;
  const load = () => Promise.resolve({ View });

  it('pairs each meta file with its view and sorts by order', async () => {
    const list = collectViews(
      {
        './views/b.meta.ts': { id: 'b', title: 'B', order: 2 },
        './views/a.meta.ts': { id: 'a', title: 'A', order: 1 },
      },
      { './views/a.tsx': load, './views/b.tsx': load },
    );
    expect(list.map((v) => v.id)).toEqual(['a', 'b']);
    renderAt('/explore', list);
    expect(await screen.findByText('Loaded')).toBeInTheDocument();
  });

  it('does not load a view until it renders', () => {
    const spy = vi.fn(load);
    collectViews(
      { './views/a.meta.ts': { id: 'a', title: 'A', order: 1 } },
      { './views/a.tsx': spy },
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('names a meta file without a view', () => {
    expect(() =>
      collectViews({ './views/a.meta.ts': { id: 'a', title: 'A', order: 1 } }, {}),
    ).toThrow('./views/a.meta.ts: no ./views/a.tsx to load');
  });

  it('names a view without a meta file', () => {
    expect(() => collectViews({}, { './views/a.tsx': load })).toThrow(
      './views/a.tsx: no ./views/a.meta.ts to list it',
    );
  });
});
