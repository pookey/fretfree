import { useAppStore } from '../app-store';
import type { RouteGuard } from '../routes/registry';

export const ONBOARDING_PATH = '/onboarding';

/**
 * First launch → onboarding (design §4). Once onboarding is finished or
 * skipped, `settings.onboardedAt` is set and the guarded route renders.
 */
export const firstLaunchGuard: RouteGuard = async () => {
  if (!useAppStore.getState().loaded) await useAppStore.getState().load();
  return useAppStore.getState().settings.onboardedAt ? null : ONBOARDING_PATH;
};
