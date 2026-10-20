import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['./*.ts', './*.tsx', '!./*.test.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

// A value import (not `import type`) of a module, written across lines or not.
const valueImport = (module: string) =>
  new RegExp(`(?:^|\\n)\\s*(?:import|export)(?!\\s+type\\b)[^;]*?from\\s*['"]${module}['"]`);

describe('<Staff> keeps VexFlow out of first-load JS', () => {
  const files = Object.keys(SOURCES);

  it('finds the sources', () => {
    expect(files).toContain('./Staff.tsx');
    expect(files).toContain('./render.ts');
  });

  it.each(files.filter((f) => f !== './render.ts'))(
    '%s imports neither VexFlow nor the renderer statically',
    (file) => {
      const src = SOURCES[file] ?? '';
      expect(src).not.toMatch(valueImport('vexflow(?:/[^\'"]*)?'));
      expect(src).not.toMatch(valueImport('\\./render'));
    },
  );

  it('only the renderer imports VexFlow', () => {
    expect(SOURCES['./render.ts']).toMatch(valueImport('vexflow/bravura'));
    expect(SOURCES['./engraver.ts']).toMatch(/import\(['"]\.\/render['"]\)/);
  });

  it('spots a static import when there is one', () => {
    expect("import { Stave } from 'vexflow';").toMatch(valueImport('vexflow'));
    expect("import {\n  Stave,\n} from 'vexflow/core';").toMatch(valueImport('vexflow/core'));
    expect("import type { Engraving } from './render';").not.toMatch(valueImport('\\./render'));
  });
});
