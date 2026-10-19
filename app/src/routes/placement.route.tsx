import { lazyElement } from './lazy-element';
import type { RouteLayout } from './registry';
import { firstLaunchGuard } from '../onboarding/guard';

// No `nav`: the retake is reached from Settings. Lazy: it is rarely opened,
// so it stays out of first-load JS.
export const path = '/placement';
export const layout: RouteLayout = 'fullscreen';
export const guard = firstLaunchGuard;
export const element = lazyElement(
  () => import('../placement/RetakeScreen').then((m) => m.RetakeScreen),
  'the placement test',
);
