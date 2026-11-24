import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MOCK_READY_STATUS, mockNativeRuntime, renderApp } from '@/test/render';
import type { AppStatus } from '@/types/bindings/AppStatus';

const TOO_NEW: AppStatus = {
  ...MOCK_READY_STATUS,
  database: 'unavailable',
  schemaVersion: null,
  failure: {
    code: 'database_too_new',
    message: 'database created by a newer version of ARCHIVE (schema 3, supported 1)',
    detail: 'database created by a newer version of ARCHIVE (schema 3, supported 1)',
  },
};

describe('startup with the native core', () => {
  it('opens directly in the language stored in the settings', async () => {
    mockNativeRuntime({ settings_get: () => ({ language: 'en' }) });
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('shows the safe mode when the database cannot be opened, and recovers on retry', async () => {
    let status = TOO_NEW;
    const { calls } = mockNativeRuntime({
      app_status: () => status,
      database_retry: () => status,
    });
    const { user } = renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'ARCHIVE n’a pas pu ouvrir vos données' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/créée par une version plus récente d’ARCHIVE/)).toBeInTheDocument();
    expect(screen.getByText('Vos données n’ont pas été modifiées.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ouvrir le dossier des données' }));
    expect(
      calls.some((call) => call.command === 'storage_open_folder' && call.args?.folder === 'data'),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(
      await screen.findByText('La base de données est toujours inaccessible.'),
    ).toBeInTheDocument();

    status = MOCK_READY_STATUS;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble' }),
    ).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('changes the interface language, stores it and confirms in the new language', async () => {
    const { calls, settings } = mockNativeRuntime();
    const { user } = renderApp('/settings/general');
    await user.click(await screen.findByRole('radio', { name: 'English' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'General' })).toBeInTheDocument();
    expect(calls.find((call) => call.command === 'settings_update')?.args).toEqual({
      patch: { language: 'en' },
    });
    expect(settings.language).toBe('en');
    expect(await screen.findByText('Interface language updated.')).toBeInTheDocument();
  });

  // Testing Library normalizes the whitespace of the page text (non-breaking spaces become spaces), not the
  // expected strings: expected texts are therefore written with plain spaces.
  it('shows the real storage locations and sizes, opens folders and checks integrity', async () => {
    const { calls } = mockNativeRuntime();
    const { user } = renderApp('/settings/storage');
    expect(await screen.findByText(MOCK_READY_STATUS.dataDir)).toBeInTheDocument();
    expect(screen.getByText('2,5 Mo')).toBeInTheDocument();
    expect(screen.getByText('2,6 Mo')).toBeInTheDocument();
    expect(screen.getByText('3 fichiers')).toBeInTheDocument();
    expect(screen.getByText('128 Go sur 512 Go')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Ouvrir le dossier «\u00a0Fichiers importés\u00a0»' }),
    );
    expect(
      calls.some((call) => call.command === 'storage_open_folder' && call.args?.folder === 'files'),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Vérifier l’intégrité' }));
    expect(await screen.findByText('Aucun problème détecté.')).toBeInTheDocument();
  });

  it('reports integrity problems found by the native core', async () => {
    mockNativeRuntime({
      database_check_integrity: () => ({
        ok: false,
        problems: ['foreign key violation in folders (row 3) referencing workspaces'],
        checkedAt: Date.UTC(2026, 10, 21, 13, 5),
      }),
    });
    const { user } = renderApp('/settings/storage');
    await user.click(await screen.findByRole('button', { name: 'Vérifier l’intégrité' }));
    expect(await screen.findByText('Problèmes détectés : 1')).toBeInTheDocument();
    expect(screen.getByText(/foreign key violation in folders/)).toBeInTheDocument();
  });

  it('explains a failed folder opening instead of failing silently', async () => {
    mockNativeRuntime({
      storage_open_folder: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { code: 'storage', message: 'A storage operation failed.' };
      },
    });
    const { user } = renderApp('/settings/storage');
    await user.click(
      await screen.findByRole('button', { name: 'Ouvrir le dossier «\u00a0Journaux\u00a0»' }),
    );
    expect(await screen.findByText('Une opération sur les fichiers a échoué.')).toBeInTheDocument();
  });
});

describe('sidebar storage indicator', () => {
  it('shows the space really used by ARCHIVE and links to the storage settings', async () => {
    mockNativeRuntime();
    const { user } = renderApp('/');
    const indicator = await screen.findByRole('link', { name: /Stockage local/ });
    await waitFor(() => {
      expect(within(indicator).getByText('2,6 Mo utilisés')).toBeInTheDocument();
    });
    await user.click(indicator);
    expect(await screen.findByRole('heading', { level: 1, name: 'Stockage' })).toBeInTheDocument();
  });
});
