import { describe, expect, it } from 'vitest';
import { ordered } from './registry';

describe('ordered registries', () => {
  it('sorts by order, then by id for ties, whatever the file order', () => {
    const modules = {
      './c.tsx': { id: 'c', order: 20 },
      './b.tsx': { id: 'b', order: 10 },
      './a.tsx': { id: 'a', order: 20 },
      './z.tsx': { id: 'z', order: -5 },
    };
    expect(ordered(modules).map((e) => e.id)).toEqual(['z', 'b', 'a', 'c']);
  });

  it('is empty for an empty folder', () => {
    expect(ordered({})).toEqual([]);
  });

  it('rejects a repeated id, naming both files', () => {
    expect(() =>
      ordered({ './a.tsx': { id: 'x', order: 1 }, './b.tsx': { id: 'x', order: 2 } }),
    ).toThrow('./b.tsx: id "x" is already used by ./a.tsx');
  });

  it('rejects entries without an id or a numeric order', () => {
    expect(() => ordered({ './a.tsx': { order: 1 } as never })).toThrow('./a.tsx: missing `id`');
    expect(() => ordered({ './a.tsx': { id: 'a' } as never })).toThrow(
      './a.tsx: missing numeric `order`',
    );
  });
});
