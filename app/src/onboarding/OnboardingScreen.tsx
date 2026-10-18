import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAppStore } from '../app-store';
import { OnboardingFlow } from './OnboardingFlow';

/** The onboarding route: waits for stored settings so steps start from them, then hands over to Today. */
export function OnboardingScreen() {
  const loaded = useAppStore((s) => s.loaded);
  const load = useAppStore((s) => s.load);
  const navigate = useNavigate();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  if (!loaded) return null;
  return <OnboardingFlow onDone={() => void navigate('/', { replace: true })} />;
}
