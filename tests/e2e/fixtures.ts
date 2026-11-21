import { test as base, expect, type Page } from '@playwright/test';
import { createCoreDouble, type CoreDoubleState } from '../../src/test/coreDouble';

export const MOCK_APP_INFO = {
  name: 'ARCHIVE',
  version: '0.1.0',
  tauriVersion: '2.12.7',
  commit: 'e2e0000000',
  buildProfile: 'release',
  targetOs: 'windows',
  targetArch: 'x86_64',
} as const;

export const MOCK_DATA_DIR = 'C:\\Users\\Alice\\AppData\\Local\\io.github.lebendo91.archive';

const CORE_KEY = 'archive-e2e-core';

/**
 * The function that installs the double in the page. Like any init script, it is serialized: it only uses its
 * arguments, among which the in-memory core shared with the unit tests (`src/test/coreDouble.ts`).
 */
function nativeRuntimeDouble(
  {
    appInfo,
    dataDir,
    coreKey,
  }: { appInfo: typeof MOCK_APP_INFO; dataDir: string; coreKey: string },
  createCore: typeof createCoreDouble,
) {
  const callbacks = new Map<number, (data: unknown) => void>();
  let nextCallbackId = 1;
  const diagnostics: unknown[] = [];
  const readyStatus = {
    database: 'ready',
    schemaVersion: 1,
    supportedSchemaVersion: 1,
    lastMigration: null,
    failure: null,
    dataDir,
  };
  const status = () =>
    sessionStorage.getItem('archive-e2e-scenario') === 'safe-mode'
      ? {
          ...readyStatus,
          database: 'unavailable',
          schemaVersion: null,
          failure: {
            code: 'database_too_new',
            message: 'database created by a newer version of ARCHIVE (schema 3, supported 1)',
            detail: 'database created by a newer version of ARCHIVE (schema 3, supported 1)',
          },
        }
      : readyStatus;
  const settings = () =>
    JSON.parse(sessionStorage.getItem('archive-e2e-settings') ?? '{"language":"fr"}') as Record<
      string,
      unknown
    >;
  // Created on the first command, once every init script (seeds included) has run.
  let core: ReturnType<typeof createCore> | undefined;
  const coreHandlers = () => {
    core ??= createCore(
      JSON.parse(sessionStorage.getItem(coreKey) ?? 'null') as Partial<CoreDoubleState> | null,
      (state) => {
        sessionStorage.setItem(coreKey, JSON.stringify(state));
      },
    );
    return core.handlers;
  };
  const handlers: Record<string, (args: Record<string, unknown> | undefined) => unknown> = {
    app_info: () => appInfo,
    app_status: status,
    database_retry: status,
    settings_get: settings,
    settings_update: (args) => {
      const next = { ...settings(), ...(args?.patch as Record<string, unknown>) };
      sessionStorage.setItem('archive-e2e-settings', JSON.stringify(next));
      return next;
    },
    storage_overview: () => ({
      dataDir,
      databaseFile: `${dataDir}\\archive.db`,
      filesDir: `${dataDir}\\files`,
      backupsDir: `${dataDir}\\backups`,
      logsDir: `${dataDir}\\logs`,
      databaseBytes: 98_304,
      filesBytes: 0,
      filesCount: 0,
      backupsBytes: 0,
      logsBytes: 4_096,
      totalBytes: 102_400,
      diskAvailableBytes: 128 * 1024 ** 3,
      diskTotalBytes: 512 * 1024 ** 3,
    }),
    storage_open_folder: () => null,
    database_check_integrity: () => ({ ok: true, problems: [], checkedAt: Date.now() }),
    log_frontend_event: (args) => {
      diagnostics.push(args);
      return null;
    },
  };
  for (const command of [
    'workspaces_list',
    'workspaces_get',
    'workspaces_create',
    'workspaces_update',
    'workspaces_set_archived',
    'workspaces_delete',
    'dashboard_overview',
    'timeline_list',
  ]) {
    handlers[command] = (args) => coreHandlers()[command]?.(args);
  }
  Object.assign(window, {
    __ARCHIVE_E2E_DIAGNOSTICS__: diagnostics,
    __TAURI_INTERNALS__: {
      invoke: (command: string, args: Record<string, unknown> | undefined) => {
        const handler = handlers[command];
        return handler
          ? new Promise((resolve) => {
              resolve(handler(args));
            })
          : Promise.reject(new Error(`Unexpected command: ${command}`));
      },
      transformCallback: (callback: (data: unknown) => void) => {
        const id = nextCallbackId;
        nextCallbackId += 1;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback: (id: number) => {
        callbacks.delete(id);
      },
    },
  });
}

/**
 * Stands in for the native runtime. It answers every command like a healthy installation, keeps the
 * settings and the knowledge base in sessionStorage (so they survive a reload, like the real database),
 * records the diagnostics sent by the interface, and can simulate the safe mode
 * (`sessionStorage['archive-e2e-scenario']`).
 */
async function installNativeRuntimeDouble(page: Page): Promise<void> {
  const options = { appInfo: MOCK_APP_INFO, dataDir: MOCK_DATA_DIR, coreKey: CORE_KEY };
  await page.addInitScript({
    content: `(${nativeRuntimeDouble.toString()})(${JSON.stringify(options)}, ${createCoreDouble.toString()});`,
  });
}

/** Starts the test with this knowledge base (kept across reloads, like a real database). */
export async function seedCore(page: Page, state: Partial<CoreDoubleState>): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem(key) === null) {
        sessionStorage.setItem(key, value);
      }
    },
    { key: CORE_KEY, value: JSON.stringify(state) },
  );
}

