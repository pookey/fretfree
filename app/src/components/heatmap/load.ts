import type { CardRecord, ReviewLogRecord } from '../../engine/model';
import type { FretworkDB } from '../../storage';

export interface HeatmapData {
  cards: CardRecord[];
  logs: ReviewLogRecord[];
}

/** Everything the heatmap aggregates; the pure maths lives in `aggregate.ts`. */
export async function loadHeatmapData(db: FretworkDB): Promise<HeatmapData> {
  const [cards, logs] = await Promise.all([db.cards.toArray(), db.reviewLogs.toArray()]);
  return { cards, logs };
}
