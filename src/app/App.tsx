import { createHashRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppBootstrap } from './AppBootstrap';
import { AppProviders } from './AppProviders';
import { appRoutes } from './router/routes';

/** Hash routing behaves identically in Vite, in the Tauri webview and in Playwright. */
const router = createHashRouter(appRoutes);

export function App() {
  return (
    <AppProviders>
      <AppBootstrap>
        <RouterProvider router={router} />
      </AppBootstrap>
    </AppProviders>
  );
}
