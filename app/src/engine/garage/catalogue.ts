import { CATEGORIES, type CatalogueItem, type Category } from './types';

/**
 * The Garage catalogue (design §3.8). One file per category: every module in
 * `catalogue/` is named after its category (`catalogue/finish.ts`) and
 * default-exports that category's parts. Modules are picked up automatically,
 * so new parts are added in their category's file.
 */
const modules = import.meta.glob<{ default?: readonly CatalogueItem[] }>(
  ['./catalogue/*.ts', '!./catalogue/*.test.ts'],
  { eager: true },
);

/**
 * Every part among `mods`, grouped by category in `CATEGORIES` order. Throws
 * on a file not named after a category, a part filed under another category,
 * or an ID used twice: the registry is a contract, so a bad file fails loudly.
 */
export function collectCatalogue(
  mods: Record<string, { default?: readonly CatalogueItem[] }>,
): CatalogueItem[] {
  const byCategory = new Map<Category, CatalogueItem[]>();
  for (const [path, mod] of Object.entries(mods)) {
    const file = path.replace(/^.*\/(.*)\.ts$/, '$1');
    if (!(CATEGORIES as readonly string[]).includes(file)) {
      throw new Error(`engine/garage/catalogue/${file}.ts is not named after a category`);
    }
    const items = mod.default;
    if (!items) throw new Error(`engine/garage/catalogue/${file}.ts must default-export its parts`);
    for (const item of items) {
      if (item.category !== file) {
        throw new Error(`${item.id} is a ${item.category} part, filed in ${file}.ts`);
      }
    }
    byCategory.set(file as Category, [...items]);
  }
  const all = CATEGORIES.flatMap((c) => byCategory.get(c) ?? []);
  const seen = new Set<string>();
  for (const { id } of all) {
    if (seen.has(id)) throw new Error(`Catalogue item ${id} is defined twice`);
    seen.add(id);
  }
  return all;
}

export const CATALOGUE: readonly CatalogueItem[] = collectCatalogue(modules);

const BY_ID = new Map(CATALOGUE.map((item) => [item.id, item]));

/** The part with this ID, if the catalogue has it. */
export function catalogueItem(id: string): CatalogueItem | undefined {
  return BY_ID.get(id);
}

/** Every part of one category, in catalogue order. */
export function itemsIn<C extends Category>(category: C): CatalogueItem<C>[] {
  return CATALOGUE.filter((item) => item.category === category) as CatalogueItem<C>[];
}
