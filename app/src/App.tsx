import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useAppStore } from './app-store';
import { guardLoader, ROUTES, type RouteModule } from './routes/registry';
import { NeckSkinProvider } from './components/guitar/skin';
import { installStreakSettle } from './session/gamification-bridge';
import { DeletedNotice } from './account/DeletedNotice';
import { watchAccountDeletion } from './account/resume';
import { AppShell } from './shell/AppShell';
import { UpdateToast } from './shell/UpdateToast';
import { DevUnlockBadge } from './screens/settings/DeveloperTools';
import { getDb } from './storage';

const toRoute = ({ path, element, guard }: RouteModule) =>
  guard ? { path, element, loader: guardLoader(guard) } : { path, element };

// A guarded route waits for its guard (one local read) before the first
// render. Show nothing meanwhile, not even the shell, so a redirect doesn't flash.
const Blank = () => null;

const router = createBrowserRouter([
  {
    element: <AppShell />,
    HydrateFallback: Blank,
    children: ROUTES.filter((r) => r.layout === 'shell').map(toRoute),
  },
  ...ROUTES.filter((r) => r.layout === 'fullscreen').map((r) => ({
    ...toRoute(r),
    HydrateFallback: Blank,
  })),
]);

export function App() {
  const load = useAppStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  // Settle missed days on open and on return to the foreground (design §3.7).
  useEffect(() => installStreakSettle(getDb()), []);
  // Sync with the learner's account, if they have one (M7-05). Loaded on demand.
  useEffect(() => {
    let uninstall: (() => void) | undefined;
    let gone = false;
    // A chunk that fails to load (a navigation cut it off) just means no sync
    // until the next start: everything stays local, as without an account.
    import('./storage/sync/engine')
      .then((m) => {
        if (!gone) uninstall = m.installSync();
      })
      .catch(() => undefined);
    // An account delete from before this page load, or from another tab,
    // carries on from here until the server confirms it (M7-06).
    const unwatch = watchAccountDeletion();
    return () => {
      gone = true;
      uninstall?.();
      unwatch();
    };
  }, []);
  return (
    <>
      <NeckSkinProvider>
        <RouterProvider router={router} />
      </NeckSkinProvider>
      <UpdateToast />
      <DeletedNotice />
      {import.meta.env.DEV && <DevUnlockBadge />}
    </>
  );
}
