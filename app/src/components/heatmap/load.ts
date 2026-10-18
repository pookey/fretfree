import type { CardRecord, ReviewLogRecord } from '../../engine/model';
import type { FretworkDB } from '../../storage';

export interface HeatmapData {
  cards: CardRecord[];
  logs: ReviewLogRecord[];
}

/** Item-ID prefixes of the neck facts the heatmap places on cells (`note@s5f7`, `find:E@s5`). */
const NECK_ITEM_PREFIXES = ['note@', 'find:'];

/**
 * Everything the heatmap aggregates; the pure maths lives in `aggregate.ts`.
 * Only neck items' logs are read, through the `itemId` index.
 */
export async function loadHeatmapData(db: FretworkDB): Promise<HeatmapData> {
  const [cards, logs] = await Promise.all([
    db.cards.where('itemId').startsWithAnyOf(NECK_ITEM_PREFIXES).toArray(),
    db.reviewLogs.where('itemId').startsWithAnyOf(NECK_ITEM_PREFIXES).toArray(),
  ]);
  return { cards, logs };
}
