import type { RouteLayout } from './registry';
import { firstLaunchGuard } from '../onboarding/guard';
import { RetakeScreen } from '../placement/RetakeScreen';

// No `nav`: the retake is reached from Settings.
export const path = '/placement';
export const layout: RouteLayout = 'fullscreen';
export const guard = firstLaunchGuard;
export const element = <RetakeScreen />;
