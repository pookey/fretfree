import type { ComponentType } from 'react';
import { ordered, type Ordered } from '../../registry';

/** What every `explore/views/<id>.tsx` file exports. */
export interface ExploreView extends Ordered {
  title: string;
  View: ComponentType;
}

/**
 * The Explore reference tools (design §7), listed by `order`. One file per
 * view: each `views/<id>.tsx` is registered automatically.
 */
export const EXPLORE_VIEWS: readonly ExploreView[] = ordered(
  import.meta.glob<ExploreView>(['./views/*.tsx', '!./views/*.test.tsx'], { eager: true }),
);
