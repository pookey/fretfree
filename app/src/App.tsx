import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useAppStore } from './app-store';
import { guardLoader, ROUTES, type RouteModule } from './routes/registry';
import { installStreakSettle } from './session/gamification-bridge';
import { AppShell } from './shell/AppShell';
import { UpdateToast } from './shell/UpdateToast';
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
  return (
    <>
      <RouterProvider router={router} />
      <UpdateToast />
    </>
  );
}
