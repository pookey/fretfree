import { lazyPanel } from '../history/lazy-panel';

export const id = 'coming-up';
export const order = 7;
export const title = 'Coming up';

/** Reviews due this week and a month-ahead retention forecast (design §7 Progress). */
export const Panel = lazyPanel(() => import('../history/ComingUp'));
