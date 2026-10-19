/**
 * Every drill's logic (design §6), one file per drill: `drills/<folder>/logic.ts`
 * is collected automatically. Only `lazyLogic` imports this module, and only
 * dynamically, so the eager glob puts all drills' prompt building and grading
 * in one on-demand chunk, out of first-load JS (design §10).
 */
const modules = import.meta.glob<object>('./*/logic.ts', { eager: true });

/** The `logic.ts` module of the drill in `drills/<folder>/`. Throws if it has none. */
export function logicOf(folder: string): object {
  const logic = modules[`./${folder}/logic.ts`];
  if (!logic) throw new Error(`drills/${folder}/logic.ts is missing`);
  return logic;
}
