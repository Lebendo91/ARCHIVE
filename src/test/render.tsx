import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/AppProviders';
import { appRoutes } from '@/app/router/routes';

/** Renders the whole application at `path`, with a fresh in-memory router. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, user };
}

/** Renders a component with the application providers (i18n, tooltips). */
export function renderWithProviders(ui: ReactElement) {
  const user = userEvent.setup();
  return { ...render(<AppProviders>{ui}</AppProviders>), user };
}

export const MOCK_APP_INFO = {
  name: 'ARCHIVE',
  version: '0.1.0',
  tauriVersion: '2.12.7',
  commit: 'abc1234def',
  buildProfile: 'release',
  targetOs: 'windows',
  targetArch: 'x86_64',
} as const;
