import { test as base, expect, type Page } from '@playwright/test';

export const MOCK_APP_INFO = {
  name: 'ARCHIVE',
  version: '0.1.0',
  tauriVersion: '2.12.7',
  commit: 'e2e0000000',
  buildProfile: 'release',
  targetOs: 'windows',
  targetArch: 'x86_64',
} as const;

/** Stands in for the native runtime: answers `app_info` and records diagnostics sent by the interface. */
async function installNativeRuntimeDouble(page: Page): Promise<void> {
  await page.addInitScript((appInfo) => {
    const callbacks = new Map<number, (data: unknown) => void>();
    let nextCallbackId = 1;
    const diagnostics: unknown[] = [];
    Object.assign(window, {
      __ARCHIVE_E2E_DIAGNOSTICS__: diagnostics,
      __TAURI_INTERNALS__: {
        invoke: (command: string, args: unknown) => {
          if (command === 'app_info') {
            return Promise.resolve(appInfo);
          }
          if (command === 'log_frontend_event') {
            diagnostics.push(args);
            return Promise.resolve(null);
          }
          return Promise.reject(new Error(`Unexpected command: ${command}`));
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
  }, MOCK_APP_INFO);
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
