import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Guitar } from './index';
import { look } from './test/fixtures';

const SOURCES = import.meta.glob<string>(['./index.tsx', './frame.ts', './label.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

// A value import (not `import type`) of a module.
const valueImport = (module: string) =>
  new RegExp(`(?:^|\\n)\\s*(?:import|export)(?!\\s+type\\b)[^;]*?from\\s*['"]${module}['"]`);

describe('<Guitar> (lazy)', () => {
  it('holds a labelled box, then the drawing', async () => {
    render(<Guitar spec={look()} size={12} />);
    const name = /^Les Paul guitar, cherry sunburst/;
    expect(screen.getByRole('img', { name }).tagName).toBe('SPAN');
    await waitFor(() => expect(screen.getByRole('img', { name }).tagName).toBe('svg'), {
      timeout: 5000,
    });
  });

  it.each(Object.keys(SOURCES))('%s keeps the renderer out of first-load JS', (file) => {
    const src = SOURCES[file] ?? '';
    for (const mod of [
      './GuitarArt',
      './geometry',
      './registry',
      './Neck',
      './parts',
      './finish',
    ]) {
      expect(src).not.toMatch(valueImport(mod));
    }
  });

  it('loads the renderer with a dynamic import', () => {
    expect(SOURCES['./index.tsx']).toMatch(/import\(['"]\.\/GuitarArt['"]\)/);
  });
});
