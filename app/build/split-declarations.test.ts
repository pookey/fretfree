import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, type Rolldown } from 'vite';
import { describe, expect, it } from 'vitest';
import { splitDeclarations, splitModule } from './split-declarations';

const ID = '/src/theory/mod.ts';

const SOURCE = `import { Note } from 'tonal';

export type Letter = 'C' | 'D';

/** A helper only \`b\` uses. */
function helper(x: number): number {
  return x * 2;
}

export const A = ['C', 'D'] as const;

export function b(n: number): number {
  return helper(n) + A.length;
}

export function even(n: number): boolean {
  return n === 0 ? true : odd(n - 1);
}

function odd(n: number): boolean {
  return n === 0 ? false : even(n - 1);
}

export interface Shape {
  name: string;
}

export function pitch(note: string): number | null {
  return Note.midi(note);
}
`;

describe('splitModule', () => {
  const split = splitModule(ID, SOURCE)!;

  it('gives each declaration its own piece, and a cycle one piece', () => {
    // helper, A, b, {even, odd}, pitch.
    expect(split.pieces).toHaveLength(5);
    const withEven = split.pieces.filter((p) => /function even/.test(p));
    expect(withEven).toHaveLength(1);
    expect(withEven[0]).toMatch(/function odd/);
  });

  it('re-exports the exported values from the facade, and no types or locals', () => {
    const names = [...split.facade.matchAll(/export \{ ([^}]*) \}/g)].flatMap((m) =>
      m[1]!.split(', '),
    );
    expect(names.sort()).toEqual(['A', 'b', 'even', 'pitch']);
    expect(split.facade).not.toMatch(/helper|odd|Letter|Shape/);
    expect(split.facade).toMatch(/from "\/src\/theory\/mod\.ts\?split=\d+"/);
  });

  it('imports what a piece references from the other pieces', () => {
    const piece = split.pieces.find((p) => /export function b/.test(p))!;
    expect(piece).toMatch(/import \{ helper \} from "\/src\/theory\/mod\.ts\?split=\d+";/);
    expect(piece).toMatch(/import \{ A \} from "\/src\/theory\/mod\.ts\?split=\d+";/);
    expect(piece).not.toMatch(/function helper|function even/);
    // A local another piece needs is exported from its own piece.
    const helperPiece = split.pieces.find((p) => /function helper/.test(p))!;
    expect(helperPiece).toMatch(/export \{ helper \};/);
  });

  it('keeps imports and types in every piece, at their original positions', () => {
    for (const piece of split.pieces) {
      expect(piece.slice(0, SOURCE.length)).toHaveLength(SOURCE.length);
      expect(piece.slice(0, SOURCE.length).split('\n')).toHaveLength(SOURCE.split('\n').length);
      expect(piece).toMatch(/^import \{ Note \} from 'tonal';/);
      expect(piece).toMatch(/export type Letter/);
      expect(piece).toMatch(/export interface Shape/);
    }
    const piece = split.pieces.find((p) => /export function pitch/.test(p))!;
    expect(piece.indexOf('export function pitch')).toBe(SOURCE.indexOf('export function pitch'));
  });

  it.each([
    ['a let', 'export let n = 1;\nexport function f() { return n; }'],
    ['a top-level statement', 'export function f() {}\nf();\nexport function g() {}'],
    ['an export list', 'function f() {}\nfunction g() {}\nexport { f, g };'],
    ['a re-export', "export function f() {}\nexport * from './other';"],
    ['a default export', 'export function f() {}\nexport default function g() {}'],
    ['a destructured const', 'export const { a, b } = { a: 1, b: 2 };\nexport function f() {}'],
  ])('leaves a module with %s whole', (_, source) => {
    expect(splitModule(ID, source)).toBeNull();
  });

  it('leaves a module whole when it is one piece', () => {
    expect(
      splitModule(ID, 'export function f() { return g(); }\nfunction g() { return f(); }'),
    ).toBeNull();
  });

  it('splits every theory module', () => {
    const dir = join(import.meta.dirname, '..', 'src', 'theory');
    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts',
    );
    expect(files.length).toBeGreaterThan(5);
    // A theory module the plugin can't split lands on first load whole as
    // soon as first-load code uses any of it (M1-44). Keep theory to imports,
    // types and function, class and const declarations.
    for (const f of files) {
      expect(splitModule(join(dir, f), readFileSync(join(dir, f), 'utf8')), f).not.toBeNull();
    }
  });
});

describe('splitDeclarations', () => {
  it('bundles split modules that run as the original, one instance per value', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'split-declarations-'));
    try {
      writeFileSync(
        join(dir, 'mod.ts'),
        [
          'export const LIST: readonly number[] = [1, 2, 3];',
          'export function first(): number { return LIST[0]!; }',
          'export function list(): readonly number[] { return LIST; }',
          'export function even(n: number): boolean { return n === 0 ? true : odd(n - 1); }',
          'function odd(n: number): boolean { return n === 0 ? false : even(n - 1); }',
          'export class Box { constructor(readonly v: number) {} twice(): number { return this.v * 2; } }',
        ].join('\n'),
      );
      writeFileSync(
        join(dir, 'main.ts'),
        "import { LIST, Box, even, first, list } from './mod';\n" +
          'export const result = [first(), list() === LIST, even(4), even(3), new Box(2).twice()];\n',
      );
      const out = (await build({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [splitDeclarations(/[\\/]mod\.ts$/)],
        build: {
          write: false,
          minify: false,
          lib: { entry: join(dir, 'main.ts'), formats: ['es'], fileName: 'main' },
        },
      })) as Rolldown.RolldownOutput[];
      const output = out[0]!.output;
      const chunk = output.find((o): o is Rolldown.OutputChunk => o.type === 'chunk')!;
      expect(chunk.moduleIds.filter((m) => m.includes('?split=')).length).toBeGreaterThan(3);
      const url = `data:text/javascript,${encodeURIComponent(chunk.code)}`;
      const { result } = (await import(/* @vite-ignore */ url)) as { result: unknown[] };
      expect(result).toEqual([1, true, true, false, 4]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
