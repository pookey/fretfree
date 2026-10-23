import { lazyPanel } from '../history/lazy-panel';

export const id = 'over-time';
export const order = 6;
export const title = 'Over time';

/** What you know and how fast, day by day (design §7 Progress, research/02 rule 15). */
export const Panel = lazyPanel(() => import('../history/OverTime'));
