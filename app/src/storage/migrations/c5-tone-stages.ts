import type { Transaction } from 'dexie';
import type { SkillStateRecord } from '../../engine/model';

/**
 * M3-17 split D8's `C5.tones-triads` into stages: the root, then the 3rd,
 * then the 5th. The item IDs stay the same (`chord-tone:3@major`), so the
 * learner keeps every card; this moves the rows that name the old skill onto
 * the stage that now owns their item. Frozen on purpose: it describes the
 * split as shipped, not whatever the skill files say later.
 */

export const OLD_SKILL = 'C5.tones-triads';

export const STAGES = ['C5.tones-roots', 'C5.tones-thirds', 'C5.tones-fifths'] as const;

/** The stage that owns an old `C5.tones-triads` item, or undefined if it isn't one. */
export function stageOf(itemId: string): string | undefined {
  // Degrees 1, 3 or ♭3, and 5 are stages 0, 1 and 2.
  const n = /^chord-tone(?:-name)?:b?([135])@(?:major|minor)$/.exec(itemId)?.[1];
  return n && STAGES[(Number(n) - 1) / 2];
}

interface Owned {
  itemId: string;
  skillId: string;
}

/** The row on its stage, or the row itself if it doesn't name the old skill. */
export function restage<T extends Owned>(row: T): T {
  const skillId = row.skillId === OLD_SKILL && stageOf(row.itemId);
  return skillId ? { ...row, skillId } : row;
}

/**
 * The stages' states from the old skill's. Mastered carries to every stage.
 * Practising carries to each stage the learner has cards in, and to the root
 * stage, which opens on the old skill's prerequisites; so does locked or
 * unlocked. The other stages are derived as usual.
 */
export function stageStates(
  old: SkillStateRecord,
  stagesWithCards: ReadonlySet<string>,
): SkillStateRecord[] {
  return STAGES.filter((s, i) =>
    old.status === 'mastered'
      ? true
      : i === 0 || (old.status === 'practising' && stagesWithCards.has(s)),
  ).map((skillId) => ({ ...old, skillId }));
}

/** Rows as plain objects, as both the Dexie upgrade and an export file hold them. */
export interface StagedTables {
  cards?: unknown[];
  reviewLogs?: unknown[];
  skillStates?: unknown[];
}

/**
 * Restage the tables: an export file's (an import from before the split), or
 * the upgrade's. Rows it leaves alone keep their identity.
 */
export function restageTables<T extends StagedTables>(tables: T): T {
  const out: T = { ...tables };
  const cards = (tables.cards as Owned[] | undefined)?.map(restage);
  if (cards) out.cards = cards;
  if (tables.reviewLogs) out.reviewLogs = (tables.reviewLogs as Owned[]).map(restage);
  const states = tables.skillStates as SkillStateRecord[] | undefined;
  const old = states?.find((s) => s.skillId === OLD_SKILL);
  if (states && old) {
    const have = new Set(states.map((s) => s.skillId));
    out.skillStates = [
      ...states.filter((s) => s !== old),
      ...stageStates(old, new Set(cards?.map((c) => c.skillId))).filter(
        (s) => !have.has(s.skillId),
      ),
    ];
  }
  return out;
}

/** The schema v3 upgrade: restage the old skill's rows in place. */
export async function upgradeC5ToneStages(tx: Transaction): Promise<void> {
  const old = (name: string) => tx.table(name).where('skillId').equals(OLD_SKILL).toArray();
  const states = tx.table('skillStates');
  const before = (await states.toArray()) as unknown[];
  const t = restageTables({
    cards: await old('cards'),
    reviewLogs: await old('reviewLogs'),
    skillStates: before,
  });
  await tx.table('cards').bulkPut(t.cards);
  await tx.table('reviewLogs').bulkPut(t.reviewLogs);
  await states.bulkPut(t.skillStates.filter((s) => !before.includes(s)));
  await states.delete(OLD_SKILL);
}
