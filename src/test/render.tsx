import { mockIPC } from '@tauri-apps/api/mocks';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppBootstrap } from '@/app/AppBootstrap';
import { AppProviders } from '@/app/AppProviders';
import { appRoutes } from '@/app/router/routes';
import { createQueryClient } from '@/services/queries';
import type { CommandName } from '@/services/tauri';
import type { AppSettings } from '@/types/bindings/AppSettings';
import type { AppStatus } from '@/types/bindings/AppStatus';
import type { StorageOverview } from '@/types/bindings/StorageOverview';

/** Renders the whole application at `path`, with a fresh in-memory router and data cache. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <AppProviders queryClient={createQueryClient()}>
      <AppBootstrap>
        <RouterProvider router={router} />
      </AppBootstrap>
    </AppProviders>,
  );
  return { ...view, router, user };
}

/** Renders a component with the application providers (data cache, i18n, tooltips). */
export function renderWithProviders(ui: ReactElement) {
  const user = userEvent.setup();
  return { ...render(<AppProviders queryClient={createQueryClient()}>{ui}</AppProviders>), user };
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

export const MOCK_READY_STATUS: AppStatus = {
  database: 'ready',
  schemaVersion: 1,
  supportedSchemaVersion: 1,
  lastMigration: null,
  failure: null,
  dataDir: 'C:\\Users\\Alice\\AppData\\Local\\io.github.lebendo91.archive',
};

export const MOCK_STORAGE: StorageOverview = {
  dataDir: MOCK_READY_STATUS.dataDir,
  databaseFile: `${MOCK_READY_STATUS.dataDir}\\archive.db`,
  filesDir: `${MOCK_READY_STATUS.dataDir}\\files`,
  backupsDir: `${MOCK_READY_STATUS.dataDir}\\backups`,
  logsDir: `${MOCK_READY_STATUS.dataDir}\\logs`,
  databaseBytes: 98_304,
  filesBytes: 2_621_440,
  filesCount: 3,
  backupsBytes: 0,
  logsBytes: 4_096,
  totalBytes: 2_723_840,
  diskAvailableBytes: 128 * 1024 ** 3,
  diskTotalBytes: 512 * 1024 ** 3,
};

type Handler = (args: Record<string, unknown> | undefined) => unknown;

/**
 * Stands in for the native core: every command answers like a healthy installation unless overridden.
 * Returns the list of calls, to check what the interface sent.
 */
export function mockNativeRuntime(overrides: Partial<Record<CommandName, Handler>> = {}) {
  const settings: AppSettings = { language: 'fr' };
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const handlers: Record<CommandName, Handler> = {
    app_info: () => MOCK_APP_INFO,
    app_status: () => MOCK_READY_STATUS,
    database_retry: () => MOCK_READY_STATUS,
    log_frontend_event: () => null,
    settings_get: () => ({ ...settings }),
    settings_update: (args) => {
      Object.assign(settings, (args as { patch: Partial<AppSettings> }).patch);
      return { ...settings };
    },
    storage_overview: () => MOCK_STORAGE,
    storage_open_folder: () => null,
    database_check_integrity: () => ({
      ok: true,
      problems: [],
      checkedAt: Date.UTC(2026, 10, 21, 13, 5),
    }),
    ...overrides,
  };
  mockIPC((command, args) => {
    calls.push({ command, args: args as Record<string, unknown> | undefined });
    const handler = handlers[command as CommandName] as Handler | undefined;
    if (!handler) {
      throw new Error(`Unexpected command: ${command}`);
    }
    return handler(args as Record<string, unknown> | undefined);
  });
  return { calls, settings };
}
