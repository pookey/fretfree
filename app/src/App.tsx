import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useAppStore } from './app-store';
import { guardLoader, ROUTES, type RouteModule } from './routes/registry';
import { AppShell } from './shell/AppShell';
import { UpdateToast } from './shell/UpdateToast';

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
  return (
    <>
      <RouterProvider router={router} />
      <UpdateToast />
    </>
  );
}
