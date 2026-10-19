import { describe, expect, it } from 'vitest';
import { Suspense, type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { lazyElement } from './lazy-element';
import { ROUTES } from './registry';

describe('lazyElement', () => {
  it('shows a status while the screen loads, then the screen', async () => {
    let resolve!: (c: () => React.ReactNode) => void;
    const element = lazyElement(() => new Promise((r) => (resolve = r)), 'the thing');
    render(element);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the thing…');
    resolve(() => <h1>The thing</h1>);
    expect(await screen.findByRole('heading', { name: 'The thing' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is what the run-once routes render', () => {
    const type = (path: string) =>
      (ROUTES.find((r) => r.path === path)?.element as ReactElement | undefined)?.type;
    expect(type('/onboarding')).toBe(Suspense);
    expect(type('/placement')).toBe(Suspense);
    expect(type('/')).not.toBe(Suspense);
  });
});
