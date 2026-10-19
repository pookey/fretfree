import { lazyElement } from './lazy-element';
import type { RouteLayout } from './registry';
import { ONBOARDING_PATH } from '../onboarding/guard';

// Lazy: it runs once per learner, so it stays out of first-load JS.
export const path = ONBOARDING_PATH;
export const layout: RouteLayout = 'fullscreen';
export const element = lazyElement(
  () => import('../onboarding/OnboardingScreen').then((m) => m.OnboardingScreen),
  'setup',
);
