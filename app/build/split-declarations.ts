import { readFileSync } from 'node:fs';
import { parseAst, type Plugin } from 'vite';

/**
 * Split modules into one module per top-level declaration (M1-44).
 *
 * Rolldown places whole modules in chunks. A theory module that first-load
 * code uses for one function lands on first load with every function in it
 * that only lazy drill logic uses (`secondaryDominants` in function.ts came in
 * with D-function's logic, which is lazy). Splitting a module into its
 * declarations lets each chunk take only the declarations it uses.
 *
 * The original module becomes a facade that re-exports its values from the
 * pieces, so importers don't change. Declarations that reference each other
 * in a cycle share a piece, so every piece is evaluated once, in dependency
 * order, and each value keeps one identity. A piece is the original source
 * with the other declarations blanked out, so line and column positions (and
 * sourcemaps) match the original file. Imports and type declarations stay in
 * every piece; unused imports are dropped because the split modules are
 * declared side-effect free.
 *
 * A module with any top-level statement other than an import, a type, or a
 * `function`/`class`/`const` declaration is left whole.
 */

const PIECE = /\?split=(\d+)$/;

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

interface Unit {
  /** The statement, including any `export` keyword. */
  stmt: Node;
  names: string[];
  exported: boolean;
}

export interface Split {
  facade: string;
  pieces: string[];
}

const TYPE_ONLY = new Set([
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSDeclareFunction',
]);

function declaredNames(decl: Node): string[] | null {
  if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
    const id = decl.id as Node | null;
    return id ? [id.name as string] : null;
  }
  if (decl.type === 'VariableDeclaration' && decl.kind === 'const') {
    const names: string[] = [];
    for (const d of decl.declarations as Node[]) {
      const id = d.id as Node;
      if (id.type !== 'Identifier') return null;
      names.push(id.name as string);
    }
    return names;
  }
  return null;
}

/** Every identifier name under a node. Over-approximates references: safe. */
function identifiers(node: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const n of node) identifiers(n, out);
  } else if (node && typeof node === 'object') {
    const n = node as Node;
    if (n.type === 'Identifier') out.add(n.name as string);
    for (const key in n) if (key !== 'type') identifiers(n[key], out);
  }
  return out;
}

/** Strongly connected components (Tarjan), each in source order. */
function components(edges: number[][]): number[][] {
  const index: number[] = [];
  const low: number[] = [];
  const onStack: boolean[] = [];
  const stack: number[] = [];
  const out: number[][] = [];
  let next = 0;
  const visit = (v: number): void => {
    index[v] = low[v] = next++;
    stack.push(v);
    onStack[v] = true;
    for (const w of edges[v]!) {
      if (index[w] === undefined) {
        visit(w);
        low[v] = Math.min(low[v]!, low[w]!);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v]!, index[w]!);
      }
    }
    if (low[v] === index[v]) {
      const comp: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack[w] = false;
        comp.push(w);
      } while (w !== v);
      out.push(comp.sort((a, b) => a - b));
    }
  };
  for (let v = 0; v < edges.length; v++) if (index[v] === undefined) visit(v);
  return out;
}

/** Replace a span with spaces, keeping line breaks so positions still line up. */
function blank(source: string, start: number, end: number): string {
  return (
    source.slice(0, start) + source.slice(start, end).replace(/[^\n]/g, ' ') + source.slice(end)
  );
}

/**
 * Split `source` (the module `id`) into a facade and its pieces, or return
 * null when it can't be split or has fewer than two pieces.
 */
export function splitModule(id: string, source: string): Split | null {
  const program = parseAst(source, { lang: 'ts' }) as unknown as { body: Node[] };
  const units: Unit[] = [];
  for (const stmt of program.body) {
    if (stmt.type === 'ImportDeclaration' || TYPE_ONLY.has(stmt.type)) continue;
    if (stmt.type === 'ExportNamedDeclaration') {
      const decl = stmt.declaration as Node | null;
      if (!decl) return null;
      if (TYPE_ONLY.has(decl.type)) continue;
      const names = declaredNames(decl);
      if (!names) return null;
      units.push({ stmt, names, exported: true });
      continue;
    }
    const names = declaredNames(stmt);
    if (!names) return null;
    units.push({ stmt, names, exported: false });
  }

  const owner = new Map<string, number>();
  units.forEach((u, i) => u.names.forEach((n) => owner.set(n, i)));
  const edges = units.map((u, i) => {
    const out = new Set<number>();
    for (const name of identifiers(u.stmt, new Set())) {
      const j = owner.get(name);
      if (j !== undefined && j !== i) out.add(j);
    }
    return [...out];
  });
  const comps = components(edges);
  if (comps.length < 2) return null;
  const pieceOf = new Map<number, number>();
  comps.forEach((c, p) => c.forEach((u) => pieceOf.set(u, p)));
  const pieceId = (p: number) => `${id}?split=${p}`;

  const pieces = comps.map((comp, p) => {
    let code = source;
    units.forEach((u, i) => {
      if (pieceOf.get(i) !== p) code = blank(code, u.stmt.start, u.stmt.end);
    });
    const imports = new Map<number, Set<string>>();
    for (const u of comp) {
      for (const j of edges[u]!) {
        const q = pieceOf.get(j)!;
        if (q === p) continue;
        if (!imports.has(q)) imports.set(q, new Set());
        for (const n of units[j]!.names) imports.get(q)!.add(n);
      }
    }
    const tail: string[] = [];
    for (const [q, names] of [...imports].sort((a, b) => a[0] - b[0])) {
      tail.push(`import { ${[...names].join(', ')} } from ${JSON.stringify(pieceId(q))};`);
    }
    const local = comp.filter((u) => !units[u]!.exported).flatMap((u) => units[u]!.names);
    if (local.length > 0) tail.push(`export { ${local.join(', ')} };`);
    return tail.length > 0 ? `${code}\n${tail.join('\n')}\n` : code;
  });

  const facade = comps
    .map((comp, p) => {
      const names = comp.filter((u) => units[u]!.exported).flatMap((u) => units[u]!.names);
      return names.length > 0
        ? `export { ${names.join(', ')} } from ${JSON.stringify(pieceId(p))};`
        : null;
    })
    .filter((line) => line !== null)
    .join('\n');
  return { facade: `${facade}\n`, pieces };
}

/** Build-only: split every module whose id matches `include`. */
export function splitDeclarations(include: RegExp): Plugin {
  const splits = new Map<string, Split | null>();
  const splitOf = (file: string): Split | null => {
    if (!splits.has(file)) splits.set(file, splitModule(file, readFileSync(file, 'utf8')));
    return splits.get(file)!;
  };
  return {
    name: 'fretwork:split-declarations',
    apply: 'build',
    enforce: 'pre',
    resolveId(source) {
      return PIECE.test(source) ? source : null;
    },
    load(id) {
      const piece = PIECE.exec(id);
      if (piece) {
        const code = splitOf(id.slice(0, piece.index))?.pieces[Number(piece[1])];
        if (code === undefined) this.error(`split-declarations: no piece for ${id}`);
        return code;
      }
      if (id.includes('?') || !include.test(id)) return null;
      return splitOf(id)?.facade ?? null;
    },
  };
}
