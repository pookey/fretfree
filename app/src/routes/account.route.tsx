import { lazyElement } from './lazy-element';
import type { RouteLayout } from './registry';

// No `nav`: an emailed sign-in link lands here (M7-04). Lazy: it is opened
// once per sign-in, so it stays out of first-load JS.
export const path = '/account/verify';
export const layout: RouteLayout = 'shell';
export const element = lazyElement(
  () => import('../account/VerifyScreen').then((m) => m.VerifyScreen),
  'Sign in',
);
