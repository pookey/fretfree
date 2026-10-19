import { lazyElement } from './lazy-element';
import type { RouteLayout } from './registry';

// No `nav`: Privacy is reached from Settings and About. Lazy: it is rarely
// opened, so it stays out of first-load JS.
export const path = '/privacy';
export const layout: RouteLayout = 'shell';
export const element = lazyElement(
  () => import('../screens/privacy/PrivacyScreen').then((m) => m.PrivacyScreen),
  'Privacy',
);
