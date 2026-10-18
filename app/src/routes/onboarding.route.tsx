import type { RouteLayout } from './registry';
import { ONBOARDING_PATH } from '../onboarding/guard';
import { OnboardingScreen } from '../onboarding/OnboardingScreen';

export const path = ONBOARDING_PATH;
export const layout: RouteLayout = 'fullscreen';
export const element = <OnboardingScreen />;
