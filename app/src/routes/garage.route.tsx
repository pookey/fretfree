import { lazyElement } from './lazy-element';
import type { RouteLayout } from './registry';

// The Garage (design §7 Garage), reached from Progress. No `nav`: the Progress
// entry stays highlighted, as `/progress` prefixes this path. Lazy: the
// screen and the guitar renderer stay out of first-load JS.
export const path = '/progress/garage';
export const layout: RouteLayout = 'shell';
export const element = lazyElement(
  () => import('../screens/garage/GarageScreen').then((m) => m.GarageScreen),
  'the Garage',
);
