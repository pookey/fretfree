import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useAppStore } from './app-store';
import { SessionScreen } from './session/SessionScreen';
import { AppShell } from './shell/AppShell';
import { UpdateToast } from './shell/UpdateToast';
import { ExploreScreen } from './screens/ExploreScreen';
import { LearnScreen } from './screens/LearnScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { TodayScreen } from './screens/TodayScreen';

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <TodayScreen /> },
      { path: 'learn', element: <LearnScreen /> },
      { path: 'explore', element: <ExploreScreen /> },
      { path: 'progress', element: <ProgressScreen /> },
    ],
  },
  { path: 'session', element: <SessionScreen /> },
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
