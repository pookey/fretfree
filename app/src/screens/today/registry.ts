import type { ComponentType } from 'react';
import { ordered, type Ordered } from '../../registry';

/** What every `today/cards/<id>.tsx` file exports. */
export interface TodayCard extends Ordered {
  Card: ComponentType;
}

/**
 * The cards on Today (design §7), top to bottom by `order`. One file per card:
 * each `cards/<id>.tsx` is registered automatically.
 */
export const TODAY_CARDS: readonly TodayCard[] = ordered(
  import.meta.glob<TodayCard>(['./cards/*.tsx', '!./cards/*.test.tsx'], { eager: true }),
);
