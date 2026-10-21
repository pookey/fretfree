import type { Transaction } from 'dexie';
import type { SkillStateRecord } from '../../engine/model';

/**
 * M10-12 split C2 (every note on every string) into stages: the naturals on
 * strings 1, 4, 3 and 2, then the sharps and flats on strings 6 and 5, then
 * those on strings 4 to 1, which keep the old skill ID. The item IDs stay
 * the same (`note@s3f5`, `find:C#@s3`), so the learner keeps every card;
 * this moves the rows of the earlier stages' items onto the stage that now
 * owns them. Frozen on purpose: it describes the split as shipped, not
 * whatever the skill files say later.
 */

export const OLD_SKILL = 'C2.all-notes';

/** The stages that take items from the old skill, in teaching order. */
export const STAGES = [
  'C2.string1-naturals',
  'C2.string4-naturals',
  'C2.string3-naturals',
  'C2.string2-naturals',
  'C2.low-accidentals',
] as const;

/** Each string's open note as a chroma (C = 0), standard tuning: strings 1 to 6. */
const OPEN_CHROMA: Readonly<Record<string, number>> = { 1: 4, 2: 11, 3: 7, 4: 2, 5: 9, 6: 4 };
const NATURAL_CHROMAS: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

/** The string and whether the note is natural, or undefined if the ID isn't a C2 item. */
function parse(itemId: string): { string: string; natural: boolean } | undefined {
  const note = /^note@s([1-6])f(\d+)$/.exec(itemId);
  if (note) {
    const [, string = '', fret = ''] = note;
    const chroma = ((OPEN_CHROMA[string] ?? 0) + Number(fret)) % 12;
    return { string, natural: NATURAL_CHROMAS.includes(chroma) };
  }
  const find = /^find:([A-G])([#b]?)@s([1-6])$/.exec(itemId);
  if (find) return { string: find[3] ?? '', natural: find[2] === '' };
  return undefined;
}

/**
 * The stage that now owns an old `C2.all-notes` item, or undefined if it
 * stays (a sharp or flat on strings 4 to 1) or isn't a C2 item.
 */
export function stageOf(itemId: string): string | undefined {
  const item = parse(itemId);
  if (!item) return undefined;
  const low = item.string === '6' || item.string === '5';
  // Naturals on strings 6 and 5 were always F2's.
  if (item.natural) return low ? undefined : `C2.string${item.string}-naturals`;
  return low ? 'C2.low-accidentals' : undefined;
}

interface Owned {
  itemId: string;
  skillId: string;
}

/** The row on its stage, or the row itself if it stays or doesn't name the old skill. */
export function restage<T extends Owned>(row: T): T {
  const skillId = row.skillId === OLD_SKILL && stageOf(row.itemId);
  return skillId ? { ...row, skillId } : row;
}

/**
 * The stages' states from the old skill's. Mastered carries to every stage.
 * Practising carries to each stage the learner has cards in. Locked and
 * unlocked add nothing: those stages are derived from their gates.
 */
export function stageStates(
  old: SkillStateRecord,
  stagesWithCards: ReadonlySet<string>,
): SkillStateRecord[] {
  return STAGES.filter((s) =>
    old.status === 'mastered' ? true : old.status === 'practising' && stagesWithCards.has(s),
  ).map((skillId) => ({ ...old, skillId }));
}

/**
 * Whether the old skill keeps its state. A practising learner with no cards
 * left on it (only naturals so far) has it derived from its gates instead,
 * so the sharps and flats wait their turn.
 */
function keepsOldState(old: SkillStateRecord, stagesWithCards: ReadonlySet<string>): boolean {
  return old.status !== 'practising' || stagesWithCards.has(OLD_SKILL);
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
  const old = states?.find((s) => s.skillId === OLD_SKILL);
  if (states && old) {
    const have = new Set(states.map((s) => s.skillId));
    const withCards = new Set(cards?.map((c) => c.skillId));
    out.skillStates = [
      ...states.filter((s) => s !== old || keepsOldState(old, withCards)),
      ...stageStates(old, withCards).filter((s) => !have.has(s.skillId)),
    ];
  }
  return out;
}

/** The schema v5 upgrade: restage the old skill's rows in place. */
export async function upgradeC2Strings(tx: Transaction): Promise<void> {
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
  if (before.some((s) => !t.skillStates.includes(s))) await states.delete(OLD_SKILL);
}