/**
 * Every test runs with the native runtime double and fails if the page logs a console error, throws an
 * uncaught error, or reports a diagnostic (uncaught error, unhandled rejection, CSP violation).
 */
export const test = base.extend<{ guard: undefined }>({
  guard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      await installNativeRuntimeDouble(page);
      await use(undefined);
      const diagnostics = await page
        .evaluate(
          () =>
            (window as unknown as { __ARCHIVE_E2E_DIAGNOSTICS__?: unknown[] })
              .__ARCHIVE_E2E_DIAGNOSTICS__ ?? [],
        )
        .catch(() => []);
      expect(errors, 'console errors').toEqual([]);
      expect(diagnostics, 'diagnostics reported by the interface').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Waits until the bundled fonts are ready, so that layout and screenshots are final. */
export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export const ROUTES: readonly { path: string; title: string; name: string }[] = [
  { path: '/', title: 'Vue d’ensemble', name: 'overview' },
  { path: '/library', title: 'Bibliothèque', name: 'library' },
  { path: '/notes', title: 'Notes', name: 'notes' },
  { path: '/graph', title: 'Graphe de connaissances', name: 'graph' },
  { path: '/timeline', title: 'Chronologie', name: 'timeline' },
  { path: '/assistant', title: 'Assistant IA', name: 'assistant' },
  { path: '/workspaces', title: 'Espaces de travail', name: 'workspaces' },
  { path: '/favorites', title: 'Favoris', name: 'favorites' },
  { path: '/recent', title: 'Récemment ouverts', name: 'recent' },
  { path: '/archived', title: 'Archives', name: 'archived' },
  { path: '/settings/general', title: 'Général', name: 'settings-general' },
  { path: '/settings/appearance', title: 'Apparence', name: 'settings-appearance' },
  { path: '/settings/storage', title: 'Stockage', name: 'settings-storage' },
  { path: '/settings/ai', title: 'Intelligence artificielle', name: 'settings-ai' },
  { path: '/settings/shortcuts', title: 'Raccourcis clavier', name: 'settings-shortcuts' },
  { path: '/settings/about', title: 'À propos', name: 'settings-about' },
  { path: '/help', title: 'Aide', name: 'help' },
  { path: '/missing-page', title: 'Page introuvable', name: 'not-found' },
];
