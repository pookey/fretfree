import type { Transaction } from 'dexie';
import type { CardRecord, ReviewLogRecord, SkillStateRecord } from '../../engine/model';

/**
 * M3-17 split D8's `C5.tones-triads` into stages: the root, then the 3rd,
 * then the 5th. The item IDs stay the same (`chord-tone:3@major`), so the
 * learner keeps every card; this moves the rows that name the old skill onto
 * the stage that now owns their item. Frozen on purpose: it describes the
 * split as shipped, not whatever the skill files say later.
 */

export const OLD_SKILL = 'C5.tones-triads';

const STAGE_BY_DEGREE: Readonly<Record<string, string>> = {
  '1': 'C5.tones-roots',
  '3': 'C5.tones-thirds',
  b3: 'C5.tones-thirds',
  '5': 'C5.tones-fifths',
};

export const STAGES = ['C5.tones-roots', 'C5.tones-thirds', 'C5.tones-fifths'] as const;

/** The stage that owns an old `C5.tones-triads` item, or undefined if it isn't one. */
export function stageOf(itemId: string): string | undefined {
  const degree = /^chord-tone(?:-name)?:([^@]+)@(?:major|minor)$/.exec(itemId)?.[1];
  return degree === undefined ? undefined : STAGE_BY_DEGREE[degree];
}

interface Owned {
  itemId: string;
  skillId: string;
}

/** The row on its stage, or the row itself if it doesn't name the old skill. */
export function restage<T extends Owned>(row: T): T {
  if (row.skillId !== OLD_SKILL) return row;
  const skillId = stageOf(row.itemId);
  return skillId === undefined ? row : { ...row, skillId };
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
  const carried =
    old.status === 'mastered'
      ? STAGES
      : old.status === 'practising'
        ? STAGES.filter((s) => s === STAGES[0] || stagesWithCards.has(s))
        : [STAGES[0]];
  return carried.map((skillId) => ({ ...old, skillId }));
}

/** Rows as plain objects, as both the Dexie upgrade and an export file hold them. */
export interface StagedTables {
  cards?: unknown[];
  reviewLogs?: unknown[];
  skillStates?: unknown[];
}

/** Restage an export file's tables (an import of a file older than the split). */
export function restageTables<T extends StagedTables>(tables: T): T {
  const cards = (tables.cards as CardRecord[] | undefined)?.map(restage);
  const states = tables.skillStates as SkillStateRecord[] | undefined;
  const old = states?.find((s) => s.skillId === OLD_SKILL);
  const out: T = { ...tables };
  if (cards) out.cards = cards;
  if (tables.reviewLogs) out.reviewLogs = (tables.reviewLogs as ReviewLogRecord[]).map(restage);
  if (states && old) {
    const have = new Set(states.map((s) => s.skillId));
    const added = stageStates(old, new Set(cards?.map((c) => c.skillId))).filter(
      (s) => !have.has(s.skillId),
    );
    out.skillStates = [...states.filter((s) => s !== old), ...added];
  }
  return out;
}

/** The schema v3 upgrade: restage the rows in place. */
export async function upgradeC5ToneStages(tx: Transaction): Promise<void> {
  for (const name of ['cards', 'reviewLogs'] as const) {
    await tx
      .table(name)
      .where('skillId')
      .equals(OLD_SKILL)
      .modify((row: Owned) => {
        row.skillId = restage(row).skillId;
      });
  }
  const states = tx.table<SkillStateRecord, string>('skillStates');
  const old = await states.get(OLD_SKILL);
  if (!old) return;
  const cards = (await tx.table('cards').toArray()) as CardRecord[];
  const added = stageStates(old, new Set(cards.map((c) => c.skillId)));
  for (const s of added) if (!(await states.get(s.skillId))) await states.put(s);
  await states.delete(OLD_SKILL);
}
