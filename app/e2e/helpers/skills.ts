import { readdirSync, readFileSync } from 'node:fs';

/**
 * Every skill ID in the app, read from the skill files' sources: the
 * registry itself uses `import.meta.glob`, which doesn't run under
 * Playwright. Each skill file writes its IDs as literals (`id: 'C8.nashville'`).
 */
const SKILLS_DIR = new URL('../../src/engine/skills/', import.meta.url);
const SKILL_ID = /\bid: '([A-Z]\d+\.[\w-]+)'/g;

export const ALL_SKILL_IDS: readonly string[] = readdirSync(SKILLS_DIR)
  .filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts' && f !== 'helpers.ts',
  )
  .flatMap((f) =>
    [...readFileSync(new URL(f, SKILLS_DIR), 'utf8').matchAll(SKILL_ID)].map((m) => m[1] as string),
  );

// A skill file that stopped writing literal IDs would quietly leak its items
// into every seeded session; fail loudly instead.
if (!ALL_SKILL_IDS.includes('F2.string6-naturals') || !ALL_SKILL_IDS.includes('C3.thirds')) {
  throw new Error('e2e/helpers/skills.ts: could not read the skill IDs from engine/skills');
}

/**
 * Every skill but `keep`, to mark mastered so a session works on those
 * skills only. Derived, so a new skill never leaks new items into it.
 */
export function skillsExcept(...keep: readonly string[]): string[] {
  return ALL_SKILL_IDS.filter((id) => !keep.includes(id));
}
