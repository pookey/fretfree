import { lazyElement } from './lazy-element';
import type { RouteLayout } from './registry';

// No `nav`: About is reached from Settings. Lazy: it is rarely opened, so it
// stays out of first-load JS.
export const path = '/about';
export const layout: RouteLayout = 'shell';
export const element = lazyElement(
  () => import('../screens/about/AboutScreen').then((m) => m.AboutScreen),
  'About',
);
