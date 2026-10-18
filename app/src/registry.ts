/**
 * One-file-per-entry registries (design §7). Today cards, Progress panels,
 * Explore views and onboarding steps are each a folder of files picked up with
 * `import.meta.glob`, so parallel work packages add an entry by adding a file
 * rather than editing a shared list.
 */
export interface Ordered {
  id: string;
  order: number;
}

/**
 * The entries of a glob (file → module), sorted by `order` with ties broken by
 * `id` so the result never depends on file-system order. Throws, naming the
 * file, if an entry has no `id` or `order` or reuses another entry's `id`.
 */
export function ordered<T extends Ordered>(modules: Record<string, T>): T[] {
  const seen = new Map<string, string>();
  for (const [file, entry] of Object.entries(modules)) {
    if (typeof entry.id !== 'string' || entry.id === '') throw new Error(`${file}: missing \`id\``);
    if (!Number.isFinite(entry.order)) throw new Error(`${file}: missing numeric \`order\``);
    const other = seen.get(entry.id);
    if (other) throw new Error(`${file}: id "${entry.id}" is already used by ${other}`);
    seen.set(entry.id, file);
  }
  return Object.values(modules).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
