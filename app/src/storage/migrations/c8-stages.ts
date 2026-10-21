import type { Transaction } from 'dexie';
import type { SkillStateRecord } from '../../engine/model';

/**
 * M10-02 split C8's harmony by key: stage 1 (C, G, D) keeps the old skill
 * IDs, and the items of the other keys move to new stage skills. The item
 * IDs stay the same (`numeral:vi@key=A`), so the learner keeps every card;
 * this moves the rows of those keys onto the stage that now owns them.
 * Frozen on purpose: it describes the split as shipped, not whatever the
 * skill files say later.
 */

/** Each old skill, with its stages 2 and 3 in order. */
export const STAGES: Readonly<Record<string, readonly [string, string]>> = {
  'C8.numerals-major': ['C8.numerals-a-e-f', 'C8.numerals-other-keys'],
  'C8.nashville': ['C8.nashville-a-e-f', 'C8.nashville-other-keys'],
};

const STAGE_2_KEYS: readonly string[] = ['A', 'E', 'F'];
const STAGE_3_KEYS: readonly string[] = ['B', 'F#', 'Bb', 'Eb', 'Ab', 'Db'];

/**
 * The stage that now owns an old C8 skill's item, or undefined if the item
 * stays (a stage-1 key) or isn't one of that skill's.
 */
export function stageOf(skillId: string, itemId: string): string | undefined {
  const stages = STAGES[skillId];
  const key = /^(?:numeral|numeral-of|nashville):[^@]+@key=(.+)$/.exec(itemId)?.[1];
  if (!stages || !key) return undefined;
  if (STAGE_2_KEYS.includes(key)) return stages[0];
  if (STAGE_3_KEYS.includes(key)) return stages[1];
  return undefined;
}

interface Owned {
  itemId: string;
  skillId: string;
}

/** The row on its stage, or the row itself if it stays where it is. */
export function restage<T extends Owned>(row: T): T {
  const skillId = stageOf(row.skillId, row.itemId);
  return skillId ? { ...row, skillId } : row;
}

/**
 * The later stages' states from an old skill's. Mastered carries to every
 * stage. Practising carries to each stage the learner has cards in. Locked
 * and unlocked add nothing: those stages are derived from their gates.
 */
export function stageStates(
  old: SkillStateRecord,
  stagesWithCards: ReadonlySet<string>,
): SkillStateRecord[] {
  const stages = STAGES[old.skillId] ?? [];
  return stages
    .filter((s) =>
      old.status === 'mastered' ? true : old.status === 'practising' && stagesWithCards.has(s),
    )
    .map((skillId) => ({ ...old, skillId }));
}

/** Rows as plain objects, as both the Dexie upgrade and an export file hold them. */
export interface StagedTables {
  cards?: unknown[];
  reviewLogs?: unknown[];
  skillStates?: unknown[];
}

/**
 * Restage the tables: an export file's (an import from before the split), or
 * the upgrade's. Rows it leaves alone keep their identity, and a stage that
 * already has a state keeps it.
 */
export function restageTables<T extends StagedTables>(tables: T): T {
  const out: T = { ...tables };
  const cards = (tables.cards as Owned[] | undefined)?.map(restage);
  if (cards) out.cards = cards;
  if (tables.reviewLogs) out.reviewLogs = (tables.reviewLogs as Owned[]).map(restage);
  const states = tables.skillStates as SkillStateRecord[] | undefined;
  if (states) {
    const have = new Set(states.map((s) => s.skillId));
    const withCards = new Set(cards?.map((c) => c.skillId));
    const added = states
      .filter((s) => s.skillId in STAGES)
      .flatMap((s) => stageStates(s, withCards))
      .filter((s) => !have.has(s.skillId));
    if (added.length > 0) out.skillStates = [...states, ...added];
  }
  return out;
}

/** The schema v4 upgrade: restage the old skills' rows in place. */
export async function upgradeC8Stages(tx: Transaction): Promise<void> {
  const old = (name: string) =>
    tx.table(name).where('skillId').anyOf(Object.keys(STAGES)).toArray();
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
}
