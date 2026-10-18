import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ExploreScreen } from './ExploreScreen';

const views = [
  { id: 'alpha', title: 'Alpha', order: 1, View: () => <p>Alpha view</p> },
  { id: 'beta', title: 'Beta', order: 2, View: () => <p>Beta view</p> },
];

function renderAt(path: string, list = views) {
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

  it('registers the fretboard explorer by default', () => {
    render(
      <MemoryRouter>
        <ExploreScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: 'Fretboard explorer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quiz me on this' })).toHaveAttribute(
      'href',
      '/session',
    );
  });
});
