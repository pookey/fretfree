import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useAppStore } from './app-store';
import { ROUTES } from './routes/registry';
import { AppShell } from './shell/AppShell';
import { UpdateToast } from './shell/UpdateToast';

const toRoute = ({ path, element }: (typeof ROUTES)[number]) => ({ path, element });

const router = createBrowserRouter([
  { element: <AppShell />, children: ROUTES.filter((r) => r.layout === 'shell').map(toRoute) },
  ...ROUTES.filter((r) => r.layout === 'fullscreen').map(toRoute),
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
