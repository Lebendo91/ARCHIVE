import { createHashRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from './AppProviders';
import { appRoutes } from './router/routes';

/** Hash routing behaves identically in Vite, in the Tauri webview and in Playwright. */
const router = createHashRouter(appRoutes);

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
