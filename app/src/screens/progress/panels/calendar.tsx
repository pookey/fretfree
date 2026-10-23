import { lazyPanel } from '../history/lazy-panel';

export const id = 'calendar';
export const order = 12;
export const title = 'Practice calendar';

/** Session history and streak days (design §7 Progress, §3.7). */
export const Panel = lazyPanel(() => import('../history/PracticeCalendar'));
